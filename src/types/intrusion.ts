// Tipos del Método B (intrusión directa con manifold en "T"), costos y estado global de la aplicación.
import type { Alert, Bottleneck, CoolingCurve, MechanicalResult, ProcessParams } from './simulation';

export type PeType = 'PE100' | 'PE80' | 'RECYCLED' | 'VIRGIN' | 'CUSTOM';
export type FiberFeed = 'side' | 'hopper';
export type Reinforcement = 'pure' | 'cage' | 'hybrid';
export type CoolMode = 'insitu' | 'bath';
export type DwellModeB = 'temperature' | 'fixed';

/** Todas las variables del Método B (la pieza, la clase normativa y las constantes de material se toman del Método A). */
export interface IntrusionParams {
  // ── Materia prima y compuesto ─────────────────────
  peType: PeType;
  mfi: number; // g/10 min (190 °C / 2,16 kg)
  glassPct: number;
  fiberDiamUm: number;
  fiberL0Mm: number;
  fiberFeed: FiberFeed;
  couplingPct: number; // PE-g-MA
  carbonPct: number;
  // ── Reología y atrición (calibración) ─────────────
  meltTempC: number;
  powerLawN: number;
  meltEaKJmol: number;
  etaRefPas: number;
  kCut: number;
  sideFeederLD: number;
  viscFiberCoeff: number;
  meltDensityRatio: number;
  couplingScalePct: number;
  uncoupledEff: number;
  tauUncoupledMPa: number;
  tauCoupledMPa: number;
  fiberStrengthMPa: number;
  orientEff: number;
  edgeBreak: number;
  // ── Extrusor, tornillo y manifold ─────────────────
  extruderKgH: number;
  screwDiaMm: number;
  screwLD: number;
  pMaxBar: number;
  stations: number;
  switchS: number;
  flashPct: number;
  screwCapacityCoeff: number;
  rpmMax: number;
  channelDepthRatio: number;
  // ── Bebedero y molde ──────────────────────────────
  sprueDiaMm: number;
  sprueTaperDeg: number;
  sprueLenMm: number;
  filletMm: number;
  ventDepthMm: number;
  ventMinMm: number;
  ventMaxMm: number;
  boltCount: number;
  boltCapacityKN: number;
  // ── Estructura de refuerzo ────────────────────────
  reinforcement: Reinforcement;
  rebarDiaMm: number;
  radialBars: number;
  rings: number;
  steelFyMPa: number;
  cagePlaceS: number;
  cageCoverMm: number;
  cageCompositeShare: number;
  steelEGPa: number;
  steelDensity: number;
  // ── Cinemática y operarios ────────────────────────
  boltS: number;
  unboltS: number;
  extractS: number;
  holdS: number;
  operators: number;
  coolMode: CoolMode;
  dwellMode: DwellModeB;
  coolTargetC: number;
  coolFixedMin: number;
  hoistS: number;
  bathSlots: number;
  moldFleet: number;
  bathTempC: number;
  jacketTempC: number;
  hInSitu: number;
  // ── Calidad (calibración) ─────────────────────────
  ventAirPenalty: number;
  ventFlashPenalty: number;
  mfiMin: number;
  mfiMax: number;
  fiberMinMm: number;
  blockedWarnPct: number;
}

export interface CostParams {
  capexA: number;
  capexB: number;
  costScrap: number;
  costGlass: number;
  costCoupling: number;
  costSteel: number;
  laborRate: number;
  energyRate: number;
  amortYears: number;
  hoursPerYear: number;
  operatorsA: number;
  kWhKgA: number;
  pressKW: number;
  chillerKW: number;
  kWhKgB: number;
  hoistKW: number;
  coolKWB: number;
}

export interface AppParams {
  a: ProcessParams;
  b: IntrusionParams;
  c: CostParams;
}

export type BStage =
  | 'PREP_CAGE'
  | 'PREP_BOLT'
  | 'READY'
  | 'WAIT_OPERATOR'
  | 'HOIST_IN'
  | 'WAIT_EXTRUDER'
  | 'SWITCH'
  | 'FILLING'
  | 'HOLD'
  | 'WAIT_HOIST_OUT'
  | 'HOIST_OUT'
  | 'COOL'
  | 'WAIT_HOIST_BENCH'
  | 'HOIST_BENCH'
  | 'UNBOLT'
  | 'EXTRACT';

export interface BSegment {
  mold: number;
  stage: BStage;
  t0: number;
  t1: number;
  k0: number;
  /** Puesto (en el manifold) o posición de batea ocupada, según la etapa; -1 si no aplica */
  slot: number;
  /** El molde contiene pieza (llenada y aún no extraída) */
  piece: boolean;
}

export type HoistPlace = 'buffer' | 'port' | 'bath' | 'bench';

export interface HoistSegment {
  mold: number;
  t0: number;
  t1: number;
  from: HoistPlace;
  to: HoistPlace;
  slot: number;
}

export interface ExtruderSegment {
  t0: number;
  t1: number;
  state: 'SWITCHING' | 'FILLING';
  mold: number;
}

export interface StageTimesB {
  prepS: number;
  cageS: number;
  boltS: number;
  switchS: number;
  fillS: number;
  holdS: number;
  coolS: number;
  hoistS: number;
  unboltS: number;
  extractS: number;
}

export interface IntrusionDES {
  horizonS: number;
  windowStartS: number;
  moldCount: number;
  ports: number;
  bathSlots: number;
  segments: BSegment[];
  segmentsByMold: BSegment[][];
  hoistSegments: HoistSegment[];
  extruderSegments: ExtruderSegment[];
  piecesInWindow: number;
  piecesPerHour: number;
  taktS: number;
  util: {
    extruder: number; // llenando (productivo)
    switching: number; // conmutando la válvula
    blocked: number; // bloqueado / espera de matriz
    operators: number;
    hoist: number;
    bath: number;
  };
}

export interface RheologyResult {
  rpm: number;
  shearRateScrew: number;
  etaScrewPas: number; // viscosidad a la cizalla del tornillo (sin fibra)
  etaRel: number; // viscosidad relativa del atrición
  powerLawM: number; // consistencia a T de masa (Pa·s^n)
  fiberFactor: number; // aumento de viscosidad por fibra
  attritionExponent: number;
  fiberLengthMm: number; // tras el tornillo
  fiberLengthFinalMm: number; // tras bebedero (arista viva)
  aspectRatio: number;
  couplingEff: number;
  tauMPa: number;
  criticalLengthMm: number;
  lengthEff: number; // eficiencia de longitud (Kelly-Tyson)
  sprueWallShear: number;
  dPsprueBar: number;
  dPcavityBar: number;
  dPtotalBar: number;
  fillS: number;
  flowM3s: number;
  flowThickMm: number;
  moldOpenKN: number;
  boltCapacityKN: number;
  sprueExitMm: number;
}

export interface MassBreakdown {
  polymerKg: number;
  fiberKg: number;
  steelKg: number;
  totalKg: number;
}

export interface IntrusionAnalysis {
  rheo: RheologyResult;
  times: StageTimesB;
  cooling: CoolingCurve;
  mech: MechanicalResult;
  mass: MassBreakdown;
  des: IntrusionDES;
  bottleneck: Bottleneck<string>;
  capacities: Record<string, number>;
  oee: { availability: number; performance: number; quality: number; oee: number };
  quality: number;
  uvIndex: number;
  warpMmPerM: number;
  sinkRisk: number;
  piecesPerShift: number;
  goodPiecesPerShift: number;
  alerts: Alert[];
  requiredMin: number;
  steelAreaPerRibMm2: number;
  fleet: number;
}
