// Tipos compartidos por el motor, los componentes y el dashboard.

export type PartId = 'brocal_d400' | 'tapa_c250' | 'rejilla' | 'registro' | 'custom';
export type LoadClass = 'D400' | 'C250' | 'B125' | 'MANUAL';
export type DwellMode = 'temperature' | 'fixed';

/** Pieza derivada de los parámetros (solo lectura para el motor y la UI) */
export interface PartSpec {
  name: string;
  massKg: number;
  loadClass: LoadClass;
  /** Carga de rotura exigida (kN) */
  breakLoadKN: number;
  openingMm: number;
  /** Área proyectada exterior total (m²) */
  grossAreaM2: number;
  /** Área proyectada efectiva = total × (1 − huecos) (m²) */
  projectedAreaM2: number;
  voidFrac: number;
  plateThkMm: number;
  ribHeightMm: number;
  ribSpacingMm: number;
}

/**
 * TODAS las variables del sistema. No hay constantes físicas ni operativas fuera de este objeto
 * (salvo la discretización numérica del modelo térmico y las unidades).
 */
export interface ProcessParams {
  // ── Geometría y pieza ──────────────────────────────
  partId: PartId; // solo etiqueta del preset de origen
  massKg: number;
  projectedAreaM2: number;
  voidPct: number;
  ribThkMm: number;
  loadClass: LoadClass;
  breakLoadKN: number;
  maxResidualMm: number;
  proofLoadPct: number; // % de la carga de rotura aplicado en el ensayo de flecha residual
  openingMm: number;
  plateThkMm: number;
  ribHeightMm: number;
  ribSpacingMm: number;
  padRadiusMm: number;
  // ── Formulación y propiedades ─────────────────────
  glassPct: number;
  carbonPct: number;
  meltTempC: number;
  eMatrixMPa: number;
  eFiberGPa: number;
  latentKJkg: number;
  crystTempC: number;
  crystWidthC: number;
  crystFracPct: number;
  kAuto: boolean;
  kComposite: number;
  kMatrix: number;
  kFiber: number;
  rhoFiber: number;
  rhoMatrix: number;
  cpMatrix: number;
  cpFiber: number;
  alphaMatrix: number; // ×1e-6 1/K
  alphaFiber: number; // ×1e-6 1/K
  fiberAspect: number;
  poisson: number;
  sigmaMatrixMPa: number;
  strengthPerGlass: number; // MPa por % de fibra
  glassOverloadPct: number; // % de fibra a partir del cual cae la resistencia
  glassOverloadSlope: number; // MPa perdidos por % excedido
  shrinkCrystPct: number;
  shrinkDecay: number;
  // ── Extrusor y acumulador ─────────────────────────
  extruderKgH: number;
  overweightPct: number;
  // ── Prensa y moldeo ───────────────────────────────
  pressTon: number;
  pressTimeS: number;
  minPressureMPa: number;
  loadS: number;
  openS: number;
  pressBaseMPa: number;
  pressPerGlassMPa: number;
  pressPerMeltMPa: number;
  pressRibExp: number;
  moldTempC: number;
  // ── Cinemática y operarios ────────────────────────
  pinS: number;
  unpinS: number;
  craneMoveS: number;
  demoldS: number;
  returnS: number;
  demoldStations: number;
  // ── Batea ─────────────────────────────────────────
  bathTempC: number;
  bathSlots: number;
  moldCount: number;
  dwellMode: DwellMode;
  bathDwellMin: number;
  targetCoreC: number;
  hWater: number;
  steelThkMm: number;
  kSteel: number;
  contactResBath: number; // ×1e-3 m²K/W
  contactResPress: number; // ×1e-3 m²K/W
  hAir: number;
  ambientC: number;
  searchHorizonMin: number;
  // ── Mecánica (calibración) ────────────────────────
  loadSpread: number;
  supportClamp: number;
  padFactor: number;
  gridFactor: number;
  yieldFrac: number;
  creepBase: number;
  creepGain: number;
  // ── Planta / OEE ──────────────────────────────────
  availabilityPct: number;
  shiftH: number;
  simHorizonH: number;
  warmupH: number;
  // ── Umbrales de alerta y calidad ──────────────────
  glassMinRec: number;
  glassMaxRec: number;
  meltMin: number;
  meltMax: number;
  meltCritical: number;
  carbonMin: number;
  carbonMax: number;
  carbonTargetPct: number; // contenido que da índice UV = 100 %
  bathWarnC: number;
  warpWarnMmM: number;
  warpCritMmM: number;
  sinkWarnPct: number;
  safetyWarn: number;
  craneUtilWarnPct: number;
  pressBlockedWarnPct: number;
  overPressRatio: number;
  shortPressS: number;
  qualityBasePct: number;
  warpPenalty: number;
  sinkPenalty: number;
  uvPenalty: number;
  meltPenalty: number;
  lowPressPenaltyFloor: number;
  nonConformFactor: number;
  warpDiffWeight: number;
  warpResidualWeight: number;
  warpScale: number;
}

