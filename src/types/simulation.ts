// Tipos compartidos por el motor, los componentes y el dashboard.

export type PartId = 'brocal_d400' | 'tapa_c250' | 'rejilla' | 'registro';

export interface PartSpec {
  id: PartId;
  name: string;
  massKg: number;
  /** Clase según UNE-EN 124 */
  loadClass: 'D400' | 'C250' | 'B125';
  /** Carga de rotura mínima exigida (kN) */
  breakLoadKN: number;
  /** Diámetro de paso libre (mm) */
  openingMm: number;
  /** Diámetro/lado exterior (mm) */
  outerMm: number;
  /** Área proyectada del molde incluida la zona de rebaba (m²) */
  projectedAreaM2: number;
  /** Geometría equivalente del panel nervado (mm) */
  plateThkMm: number;
  ribHeightMm: number;
  ribSpacingMm: number;
  ribThkRange: [number, number];
  defaultRibThk: number;
}

export interface ProcessParams {
  partId: PartId;
  // Formulación
  glassPct: number; // % en peso de fibra de vidrio
  carbonPct: number; // % en peso de negro de humo
  meltTempC: number; // temperatura de la masa fundida
  ribThkMm: number; // espesor crítico en nervaduras
  // Máquina
  pressTon: number;
  pressTimeS: number; // permanencia en prensa (incluye enroscado de pasadores)
  moldCount: number; // flota de moldes rotativos
  bathTempC: number;
  bathDwellMin: number; // permanencia programada en batea
  bathSlots: number; // posiciones disponibles en la batea
  extruderKgH: number; // caudal del extrusor
  craneMoveS: number; // duración de un traslado de grúa
  demoldS: number; // desenroscado + apertura + desmoldeo por molde
  demoldStations: number;
}

export type Stage =
  | 'WAIT_PRESS'
  | 'LOADING'
  | 'PRESSING'
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
  pressS: number;
  openS: number;
  craneS: number;
  coolS: number;
  demoldS: number;
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
  /** Tiempo (desde entrada en batea) para que el núcleo baje de 50 °C (s); Infinity si no se alcanza */
  timeToCore50S: number;
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
  uvIndex: number;
  shrinkagePct: number;
  warpMmPerM: number;
  sinkRisk: number; // 0..1
  qualityYield: number; // 0..1
}

export interface Analysis {
  part: PartSpec;
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
