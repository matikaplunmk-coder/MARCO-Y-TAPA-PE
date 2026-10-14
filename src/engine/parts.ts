import type { LoadClass, PartId, PartSpec, ProcessParams } from '../types/simulation';

export const CLASS_LOAD_KN: Record<Exclude<LoadClass, 'MANUAL'>, number> = {
  D400: 400,
  C250: 250,
  B125: 125,
};

export interface PartPreset {
  id: Exclude<PartId, 'custom'>;
  name: string;
  values: Pick<
    ProcessParams,
    | 'massKg'
    | 'projectedAreaM2'
    | 'voidPct'
    | 'ribThkMm'
    | 'loadClass'
    | 'breakLoadKN'
    | 'openingMm'
    | 'plateThkMm'
    | 'ribHeightMm'
    | 'ribSpacingMm'
  >;
}

export const PART_PRESETS: PartPreset[] = [
  {
    id: 'brocal_d400',
    name: 'Brocal D400',
    values: { massKg: 38, projectedAreaM2: 0.61, voidPct: 0, ribThkMm: 32, loadClass: 'D400', breakLoadKN: 400, openingMm: 600, plateThkMm: 14, ribHeightMm: 100, ribSpacingMm: 100 },
  },
  {
    id: 'tapa_c250',
    name: 'Tapa C250',
    values: { massKg: 36, projectedAreaM2: 0.53, voidPct: 0, ribThkMm: 30, loadClass: 'C250', breakLoadKN: 250, openingMm: 600, plateThkMm: 12, ribHeightMm: 80, ribSpacingMm: 100 },
  },
  {
    id: 'rejilla',
    name: 'Rejilla pluvial',
    values: { massKg: 48, projectedAreaM2: 0.9, voidPct: 20, ribThkMm: 36, loadClass: 'D400', breakLoadKN: 400, openingMm: 640, plateThkMm: 16, ribHeightMm: 105, ribSpacingMm: 95 },
  },
  {
    id: 'registro',
    name: 'Registro',
    values: { massKg: 9, projectedAreaM2: 0.24, voidPct: 0, ribThkMm: 22, loadClass: 'B125', breakLoadKN: 125, openingMm: 400, plateThkMm: 10, ribHeightMm: 60, ribSpacingMm: 80 },
  },
];

/** Valores por defecto de fábrica */
export const DEFAULT_PARAMS: ProcessParams = {
  partId: 'brocal_d400',
  ...PART_PRESETS[0].values,
  maxResidualMm: 2.0,
  proofLoadPct: 66.7,
  padRadiusMm: 135,

  glassPct: 30,
  carbonPct: 2.0,
  meltTempC: 190,
  eMatrixMPa: 1100,
  eFiberGPa: 72,
  latentKJkg: 200,
  crystTempC: 117,
  crystWidthC: 6,
  crystFracPct: 60,
  kAuto: true,
  kComposite: 0.52,
  kMatrix: 0.45,
  kFiber: 1.0,
  rhoFiber: 2.55,
  rhoMatrix: 0.955,
  cpMatrix: 2300,
  cpFiber: 800,
  alphaMatrix: 150,
  alphaFiber: 5,
  fiberAspect: 30,
  poisson: 0.4,
  sigmaMatrixMPa: 26,
  strengthPerGlass: 1.4,
  glassOverloadPct: 35,
  glassOverloadSlope: 1.1,
  shrinkCrystPct: 2.4,
  shrinkDecay: 8,

  extruderKgH: 240,
  overweightPct: 2.5,

  pressTon: 1000,
  pressTimeS: 45,
  minPressureMPa: 15,
  loadS: 25,
  openS: 12,
  pressBaseMPa: 8.5,
  pressPerGlassMPa: 0.1,
  pressPerMeltMPa: 0.12,
  pressRibExp: 0.35,
  moldTempC: 60,

  pinS: 60,
  unpinS: 60,
  craneMoveS: 40,
  demoldS: 90,
  returnS: 40,
  demoldStations: 2,

  bathTempC: 20,
  bathSlots: 8,
  moldCount: 10,
  dwellMode: 'temperature',
  bathDwellMin: 22,
  targetCoreC: 50,
  hWater: 800,
  steelThkMm: 40,
  kSteel: 45,
  contactResBath: 2.5,
  contactResPress: 0.6,
  hAir: 22,
  ambientC: 25,
  searchHorizonMin: 120,

  loadSpread: 0.65,
  supportClamp: 0.6,
  padFactor: 0.85,
  gridFactor: 1.4,
  yieldFrac: 0.55,
  creepBase: 0.05,
  creepGain: 0.35,

  availabilityPct: 92,
  shiftH: 8,
  simHorizonH: 10,
  warmupH: 2,

  glassMinRec: 20,
  glassMaxRec: 35,
  meltMin: 180,
  meltMax: 200,
  meltCritical: 210,
  carbonMin: 1.5,
  carbonMax: 3,
  carbonTargetPct: 2.0,
  bathWarnC: 30,
  warpWarnMmM: 2,
  warpCritMmM: 4,
  sinkWarnPct: 50,
  safetyWarn: 1.15,
  craneUtilWarnPct: 85,
  pressBlockedWarnPct: 8,
  overPressRatio: 1.6,
  shortPressS: 30,
  qualityBasePct: 98.5,
  warpPenalty: 0.15,
  sinkPenalty: 0.35,
  uvPenalty: 0.1,
  meltPenalty: 0.85,
  lowPressPenaltyFloor: 0.5,
  nonConformFactor: 0.5,
  warpDiffWeight: 0.6,
  warpResidualWeight: 0.25,
  warpScale: 1.8,
};

export function presetName(id: PartId): string {
  return PART_PRESETS.find((p) => p.id === id)?.name ?? 'Pieza personalizada';
}

/** Pieza efectiva derivada de los parámetros */
export function getPart(p: ProcessParams): PartSpec {
  const voidFrac = Math.min(0.95, Math.max(0, p.voidPct / 100));
  return {
    name: presetName(p.partId),
    massKg: p.massKg,
    loadClass: p.loadClass,
    breakLoadKN: p.breakLoadKN,
    openingMm: p.openingMm,
    grossAreaM2: p.projectedAreaM2,
    projectedAreaM2: p.projectedAreaM2 * (1 - voidFrac),
    voidFrac,
    plateThkMm: p.plateThkMm,
    ribHeightMm: p.ribHeightMm,
    ribSpacingMm: p.ribSpacingMm,
  };
}

/** Etiqueta legible de la clase normativa objetivo */
export function classLabel(part: Pick<PartSpec, 'loadClass' | 'breakLoadKN'>): string {
  return part.loadClass === 'MANUAL' ? `carga manual ${part.breakLoadKN} kN` : part.loadClass;
}