export type Stage =
  | 'WAIT_PRESS'
  | 'LOADING'
  | 'PRESSING'
  | 'PINNING'
  | 'OPENING'
  | 'WAIT_CRANE_IN'
  | 'CRANE_IN'
  | 'COOLING'
  | 'WAIT_CRANE_OUT'
  | 'CRANE_OUT'
  | 'WAIT_DEMOLD'
  | 'DEMOLD'
  | 'RETURN';

export interface Segment {
  mold: number;
  stage: Stage;
  t0: number;
  t1: number;
  /** Tiempo de referencia sobre la curva térmica en t0 (s) */
  k0: number;
  /** Posición de batea ocupada (solo COOLING / WAIT_CRANE_OUT / CRANE_OUT) */
  slot: number;
  piece: number;
}

export interface CraneSegment {
  mold: number;
  t0: number;
  t1: number;
  from: 'press' | 'bath' | 'demold';
  to: 'press' | 'bath' | 'demold';
  slot: number;
}

export interface StageTimes {
  loadS: number;
  /** Ocupación de la prensa en la etapa de prensado = prensado puro + pasadores */
  pressS: number;
  pressPureS: number;
  pinS: number;
  openS: number;
  craneS: number;
  coolS: number;
  demoldS: number;
  unpinS: number;
  demoldOnlyS: number;
  returnS: number;
  slugS: number;
}

export interface DESResult {
  horizonS: number;
  windowStartS: number;
  segments: Segment[];
  segmentsByMold: Segment[][];
  craneSegments: CraneSegment[];
  piecesInWindow: number;
  piecesPerHour: number;
  taktS: number;
  util: {
    press: number; // ocupación productiva (carga + prensado + apertura)
    pressBlocked: number; // prensa retenida esperando grúa
    pressStarved: number; // prensa vacía esperando molde o masa
    crane: number;
    bath: number;
    demold: number;
    extruder: number;
  };
}

export type BottleneckId = 'Prensa' | 'Batea' | 'Flota de moldes' | 'Grúa' | 'Desmoldeo' | 'Extrusor';

export interface Bottleneck {
  id: BottleneckId;
  /** Capacidad teórica de cada recurso (piezas/h) */
  capacities: Record<BottleneckId, number>;
  explanation: string;
}

export interface CoolingCurve {
  /** Tiempo desde inicio del prensado (s) */
  t: number[];
  core: number[];
  surface: number[];
  tBathIn: number;
  tPressEnd: number;
  /** Temperatura objetivo de núcleo para la extracción (°C) */
  targetC: number;
  /** Tiempo (desde entrada en batea) para que el núcleo baje del objetivo (s); Infinity si no se alcanza */
  timeToTargetS: number;
  coreAtDwell: number;
  surfaceAtDwell: number;
  dwellS: number;
}

export type Severity = 'ok' | 'info' | 'warn' | 'critical';

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface MechanicalResult {
  glassVolFrac: number;
  modulusMPa: number;
  tensileStrengthMPa: number;
  yieldStrengthMPa: number;
  equivThicknessMm: number;
  elasticDeflMm: number; // a 2/3 de la carga de ensayo
  permanentDeflMm: number;
  peakStressMPa: number; // a la carga de rotura exigida
  failureLoadKN: number;
  safetyFactor: number;
  passDeflection: boolean;
  passBreak: boolean;
}

export interface ProcessCheck {
  requiredTon: number;
  fillRatio: number;
  slugKg: number;
  pressureMPa: number; // presión específica sobre el área proyectada
  uvIndex: number;
  shrinkagePct: number;
  warpMmPerM: number;
  sinkRisk: number; // 0..1
  qualityYield: number; // 0..1
}

export interface Derived {
  slugKg: number;
  slugS: number;
  pressureMPa: number;
  effAreaM2: number;
  kValue: number;
  modulusGPa: number;
  requiredMin: number;
}

export interface Analysis {
  part: PartSpec;
  derived: Derived;
  times: StageTimes;
  cooling: CoolingCurve;
  mech: MechanicalResult;
  process: ProcessCheck;
  des: DESResult;
  bottleneck: Bottleneck;
  oee: { availability: number; performance: number; quality: number; oee: number };
  piecesPerShift: number;
  goodPiecesPerShift: number;
  alerts: Alert[];
}
