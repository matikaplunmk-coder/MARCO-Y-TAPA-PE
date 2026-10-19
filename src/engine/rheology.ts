import type { PartSpec, ProcessParams } from '../types/simulation';
import type { IntrusionParams, PeType, RheologyResult } from '../types/intrusion';
import { volumeFraction } from './mechanicalPhysics';
import { slugMassKg } from './processModel';

/** Tipos de PE de partida (MFI a 190 °C / 2,16 kg, g/10 min) */
export const PE_TYPES: Record<Exclude<PeType, 'CUSTOM'>, { label: string; mfi: number }> = {
  PE100: { label: 'PE100 (tubería, MFI 0,2)', mfi: 0.2 },
  PE80: { label: 'PE80 (tubería, MFI 0,4)', mfi: 0.4 },
  RECYCLED: { label: 'PEAD reciclado genérico (MFI 0,8)', mfi: 0.8 },
  VIRGIN: { label: 'PEAD virgen (MFI 2,0)', mfi: 2.0 },
};

// Geometría y carga normalizadas del ensayo ISO 1133 (190 °C / 2,16 kg): son constantes del método de medida.
const ISO1133 = { dieRadiusMm: 1.0475, wallShearPa: 19400, meltDensity: 0.76, refTempK: 463.15 };
const R_GAS = 8.314;

/** Consistencia de ley de potencias m (Pa·s^n) a la temperatura T, calibrada con el MFI */
export function powerLawConsistency(mfi: number, n: number, tempC: number, EaKJmol: number): number {
  const qMm3s = (mfi / 600 / ISO1133.meltDensity) * 1000;
  const shearApparent = (4 * qMm3s) / (Math.PI * ISO1133.dieRadiusMm ** 3);
  const m190 = ISO1133.wallShearPa / Math.pow(shearApparent, n);
  const T = tempC + 273.15;
  return m190 * Math.exp(((EaKJmol * 1000) / R_GAS) * (1 / T - 1 / ISO1133.refTempK));
}

/** Incremento de viscosidad por fibra (Einstein/Thomas con corrección por relación de aspecto) */
export function fiberViscosityFactor(phi: number, aspect: number, coeff: number): number {
  const asp = 1 + coeff * Math.log(Math.max(1, aspect / 10));
  return 1 + 2.5 * phi * asp + 14.1 * phi * phi;
}

/** Eficiencia de la interfase fibra-matriz según el % de PE-g-MA (0 % → eficiencia sin acoplante) */
export function couplingEfficiency(p: IntrusionParams): number {
  return p.uncoupledEff + (1 - p.uncoupledEff) * (1 - Math.exp(-p.couplingPct / Math.max(1e-6, p.couplingScalePct)));
}

/** Resistencia de cizalla interfacial (MPa) */
export function interfacialShear(p: IntrusionParams): number {
  const f = 1 - Math.exp(-p.couplingPct / Math.max(1e-6, p.couplingScalePct));
  return p.tauUncoupledMPa + (p.tauCoupledMPa - p.tauUncoupledMPa) * f;
}

/** Densidad del fundido del compuesto (kg/m³) */
export function meltDensity(a: ProcessParams, p: IntrusionParams): number {
  const vf = volumeFraction({ glassPct: p.glassPct, rhoFiber: a.rhoFiber, rhoMatrix: a.rhoMatrix });
  return vf * a.rhoFiber * 1000 + (1 - vf) * a.rhoMatrix * 1000 * p.meltDensityRatio;
}

/** Masa total de inyección por pieza (con rebaba/purga) */
export function shotMassKg(a: ProcessParams, p: IntrusionParams): number {
  return slugMassKg({ ...a, overweightPct: p.flashPct });
}

/** Tiempo de llenado de una cavidad (s) = masa neta × (1 + rebaba) / caudal másico */
export function fillTimeS(a: ProcessParams, p: IntrusionParams): number {
  return (shotMassKg(a, p) / p.extruderKgH) * 3600;
}

/**
 * Reología completa del Método B: viscosidad, atrición de fibra, relación de aspecto final,
 * caída de presión en bebedero (ley de potencias, canal cónico) y en la cavidad (flujo radial entre placas).
 */
