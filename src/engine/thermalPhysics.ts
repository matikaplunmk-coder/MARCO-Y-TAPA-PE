import type { CoolingCurve, ProcessParams } from '../types/simulation';
import { volumeFraction } from './mechanicalPhysics';

// --- Propiedades termofísicas del composite PEAD + FV (todas parametrizadas) -------------

/** Conductividad del composite (W/m·K): valor manual o modelo de Maxwell */
export function conductivity(p: ProcessParams): number {
  if (!p.kAuto) return p.kComposite;
  const vf = volumeFraction(p);
  const km = p.kMatrix;
  const kf = p.kFiber;
  return km * (kf + 2 * km + 2 * vf * (kf - km)) / (kf + 2 * km - vf * (kf - km));
}

export function density(p: ProcessParams): number {
  const vf = volumeFraction(p);
  return vf * p.rhoFiber * 1000 + (1 - vf) * p.rhoMatrix * 1000;
}

/** Calor específico aparente (incluye pico de cristalización) en J/kg·K */
export function apparentCp(p: ProcessParams, tC: number): number {
  const wf = p.glassPct / 100;
  const base = wf * p.cpFiber + (1 - wf) * p.cpMatrix;
  const latent = (1 - wf) * (p.crystFracPct / 100) * p.latentKJkg * 1000;
  const sg = Math.max(0.5, p.crystWidthC);
  const gauss = Math.exp(-0.5 * ((tC - p.crystTempC) / sg) ** 2) / (sg * Math.sqrt(2 * Math.PI));
  return base + latent * gauss;
}

/** Coeficiente de expansión térmica lineal efectivo (Turner), 1/K */
export function thermalExpansion(p: ProcessParams): number {
  const vf = volumeFraction(p);
  const Em = p.eMatrixMPa;
  const Ef = p.eFiberGPa * 1000;
  const num = p.alphaMatrix * 1e-6 * Em * (1 - vf) + p.alphaFiber * 1e-6 * Ef * vf;
  const den = Em * (1 - vf) + Ef * vf;
  return num / den;
}

/** Contracción total de moldeo (cristalización + térmica), en % */
export function moldShrinkagePct(p: ProcessParams, demoldTempC: number): number {
  const vf = volumeFraction(p);
  const cryst = (p.shrinkCrystPct / 100) * Math.exp(-p.shrinkDecay * vf);
  const thermal = thermalExpansion(p) * Math.max(0, demoldTempC - p.ambientC);
  return (cryst + thermal) * 100;
}

// --- Coeficientes de transferencia (m²·K/W, W/m²·K) derivados de los parámetros ----------
function filmCoefficients(p: ProcessParams) {
  const rSteel = p.steelThkMm / 1000 / p.kSteel;
  return {
    hPress: 1 / (rSteel + p.contactResPress * 1e-3),
    hAir: p.hAir,
    hBath: 1 / (rSteel + 1 / p.hWater + p.contactResBath * 1e-3),
  };
}

const NODES = 41;

/** Resuelve un paso implícito (tridiagonal) del problema 1D en media placa (simetría en el centro). */
function stepImplicit(T: Float64Array, p: ProcessParams, k: number, rho: number, dz: number, dt: number, h: number, tInf: number) {
  const n = T.length;
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const cp = apparentCp(p, T[i]);
    const cap = rho * cp * dz;
    const kd = k / dz;
    if (i === 0) {
      const m = cap / 2 / dt;
      b[i] = m + kd;
      c[i] = -kd;
      d[i] = m * T[i];
    } else if (i === n - 1) {
      const m = cap / 2 / dt;
      a[i] = -kd;
      b[i] = m + kd + h;
      d[i] = m * T[i] + h * tInf;
    } else {
      const m = cap / dt;
      a[i] = -kd;
      c[i] = -kd;
      b[i] = m + 2 * kd;
      d[i] = m * T[i];
    }
  }
  // Algoritmo de Thomas
  for (let i = 1; i < n; i++) {
    const w = a[i] / b[i - 1];
    b[i] -= w * c[i - 1];
    d[i] -= w * d[i - 1];
  }
  T[n - 1] = d[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) T[i] = (d[i] - c[i] * T[i + 1]) / b[i];
}

