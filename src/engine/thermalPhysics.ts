import type { CoolingCurve, ProcessParams } from '../types/simulation';
import { volumeFraction, RHO_FIBER, RHO_MATRIX } from './mechanicalPhysics';

// --- Propiedades termofísicas del composite PEAD + FV ---------------------------------
const K_MATRIX = 0.45; // W/m·K  PEAD
const K_FIBER = 1.0; // W/m·K  vidrio E
const CP_MATRIX = 2300; // J/kg·K PEAD sólido
const CP_FIBER = 800; // J/kg·K vidrio E
const ALPHA_MATRIX = 150e-6; // 1/K  expansión lineal PEAD
const ALPHA_FIBER = 5e-6; // 1/K
const E_MATRIX = 1100;
const E_FIBER = 72000;
const LATENT_J_KG = 200e3; // calor de cristalización PEAD 100 % cristalino ≈ 290 kJ/kg; usamos Xc≈0.6·...
const XC = 0.6;
const T_CRYST = 117; // °C pico de cristalización en enfriamiento
const SIGMA_CRYST = 6;

/** Conductividad del composite (modelo de Maxwell) */
export function conductivity(glassPct: number): number {
  const vf = volumeFraction(glassPct);
  const km = K_MATRIX;
  const kf = K_FIBER;
  return km * (kf + 2 * km + 2 * vf * (kf - km)) / (kf + 2 * km - vf * (kf - km));
}

export function density(glassPct: number): number {
  const vf = volumeFraction(glassPct);
  return vf * RHO_FIBER * 1000 + (1 - vf) * RHO_MATRIX * 1000;
}

/** Calor específico aparente (incluye pico de cristalización) en J/kg·K */
export function apparentCp(glassPct: number, tC: number): number {
  const wf = glassPct / 100;
  const base = wf * CP_FIBER + (1 - wf) * CP_MATRIX;
  const latent = (1 - wf) * XC * LATENT_J_KG;
  const gauss = Math.exp(-0.5 * ((tC - T_CRYST) / SIGMA_CRYST) ** 2) / (SIGMA_CRYST * Math.sqrt(2 * Math.PI));
  return base + latent * gauss;
}

/** Coeficiente de expansión térmica lineal efectivo (Turner) */
export function thermalExpansion(glassPct: number): number {
  const vf = volumeFraction(glassPct);
  const num = ALPHA_MATRIX * E_MATRIX * (1 - vf) + ALPHA_FIBER * E_FIBER * vf;
  const den = E_MATRIX * (1 - vf) + E_FIBER * vf;
  return num / den;
}

/** Contracción total de moldeo (cristalización + térmica), en % */
export function moldShrinkagePct(glassPct: number, demoldTempC: number): number {
  const vf = volumeFraction(glassPct);
  const cryst = 0.024 * Math.exp(-8 * vf);
  const thermal = thermalExpansion(glassPct) * Math.max(0, demoldTempC - 23);
  return (cryst + thermal) * 100;
}

// --- Resistencias de contacto/convección (m²·K/W) -------------------------------------
const R_STEEL = 0.04 / 45; // 40 mm de acero
const H_PRESS = 1 / (R_STEEL + 0.6e-3); // contacto con molde a presión
const H_AIR = 22; // traslado en aire (molde cerrado, aislado por masa de acero)
const H_BATH = 1 / (R_STEEL + 1 / 800 + 2.5e-3); // agua recirculada + holgura por contracción
const T_MOLD_PRESS = 60; // °C temperatura del molde en prensa
const T_AMB = 25;

const NODES = 41;

/** Resuelve un paso implícito (tridiagonal) del problema 1D en media placa (simetría en el centro). */
function stepImplicit(T: Float64Array, wf: number, k: number, rho: number, dz: number, dt: number, h: number, tInf: number) {
  const n = T.length;
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const cp = apparentCp(wf * 100, T[i]);
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
  dwellS: number;
}

/**
 * Curva de enfriamiento núcleo/superficie de la nervadura crítica.
 * Fases: prensa (molde a 60 °C) → apertura y traslado en aire → batea con agua recirculada.
 * El eje de tiempo comienza al iniciar el prensado.
 */
export function simulateCooling(p: ProcessParams, times: CoolingTimes): CoolingCurve {
  const L = p.ribThkMm / 1000 / 2; // media espesor
  const dz = L / (NODES - 1);
  const rho = density(p.glassPct);
  const k = conductivity(p.glassPct);
  const T = new Float64Array(NODES).fill(p.meltTempC - 4); // ligera caída durante la carga
  const wf = p.glassPct / 100;

  const tPressEnd = times.pressS;
  const tBathIn = times.pressS + times.openS + times.craneS;
  const tEnd = tBathIn + Math.max(45 * 60, times.dwellS + 600);
  const dt = 1;
  const sample = 5;

  const t: number[] = [];
  const core: number[] = [];
  const surface: number[] = [];
  let timeToCore50 = Infinity;
  let coreAtDwell = NaN;
  let surfAtDwell = NaN;

  for (let s = 0; s <= tEnd; s += dt) {
    if (s % sample === 0) {
      t.push(s);
      core.push(T[0]);
      surface.push(T[NODES - 1]);
    }
    if (timeToCore50 === Infinity && s >= tBathIn && T[0] < 50) timeToCore50 = s - tBathIn;
    if (Number.isNaN(coreAtDwell) && s >= tBathIn + times.dwellS) {
      coreAtDwell = T[0];
      surfAtDwell = T[NODES - 1];
    }
    let h = H_BATH;
    let tInf = p.bathTempC;
    if (s < tPressEnd) {
      h = H_PRESS;
      tInf = T_MOLD_PRESS;
    } else if (s < tBathIn) {
      h = H_AIR;
      tInf = T_AMB;
    }
    stepImplicit(T, wf, k, rho, dz, dt, h, tInf);
  }
  if (Number.isNaN(coreAtDwell)) {
    coreAtDwell = T[0];
    surfAtDwell = T[NODES - 1];
  }
  return {
    t,
    core,
    surface,
    tBathIn,
    tPressEnd,
    timeToCore50S: timeToCore50,
    coreAtDwell,
    surfaceAtDwell: surfAtDwell,
    dwellS: times.dwellS,
  };
}

/** Interpola la temperatura (núcleo o superficie) en el instante k de la curva */
export function sampleCurve(curve: CoolingCurve, k: number, which: 'core' | 'surface' = 'core', meltC = 190): number {
  const arr = curve[which];
  if (k <= 0) return meltC - 4;
  const i = k / 5;
  const i0 = Math.min(arr.length - 1, Math.floor(i));
  const i1 = Math.min(arr.length - 1, i0 + 1);
  const f = i - i0;
  return arr[i0] * (1 - f) + arr[i1] * f;
}

/** Índice de alabeo (mm/m) a partir del gradiente núcleo-superficie al desmoldear */
export function warpIndex(glassPct: number, coreC: number, surfC: number): number {
  const dEps = thermalExpansion(glassPct) * Math.max(0, coreC - surfC);
  // Contracción diferencial residual acumulada hasta ambiente: núcleo caliente se contrae más tarde
  const residual = thermalExpansion(glassPct) * Math.max(0, coreC - 25) * 0.25;
  return (dEps * 0.6 + residual) * 1000 * 1.8;
}
