import type { CostParams, IntrusionParams } from '../types/intrusion';
import type { FieldGroup, NumField } from './paramSchema';

type NumKeyOf<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T] & string;
export type NumKeyB = NumKeyOf<IntrusionParams>;
export type NumKeyC = NumKeyOf<CostParams>;

type Opt<P> = Partial<Pick<NumField<P, string>, 'decimals' | 'hint' | 'int' | 'advanced' | 'visible' | 'disabled'>>;
const mk =
  <P, K extends string>() =>
  (key: K, label: string, unit: string, min: number, max: number, step: number, hard: [number, number], opt: Opt<P> = {}): NumField<P, K> => ({
    key,
    label,
    unit,
    min,
    max,
    step,
    hard,
    ...opt,
  });
const nb = mk<IntrusionParams, NumKeyB>();
const nc = mk<CostParams, NumKeyC>();

const cageOn = (p: IntrusionParams) => p.reinforcement !== 'pure';
const bathOn = (p: IntrusionParams) => p.coolMode === 'bath';
const inSituOn = (p: IntrusionParams) => p.coolMode === 'insitu';

export const B_GROUPS: FieldGroup<IntrusionParams, NumKeyB>[] = [
  {
    id: 'b_material',
    title: 'Materia prima y compuesto',
    fields: [
      nb('mfi', 'MFI del polietileno (190 °C / 2,16 kg)', 'g/10 min', 0.1, 2.5, 0.05, [0.01, 20], { decimals: 2, hint: 'Scrap de tubería: 0,15–0,6' }),
      nb('glassPct', 'Fibra de vidrio', '% p/p', 0, 40, 1, [0, 70]),
      nb('fiberDiamUm', 'Diámetro del filamento de fibra', 'µm', 10, 20, 0.5, [1, 100], { decimals: 1 }),
      nb('fiberL0Mm', 'Longitud inicial de fibra L₀', 'mm', 2, 12, 0.5, [0.2, 50], { decimals: 1 }),
      nb('couplingPct', 'Agente de acoplamiento PE-g-MA', '% p/p', 0, 5, 0.1, [0, 20], { decimals: 1, hint: '0 % → la interfase transmite solo ≈ 20 % del esfuerzo' }),
      nb('carbonPct', 'Negro de humo UV', '% p/p', 0, 3, 0.1, [0, 10], { decimals: 1 }),
      nb('powerLawN', 'Índice de ley de potencias n', '', 0.2, 0.8, 0.01, [0.1, 1], { decimals: 2, advanced: true }),
      nb('meltEaKJmol', 'Energía de activación de la viscosidad', 'kJ/mol', 10, 60, 1, [1, 200], { advanced: true }),
      nb('etaRefPas', 'Viscosidad de referencia para η_rel', 'Pa·s', 200, 6000, 50, [10, 100000], { advanced: true }),
      nb('kCut', 'Coeficiente de atrición k_corte', '', 0.0005, 0.01, 0.0001, [0, 1], { decimals: 4, advanced: true }),
      nb('sideFeederLD', 'L/D recorrido tras el Side Feeder', 'L/D', 2, 20, 0.5, [0.5, 50], { decimals: 1, advanced: true }),
      nb('viscFiberCoeff', 'Aumento de viscosidad por relación de aspecto', '', 0, 1, 0.05, [0, 5], { decimals: 2, advanced: true }),
      nb('meltDensityRatio', 'Densidad fundido / sólido del PE', '', 0.7, 1, 0.01, [0.3, 1.2], { decimals: 2, advanced: true }),
      nb('couplingScalePct', 'PE-g-MA de saturación de la interfase', '%', 0.2, 3, 0.1, [0.01, 20], { decimals: 1, advanced: true }),
      nb('uncoupledEff', 'Eficiencia de interfase sin PE-g-MA', '', 0.05, 0.6, 0.01, [0.01, 1], { decimals: 2, advanced: true }),
      nb('tauUncoupledMPa', 'Cizalla interfacial sin acoplante', 'MPa', 1, 10, 0.5, [0.1, 100], { decimals: 1, advanced: true }),
      nb('tauCoupledMPa', 'Cizalla interfacial con acoplante', 'MPa', 5, 30, 0.5, [0.1, 200], { decimals: 1, advanced: true }),
      nb('fiberStrengthMPa', 'Resistencia efectiva de la fibra', 'MPa', 500, 2500, 50, [50, 6000], { advanced: true }),
      nb('orientEff', 'Eficiencia de orientación (Krenchel)', '', 0.2, 1, 0.005, [0.05, 1], { decimals: 3, advanced: true }),
      nb('mfiMin', 'MFI mínimo típico (aviso)', 'g/10 min', 0.05, 0.5, 0.01, [0, 50], { decimals: 2, advanced: true }),
      nb('mfiMax', 'MFI máximo típico (aviso)', 'g/10 min', 0.3, 2, 0.05, [0, 50], { decimals: 2, advanced: true }),
      nb('fiberMinMm', 'Longitud final mínima de fibra (aviso)', 'mm', 0.1, 2, 0.1, [0, 20], { decimals: 1, advanced: true }),
    ],
  },
  {
    id: 'b_extruder',
    title: 'Extrusor, tornillo y manifold',
    fields: [
      nb('extruderKgH', 'Caudal de extrusión continuo', 'kg/h', 100, 2500, 10, [1, 20000]),
      nb('meltTempC', 'Temperatura de la masa en boquilla T₀', '°C', 170, 230, 1, [100, 320]),
      nb('screwDiaMm', 'Diámetro del tornillo D', 'mm', 60, 180, 1, [20, 400]),
      nb('screwLD', 'Relación L/D', 'L/D', 20, 36, 1, [5, 60]),
      nb('pMaxBar', 'Presión máxima en cabeza / husillo', 'bar', 50, 350, 5, [5, 2000]),
      nb('stations', 'Puestos alternados en el manifold', 'puestos', 2, 6, 1, [1, 12], { int: true }),
      nb('switchS', 'Conmutación de la válvula en T', 's', 2, 30, 1, [0, 300]),
      nb('flashPct', 'Factor de rebaba / purga', '%', 0, 8, 0.1, [0, 50], { decimals: 1 }),
      nb('screwCapacityCoeff', 'Capacidad del husillo (kg/h por cm³·rpm)', '', 0.003, 0.012, 0.0005, [0.0001, 1], { decimals: 4, advanced: true }),
      nb('rpmMax', 'RPM máximas del husillo', 'rpm', 40, 300, 5, [1, 2000], { advanced: true }),
      nb('channelDepthRatio', 'Profundidad del canal (h/D)', '', 0.05, 0.2, 0.01, [0.01, 0.5], { decimals: 2, advanced: true }),
    ],
  },
  {
    id: 'b_sprue',
    title: 'Bebedero, entrada y venteo',
    fields: [
      nb('sprueDiaMm', 'Diámetro interno de entrada del bebedero', 'mm', 20, 80, 1, [5, 300]),
      nb('sprueTaperDeg', 'Ángulo de conicidad', '°', 1, 8, 0.5, [0.1, 30], { decimals: 1 }),
      nb('sprueLenMm', 'Longitud del bebedero', 'mm', 40, 300, 5, [5, 2000]),
      nb('filletMm', 'Radio de acuerdo en la transición a la tapa', 'mm', 0, 20, 1, [0, 100], { hint: '0 = arista viva (más pérdida y más rotura de fibra)' }),
      nb('ventDepthMm', 'Profundidad de ranura de venteo perimetral', 'mm', 0.01, 0.1, 0.005, [0.001, 1], { decimals: 3, hint: 'Ventana 0,03–0,06 mm' }),
      nb('ventMinMm', 'Venteo mínimo (atrapamiento de aire)', 'mm', 0.01, 0.06, 0.005, [0, 1], { decimals: 3, advanced: true }),
      nb('ventMaxMm', 'Venteo máximo (rebaba)', 'mm', 0.04, 0.1, 0.005, [0, 1], { decimals: 3, advanced: true }),
      nb('boltCount', 'Cantidad de pernos perimetrales', '', 8, 40, 1, [1, 200], { int: true, advanced: true }),
      nb('boltCapacityKN', 'Capacidad de carga por perno', 'kN', 50, 400, 10, [1, 5000], { advanced: true }),
    ],
  },
  {
    id: 'b_reinf',
    title: 'Estructura de refuerzo',
    fields: [
      nb('rebarDiaMm', 'Diámetro de varillas corrugadas', 'mm', 6, 16, 1, [3, 40], { visible: cageOn }),
      nb('radialBars', 'Varillas radiales de la armadura', '', 4, 16, 1, [1, 48], { int: true, visible: cageOn }),
      nb('rings', 'Aros perimetrales concéntricos', '', 1, 4, 1, [0, 12], { int: true, visible: cageOn }),
      nb('steelFyMPa', 'Límite de fluencia del acero', 'MPa', 280, 500, 10, [100, 1500], { visible: cageOn }),
      nb('cagePlaceS', 'Posicionado y centrado de la jaula', 's', 15, 90, 1, [0, 900], { visible: cageOn }),
      nb('cageCoverMm', 'Recubrimiento de la jaula', 'mm', 5, 40, 1, [1, 100], { advanced: true, visible: cageOn }),
      nb('cageCompositeShare', 'Participación del compuesto en modo «jaula»', '', 0.1, 1, 0.05, [0.01, 1], { decimals: 2, advanced: true, visible: cageOn }),
      nb('steelEGPa', 'Módulo elástico del acero', 'GPa', 190, 210, 1, [100, 300], { advanced: true, visible: cageOn }),
      nb('steelDensity', 'Densidad del acero', 'kg/m³', 7700, 8000, 10, [1000, 20000], { advanced: true, visible: cageOn }),
    ],
  },
  {
    id: 'b_kin',
    title: 'Cinemática, operarios y refrigeración',
    fields: [
      nb('boltS', 'Ajuste manual de pernos / tuercas perimetrales', 's', 30, 180, 1, [0, 3600]),
      nb('unboltS', 'Desapriete y apertura de molde', 's', 30, 180, 1, [0, 3600]),
      nb('extractS', 'Extracción de pieza y limpieza', 's', 20, 180, 1, [0, 3600]),
      nb('holdS', 'Mantenimiento y retracción de boquilla', 's', 10, 120, 1, [0, 1800]),
      nb('operators', 'Operarios disponibles', '', 1, 6, 1, [1, 30], { int: true }),
      nb('coolTargetC', 'Temperatura de desmoldeo (objetivo de núcleo)', '°C', 40, 60, 1, [20, 120], { hint: 'Modo temperatura: criterio de salida; modo fijo: referencia de la alerta' }),
      nb('coolFixedMin', 'Tiempo fijo de refrigeración', 'min', 5, 60, 1, [0.5, 600], { visible: (p) => p.dwellMode === 'fixed' }),
      nb('hoistS', 'Traslado con polipasto (por movimiento)', 's', 15, 120, 1, [1, 900], { visible: bathOn }),
      nb('bathSlots', 'Posiciones de la batea de agua', '', 2, 16, 1, [1, 40], { int: true, visible: bathOn }),
      nb('moldFleet', 'Moldes en la flota (≥ puestos)', 'moldes', 2, 16, 1, [1, 60], { int: true, visible: bathOn }),
      nb('bathTempC', 'Temperatura del agua de batea', '°C', 10, 35, 1, [0, 90], { visible: bathOn }),
      nb('jacketTempC', 'Temperatura del refrigerante de camisa / aire', '°C', 5, 40, 1, [-20, 90], { visible: inSituOn }),
      nb('hInSitu', 'Coeficiente de refrigeración in-situ', 'W/m²·K', 20, 600, 10, [1, 10000], { visible: inSituOn, hint: 'Aire ≈ 25 · camisa de agua ≈ 150–400' }),
      nb('ventAirPenalty', 'Factor de calidad por atrapamiento de aire', '', 0.5, 1, 0.01, [0.01, 1], { decimals: 2, advanced: true }),
      nb('ventFlashPenalty', 'Factor de calidad por rebaba', '', 0.5, 1, 0.01, [0.01, 1], { decimals: 2, advanced: true }),
      nb('blockedWarnPct', 'Aviso de extrusor bloqueado', '%', 5, 60, 1, [0, 100], { advanced: true }),
    ],
  },
];