export interface CoolingTimes {
  pressS: number;
  openS: number;
  craneS: number;
}

/**
 * Curva de enfriamiento núcleo/superficie de la nervadura crítica.
 * Fases: prensa (molde a 60 °C) → apertura y traslado en aire → batea con agua recirculada.
 * Condición inicial: perfil uniforme a la temperatura de masa fundida (T_0).
 * El eje de tiempo comienza al iniciar el prensado. Se simula hasta el horizonte de búsqueda (searchHorizonMin) tras entrar en batea,
 * de modo que el tiempo para alcanzar la temperatura objetivo se obtiene de la propia curva.
 */
export function simulateCooling(
  p: ProcessParams,
  times: CoolingTimes,
  targetC: number,
  filmOverride?: Partial<{ hPress: number; hAir: number; hBath: number }>,
): CoolingCurve {
  const L = p.ribThkMm / 1000 / 2; // media espesor
  const dz = L / (NODES - 1);
  const rho = density(p);
  const k = conductivity(p);
  const film = { ...filmCoefficients(p), ...filmOverride };
  const T = new Float64Array(NODES).fill(p.meltTempC);

  const tPressEnd = times.pressS;
  const tBathIn = times.pressS + times.openS + times.craneS;
  const tEnd = tBathIn + p.searchHorizonMin * 60;
  const dt = 1;
  const sample = 5;

  const t: number[] = [];
  const core: number[] = [];
  const surface: number[] = [];
  let timeToTarget = Infinity;

  for (let s = 0; s <= tEnd; s += dt) {
    if (s % sample === 0) {
      t.push(s);
      core.push(T[0]);
      surface.push(T[NODES - 1]);
    }
    if (timeToTarget === Infinity && s >= tBathIn && T[0] <= targetC) timeToTarget = s - tBathIn;
    let h = film.hBath;
    let tInf = p.bathTempC;
    if (s < tPressEnd) {
      h = film.hPress;
      tInf = p.moldTempC;
    } else if (s < tBathIn) {
      h = film.hAir;
      tInf = p.ambientC;
    }
    stepImplicit(T, p, k, rho, dz, dt, h, tInf);
  }
  return applyDwell(
    {
      t,
      core,
      surface,
      tBathIn,
      tPressEnd,
      targetC,
      timeToTargetS: timeToTarget,
      coreAtDwell: NaN,
      surfaceAtDwell: NaN,
      dwellS: 0,
    },
    0,
  );
}

/** Fija la permanencia en batea y evalúa temperaturas de núcleo/superficie en el instante de extracción */
export function applyDwell(curve: CoolingCurve, dwellS: number): CoolingCurve {
  const k = curve.tBathIn + dwellS;
  return {
    ...curve,
    dwellS,
    coreAtDwell: sampleCurve(curve, k, 'core'),
    surfaceAtDwell: sampleCurve(curve, k, 'surface'),
  };
}

/** Interpola la temperatura (núcleo o superficie) en el instante k de la curva */
export function sampleCurve(curve: CoolingCurve, k: number, which: 'core' | 'surface' = 'core', meltC?: number): number {
  const arr = curve[which];
  if (k <= 0) return meltC ?? arr[0];
  const i = k / 5;
  const i0 = Math.min(arr.length - 1, Math.floor(i));
  const i1 = Math.min(arr.length - 1, i0 + 1);
  const f = i - i0;
  return arr[i0] * (1 - f) + arr[i1] * f;
}

/** Índice de alabeo (mm/m) a partir del gradiente núcleo-superficie al desmoldear */
export function warpIndex(p: ProcessParams, coreC: number, surfC: number): number {
  const alpha = thermalExpansion(p);
  const dEps = alpha * Math.max(0, coreC - surfC);
  // Contracción diferencial residual acumulada hasta ambiente: núcleo caliente se contrae más tarde
  const residual = alpha * Math.max(0, coreC - p.ambientC) * p.warpResidualWeight;
  return (dEps * p.warpDiffWeight + residual) * 1000 * p.warpScale;
}
