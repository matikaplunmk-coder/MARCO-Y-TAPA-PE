import type { PartSpec, ProcessCheck, ProcessParams } from '../types/simulation';
import { moldShrinkagePct, warpIndex } from './thermalPhysics';

export const SLUG_OVERWEIGHT = 0.025; // 2-3 % de sobrepeso para rebaba controlada
const KGF_PER_TON = 9806.65;

/** Presión de cavidad requerida (MPa) para llenar nervaduras y asiento cónico de 35° */
export function requiredCavityPressureMPa(p: ProcessParams): number {
  const base = 8.5 + 0.1 * p.glassPct; // más fibra → más viscosidad
  const meltEffect = 0.12 * (190 - p.meltTempC); // masa más fría → más presión
  const ribEffect = Math.pow(30 / p.ribThkMm, 0.35); // nervaduras delgadas cuestan más
  return Math.max(4, (base + meltEffect) * ribEffect);
}

export function requiredTonnage(p: ProcessParams, part: PartSpec): number {
  return (requiredCavityPressureMPa(p) * part.projectedAreaM2 * 1e6) / KGF_PER_TON;
}

export const MIN_PRESSURE_MPA = 15;

/** Presión específica (MPa) = fuerza de cierre / área proyectada */
export function specificPressureMPa(pressTon: number, part: PartSpec): number {
  return (pressTon * KGF_PER_TON) / (part.projectedAreaM2 * 1e6);
}

export function slugMassKg(part: PartSpec): number {
  return part.massKg * (1 + SLUG_OVERWEIGHT);
}

export function evaluateProcess(
  p: ProcessParams,
  part: PartSpec,
  coreAtExit: number,
  surfAtExit: number,
): ProcessCheck {
  const requiredTon = requiredTonnage(p, part);
  const fillRatio = p.pressTon / requiredTon;
  const pressureMPa = specificPressureMPa(p.pressTon, part);
  const uvIndex = Math.min(1.2, p.carbonPct / 2.0);
  const shrinkagePct = moldShrinkagePct(p.glassPct, coreAtExit);
  const warp = warpIndex(p.glassPct, coreAtExit, surfAtExit);
  const sinkRisk = Math.min(
    1,
    Math.max(0, (coreAtExit - 50) / 50) * 0.8 +
      Math.max(0, (p.ribThkMm - 30) / 30) * 0.15 +
      Math.max(0, 1 - fillRatio) * 1.5,
  );

  let q = 0.985;
  if (fillRatio < 1) q *= Math.pow(Math.max(0, fillRatio), 3);
  q *= Math.exp(-Math.max(0, warp - 1.5) * 0.15);
  q *= 1 - 0.35 * sinkRisk;
  if (uvIndex < 1) q *= 1 - 0.1 * (1 - uvIndex);
  if (p.meltTempC > 210) q *= 0.85;
  if (p.pressTimeS < 30) q *= 0.93;
  if (pressureMPa < MIN_PRESSURE_MPA) q *= Math.max(0.5, pressureMPa / MIN_PRESSURE_MPA);

  return {
    requiredTon,
    fillRatio,
    slugKg: slugMassKg(part),
    pressureMPa,
    uvIndex,
    shrinkagePct,
    warpMmPerM: warp,
    sinkRisk,
    qualityYield: Math.max(0.05, Math.min(0.99, q)),
  };
}