export const COST_GROUPS: FieldGroup<CostParams, NumKeyC>[] = [
  {
    id: 'costs',
    title: 'Costos y CAPEX (USD)',
    fields: [
      nc('capexA', 'Inversión Método A (prensa 1000 t + acumulador + chiller + moldes)', '$', 100000, 2000000, 10000, [0, 1e9]),
      nc('capexB', 'Inversión Método B (extrusor + válvula T + puestos y moldes reforzados)', '$', 100000, 2000000, 10000, [0, 1e9]),
      nc('costScrap', 'PE scrap', '$/kg', 0.1, 2, 0.05, [0, 100], { decimals: 2 }),
      nc('costGlass', 'Fibra de vidrio', '$/kg', 0.5, 5, 0.1, [0, 200], { decimals: 2 }),
      nc('costCoupling', 'PE-g-MA', '$/kg', 1, 12, 0.1, [0, 500], { decimals: 2 }),
      nc('costSteel', 'Acero corrugado', '$/kg', 0.5, 3, 0.05, [0, 100], { decimals: 2 }),
      nc('laborRate', 'Costo hora operario', '$/h', 3, 50, 0.5, [0, 1000], { decimals: 1 }),
      nc('energyRate', 'Costo de energía eléctrica', '$/kWh', 0.03, 0.4, 0.01, [0, 10], { decimals: 2 }),
      nc('amortYears', 'Años de amortización', 'años', 1, 15, 1, [0.5, 50]),
      nc('hoursPerYear', 'Horas de operación al año', 'h', 1000, 8000, 100, [1, 8760]),
      nc('operatorsA', 'Operarios del Método A', '', 1, 8, 1, [1, 50], { int: true }),
      nc('kWhKgA', 'Energía de extrusión Método A', 'kWh/kg', 0.1, 0.6, 0.01, [0, 5], { decimals: 2, advanced: true }),
      nc('pressKW', 'Potencia media de la prensa en ciclo', 'kW', 10, 200, 5, [0, 5000], { advanced: true }),
      nc('chillerKW', 'Chiller continuo Método A', 'kW', 0, 150, 5, [0, 5000], { advanced: true }),
      nc('kWhKgB', 'Energía de extrusión Método B', 'kWh/kg', 0.1, 0.6, 0.01, [0, 5], { decimals: 2, advanced: true }),
      nc('hoistKW', 'Potencia del polipasto', 'kW', 1, 30, 1, [0, 500], { advanced: true }),
      nc('coolKWB', 'Refrigeración continua Método B (chiller / camisas)', 'kW', 0, 150, 5, [0, 5000], { advanced: true }),
    ],
  },
];

export const B_BY_KEY = new Map<string, NumField<IntrusionParams, NumKeyB>>(B_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f]));
export const COST_BY_KEY = new Map<string, NumField<CostParams, NumKeyC>>(COST_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f]));
