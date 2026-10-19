import type { PartSpec, ProcessParams } from '../types/simulation';
import type { IntrusionParams, MassBreakdown, RheologyResult } from '../types/intrusion';
import { type CageSpec, volumeFraction } from './mechanicalPhysics';

/**
 * Módulo del compuesto del Método B: Halpin-Tsai con la relación de aspecto REAL (L_final/d) y
 * el módulo de fibra efectivo reducido por la eficiencia de la interfase (PE-g-MA).
 */
export function intrusionModulus(a: ProcessParams, b: IntrusionParams, r: RheologyResult): { E: number; EL: number; ET: number } {
  const vf = volumeFraction({ glassPct: b.glassPct, rhoFiber: a.rhoFiber, rhoMatrix: a.rhoMatrix });
  const Em = a.eMatrixMPa;
  const Ef = a.eFiberGPa * 1000 * r.couplingEff;
  const ratio = Ef / Em;
  const xi = 2 * r.aspectRatio;
  const etaL = (ratio - 1) / (ratio + xi);
  const etaT = (ratio - 1) / (ratio + 2);
  const EL = (Em * (1 + xi * etaL * vf)) / (1 - etaL * vf);
  const ET = (Em * (1 + 2 * etaT * vf)) / (1 - etaT * vf);
  return { E: 0.375 * EL + 0.625 * ET, EL, ET };
}

/** Resistencia última (Kelly-Tyson): matriz + fibra con eficiencia de longitud y de orientación */
export function intrusionStrength(a: ProcessParams, b: IntrusionParams, r: RheologyResult): number {
  const vf = volumeFraction({ glassPct: b.glassPct, rhoFiber: a.rhoFiber, rhoMatrix: a.rhoMatrix });
  let s = a.sigmaMatrixMPa * (1 - vf) + b.orientEff * r.lengthEff * vf * b.fiberStrengthMPa;
  if (b.glassPct > a.glassOverloadPct) s -= (b.glassPct - a.glassOverloadPct) * a.glassOverloadSlope;
  if (b.carbonPct > a.carbonMax) s *= 1 - 0.05 * (b.carbonPct - a.carbonMax);
  return Math.max(15, s);
}

/** Geometría de la jaula: longitud total de acero (m) */
function cageLengthM(part: PartSpec, b: IntrusionParams): number {
  const R = part.openingMm / 2 + 25;
  const bars = b.radialBars * Math.max(0, R - b.cageCoverMm);
  let rings = 0;
  for (let i = 1; i <= b.rings; i++) rings += 2 * Math.PI * ((R * i) / (b.rings + 1));
  return (bars + rings) / 1000;
}

export function cageMassKg(part: PartSpec, b: IntrusionParams): number {
  if (b.reinforcement === 'pure') return 0;
  const area = (Math.PI * (b.rebarDiaMm / 1000) ** 2) / 4; // m²
  return cageLengthM(part, b) * area * b.steelDensity;
}

/** Área de acero traccionado por paso de nervadura: barras radiales + 50 % de aros (aporte tangencial) */
export function cageSpec(part: PartSpec, b: IntrusionParams): CageSpec | undefined {
  if (b.reinforcement === 'pure') return undefined;
  const R = part.openingMm / 2 + 25;
  const rc = R / 2;
  const d = b.rebarDiaMm;
  const s = part.ribSpacingMm;
  const radial = (b.radialBars * d * d * s) / (8 * rc);
  const ring = (0.5 * b.rings * Math.PI * d * d * s) / (4 * R);
  return {
    areaPerRibMm2: radial + ring,
    coverMm: b.cageCoverMm,
    EsMPa: b.steelEGPa * 1000,
    fyMPa: b.steelFyMPa,
    compositeShare: b.reinforcement === 'cage' ? b.cageCompositeShare : 1,
  };
}

export function massBreakdown(a: ProcessParams, part: PartSpec, b: IntrusionParams): MassBreakdown {
  const fiber = (b.glassPct / 100) * a.massKg;
  const steel = cageMassKg(part, b);
  const polymer = a.massKg - fiber;
  return { polymerKg: polymer, fiberKg: fiber, steelKg: steel, totalKg: a.massKg + steel };
}