export function analyzeRheology(a: ProcessParams, part: PartSpec, p: IntrusionParams): RheologyResult {
  const n = p.powerLawN;
  const phi = volumeFraction({ glassPct: p.glassPct, rhoFiber: a.rhoFiber, rhoMatrix: a.rhoMatrix });
  const d = p.fiberDiamUm / 1000; // mm
  const m = powerLawConsistency(p.mfi, n, p.meltTempC, p.meltEaKJmol);

  // Tornillo: RPM necesarias para el caudal, cizalla en el canal y viscosidad relativa
  const dCm = p.screwDiaMm / 10;
  const rpm = p.extruderKgH / (p.screwCapacityCoeff * dCm ** 3);
  const shearScrew = (Math.PI * rpm) / (60 * p.channelDepthRatio);
  const etaScrew = m * Math.pow(shearScrew, n - 1);
  const aspect0 = p.fiberL0Mm / d;
  const fiberFactorScrew = fiberViscosityFactor(phi, aspect0, p.viscFiberCoeff);
  const etaRel = (etaScrew * fiberFactorScrew) / p.etaRefPas;

  // Atrición: L = L0 · exp(−k · RPM · (L/D)_efectivo / η_rel)
  const ldEff = p.fiberFeed === 'hopper' ? p.screwLD : Math.min(p.screwLD, p.sideFeederLD);
  const X = (p.kCut * rpm * ldEff) / etaRel;
  const lScrew = Math.max(2 * d, p.fiberL0Mm * Math.exp(-X));

  // Caudal volumétrico y bebedero
  const rho = meltDensity(a, p);
  const Q = p.extruderKgH / 3600 / rho; // m³/s
  const aspectScrew = lScrew / d;
  const fiberFactor = fiberViscosityFactor(phi, aspectScrew, p.viscFiberCoeff);
  const mEff = m * fiberFactor;
  const rIn = p.sprueDiaMm / 2000; // m
  const tanA = Math.tan((p.sprueTaperDeg * Math.PI) / 180);
  const L = p.sprueLenMm / 1000;
  const rOut = rIn + L * tanA;
  const A = Math.pow(((3 * n + 1) / (4 * n)) * ((4 * Q) / Math.PI), n);
  const dPsprue =
    ((2 * mEff) / (3 * n * tanA)) * A * Math.abs(1 / Math.pow(rIn, 3 * n) - 1 / Math.pow(rOut, 3 * n));
  // Pérdida de entrada/transición: la arista viva (radio 0) la encarece; el acuerdo la reduce
  const transition = 1 + 0.35 * Math.exp(-p.filletMm / Math.max(1, p.sprueDiaMm * 0.15));
  const dPsprueTot = dPsprue * transition;
  const wallShear = ((3 * n + 1) / (4 * n)) * ((4 * Q) / (Math.PI * rIn ** 3));

  // Cavidad: flujo radial desde la salida del bebedero hasta el borde, espesor medio V/A
  const effArea = Math.max(1e-4, part.projectedAreaM2);
  const volM3 = a.massKg / ((a.rhoMatrix * 1000 * (1 - phi)) + (a.rhoFiber * 1000 * phi));
  const H = Math.max(0.004, volM3 / effArea);
  const R = Math.sqrt(effArea / Math.PI);
  const r0 = Math.min(rOut, R * 0.5);
  const dPcav =
    ((2 * mEff) / H) *
    Math.pow(((2 * n + 1) / n) * (Q / (Math.PI * H * H)), n) *
    ((Math.pow(R, 1 - n) - Math.pow(r0, 1 - n)) / (1 - n));

  const dPtotal = dPsprueTot + dPcav;

  // Atrición adicional en la arista viva de entrada al plano de la tapa
  const lFinal = Math.max(2 * d, lScrew * (1 - p.edgeBreak * Math.exp(-p.filletMm / 5)));
  const aspectFinal = lFinal / d;
  const tau = interfacialShear(p);
  const lc = (p.fiberStrengthMPa * d) / (2 * tau);
  const lenEff = lFinal >= lc ? 1 - lc / (2 * lFinal) : lFinal / (2 * lc);

  return {
    rpm,
    shearRateScrew: shearScrew,
    etaScrewPas: etaScrew,
    etaRel,
    powerLawM: m,
    fiberFactor,
    attritionExponent: X,
    fiberLengthMm: lScrew,
    fiberLengthFinalMm: lFinal,
    aspectRatio: aspectFinal,
    couplingEff: couplingEfficiency(p),
    tauMPa: tau,
    criticalLengthMm: lc,
    lengthEff: lenEff,
    sprueWallShear: wallShear,
    dPsprueBar: dPsprueTot / 1e5,
    dPcavityBar: dPcav / 1e5,
    dPtotalBar: dPtotal / 1e5,
    fillS: fillTimeS(a, p),
    flowM3s: Q,
    flowThickMm: H * 1000,
    moldOpenKN: (0.5 * dPcav * effArea) / 1000,
    boltCapacityKN: p.boltCount * p.boltCapacityKN,
    sprueExitMm: rOut * 2000,
  };
}
