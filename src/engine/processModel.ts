import type { PartSpec, ProcessCheck, ProcessParams } from '../types/simulation';
import { moldShrinkagePct, warpIndex } from './thermalPhysics';

const KGF_PER_TON = 9806.65; // factor de unidades (1 tf = 9806,65 N)

/** Presión de cavidad requerida (MPa) para llenar nervaduras y asiento cónico de 35° */
export function requiredCavityPressureMPa(p: ProcessParams): number {
  const base = p.pressBaseMPa + p.pressPerGlassMPa * p.glassPct; // más fibra → más viscosidad
  const meltEffect = p.pressPerMeltMPa * (190 - p.meltTempC); // masa más fría → más presión
  const ribEffect = Math.pow(30 / p.ribThkMm, p.pressRibExp); // nervaduras delgadas cuestan más
  return Math.max(4, (base + meltEffect) * ribEffect);
}

export function requiredTonnage(p: ProcessParams, part: PartSpec): number {
  return (requiredCavityPressureMPa(p) * part.projectedAreaM2 * 1e6) / KGF_PER_TON;
}

/** Presión específica (MPa) = fuerza de cierre / área proyectada efectiva */
export function specificPressureMPa(pressTon: number, part: PartSpec): number {
  return (pressTon * KGF_PER_TON) / (part.projectedAreaM2 * 1e6);
}

export function tonnageForPressure(mpa: number, part: PartSpec): number {
  return (mpa * part.projectedAreaM2 * 1e6) / KGF_PER_TON;
}

export function slugMassKg(p: ProcessParams): number {
  return p.massKg * (1 + p.overweightPct / 100);
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
  const uvIndex = Math.min(1.2, p.carbonPct / p.carbonTargetPct);
  const shrinkagePct = moldShrinkagePct(p, coreAtExit);
  const warp = warpIndex(p, coreAtExit, surfAtExit);
  const sinkRisk = Math.min(
    1,
    Math.max(0, (coreAtExit - 50) / 50) * 0.8 +
      Math.max(0, (p.ribThkMm - 30) / 30) * 0.15 +
      Math.max(0, 1 - fillRatio) * 1.5,
  );

  let q = p.qualityBasePct / 100;
  if (fillRatio < 1) q *= Math.pow(Math.max(0, fillRatio), 3);
  q *= Math.exp(-Math.max(0, warp - p.warpWarnMmM * 0.75) * p.warpPenalty);
  q *= 1 - p.sinkPenalty * sinkRisk;
  if (uvIndex < 1) q *= 1 - p.uvPenalty * (1 - uvIndex);
  if (p.meltTempC > p.meltCritical) q *= p.meltPenalty;
  if (p.pressTimeS < p.shortPressS) q *= 0.93;
  if (pressureMPa < p.minPressureMPa) q *= Math.max(p.lowPressPenaltyFloor, pressureMPa / p.minPressureMPa);

  return {
    requiredTon,
    fillRatio,
    slugKg: slugMassKg(p),
    pressureMPa,
    uvIndex,
    shrinkagePct,
    warpMmPerM: warp,
    sinkRisk,
    qualityYield: Math.max(0.05, Math.min(0.99, q)),
  };
}
