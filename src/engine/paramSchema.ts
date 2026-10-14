import type { ProcessParams } from '../types/simulation';

export type NumKey = {
  [K in keyof ProcessParams]: ProcessParams[K] extends number ? K : never;
}[keyof ProcessParams];

export interface NumField {
  key: NumKey;
  label: string;
  unit: string;
  /** Rango del slider (orientativo) */
  min: number;
  max: number;
  step: number;
  /** Límites duros admitidos al teclear/importar: [mínimo, máximo] */
  hard: [number, number];
  decimals?: number;
  hint?: string;
  int?: boolean;
  advanced?: boolean;
  visible?: (p: ProcessParams) => boolean;
  disabled?: (p: ProcessParams) => boolean;
}

export interface FieldGroup {
  id: string;
  title: string;
  fields: NumField[];
}

type Opt = Partial<Pick<NumField, 'decimals' | 'hint' | 'int' | 'advanced' | 'visible' | 'disabled'>>;
const n = (
  key: NumKey,
  label: string,
  unit: string,
  min: number,
  max: number,
  step: number,
  hard: [number, number],
  opt: Opt = {},
): NumField => ({ key, label, unit, min, max, step, hard, ...opt });

export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: 'geometry',
    title: 'Geometría y pieza',
    fields: [
      n('massKg', 'Masa neta de la pieza', 'kg', 1, 80, 0.5, [0.1, 1000], { decimals: 1 }),
      n('projectedAreaM2', 'Área proyectada exterior total', 'm²', 0.05, 1.5, 0.01, [0.005, 20], { decimals: 2 }),
      n('voidPct', 'Factor de huecos / área abierta', '%', 0, 60, 1, [0, 95], { hint: 'Vaciado de rejillas/marcos: reduce el área efectiva de prensado y la rigidez' }),
      n('ribThkMm', 'Espesor crítico de enfriamiento', 'mm', 10, 60, 1, [2, 200], { hint: 'Nervadura crítica: el tiempo de enfriamiento crece con e²' }),
      n('breakLoadKN', 'Carga de ensayo / rotura exigida', 'kN', 50, 600, 5, [1, 5000], { hint: 'Manual: cualquier valor en kN' }),
      n('maxResidualMm', 'Flecha residual máxima admisible', 'mm', 0.5, 5, 0.1, [0.01, 50], { decimals: 1 }),
      n('proofLoadPct', 'Carga del ensayo de flecha (% de la rotura)', '%', 30, 100, 0.1, [1, 100], { decimals: 1, advanced: true }),
      n('openingMm', 'Diámetro de paso libre', 'mm', 200, 1000, 10, [50, 3000], { advanced: true }),
      n('plateThkMm', 'Espesor de placa (tablero)', 'mm', 4, 30, 1, [1, 100], { advanced: true }),
      n('ribHeightMm', 'Altura total de nervadura', 'mm', 30, 160, 1, [5, 400], { advanced: true }),
      n('ribSpacingMm', 'Paso entre nervaduras', 'mm', 40, 200, 1, [10, 600], { advanced: true }),
      n('padRadiusMm', 'Radio equivalente de la almohadilla de ensayo', 'mm', 50, 250, 1, [10, 600], { advanced: true }),
    ],
  },
  {
    id: 'material',
    title: 'Formulación y propiedades',
    fields: [
      n('glassPct', 'Fibra de vidrio', '% p/p', 0, 40, 1, [0, 70]),
      n('carbonPct', 'Negro de humo (UV)', '% p/p', 0, 4, 0.1, [0, 10], { decimals: 1 }),
      n('meltTempC', 'Temperatura inicial de la masa fundida T₀', '°C', 170, 220, 1, [100, 320]),
      n('eMatrixMPa', 'Módulo elástico del PEAD base', 'MPa', 500, 2000, 10, [50, 10000]),
      n('eFiberGPa', 'Módulo elástico de la fibra de vidrio', 'GPa', 50, 90, 1, [5, 500]),
      n('latentKJkg', 'Calor latente de cristalización', 'kJ/kg', 0, 300, 5, [0, 1000]),
      n('crystTempC', 'Temperatura de transición (cristalización)', '°C', 90, 135, 1, [20, 250]),
      n('kComposite', 'Conductividad térmica del composite', 'W/m·K', 0.2, 1.2, 0.01, [0.02, 20], {
        decimals: 2,
        visible: (p) => !p.kAuto,
      }),
      n('crystFracPct', 'Fracción cristalina que libera calor latente', '%', 0, 100, 1, [0, 100], { advanced: true }),
      n('crystWidthC', 'Ancho del pico de cristalización', '°C', 1, 20, 0.5, [0.5, 60], { decimals: 1, advanced: true }),
      n('kMatrix', 'Conductividad de la matriz PEAD (Maxwell)', 'W/m·K', 0.2, 0.8, 0.01, [0.02, 20], { decimals: 2, advanced: true }),
      n('kFiber', 'Conductividad de la fibra (Maxwell)', 'W/m·K', 0.5, 2, 0.05, [0.02, 50], { decimals: 2, advanced: true }),
      n('rhoFiber', 'Densidad de la fibra de vidrio', 'g/cm³', 2, 3, 0.01, [0.5, 10], { decimals: 2, advanced: true }),
      n('rhoMatrix', 'Densidad del PEAD', 'g/cm³', 0.8, 1.1, 0.005, [0.3, 3], { decimals: 3, advanced: true }),
      n('cpMatrix', 'Calor específico del PEAD sólido', 'J/kg·K', 1500, 3000, 50, [200, 6000], { advanced: true }),
      n('cpFiber', 'Calor específico de la fibra', 'J/kg·K', 500, 1200, 10, [200, 6000], { advanced: true }),
      n('alphaMatrix', 'Expansión térmica del PEAD', '×10⁻⁶/K', 60, 250, 5, [1, 800], { advanced: true }),
      n('alphaFiber', 'Expansión térmica de la fibra', '×10⁻⁶/K', 1, 15, 0.5, [0, 100], { decimals: 1, advanced: true }),
      n('fiberAspect', 'Relación de aspecto de la fibra (l/d)', '', 5, 200, 1, [1, 2000], { advanced: true }),
      n('poisson', 'Coeficiente de Poisson', '', 0.3, 0.45, 0.01, [0.05, 0.49], { decimals: 2, advanced: true }),
      n('sigmaMatrixMPa', 'Resistencia de la matriz sin refuerzo', 'MPa', 10, 50, 1, [1, 300], { advanced: true }),
      n('strengthPerGlass', 'Ganancia de resistencia por % de fibra', 'MPa/%', 0, 3, 0.1, [0, 20], { decimals: 1, advanced: true }),
      n('glassOverloadPct', 'Fibra a partir de la cual cae la resistencia', '% p/p', 25, 45, 1, [5, 70], { advanced: true }),
      n('glassOverloadSlope', 'Pérdida de resistencia por % excedido', 'MPa/%', 0, 3, 0.1, [0, 20], { decimals: 1, advanced: true }),
      n('shrinkCrystPct', 'Contracción de cristalización del PEAD puro', '%', 0.5, 4, 0.1, [0, 10], { decimals: 1, advanced: true }),
      n('shrinkDecay', 'Atenuación de la contracción por fibra', '', 0, 15, 0.5, [0, 50], { decimals: 1, advanced: true }),
    ],
  },
  {
    id: 'extruder',
    title: 'Extrusor y acumulador',
    fields: [
      n('extruderKgH', 'Caudal de plastificación continuo', 'kg/h', 60, 2400, 10, [1, 20000], { hint: 'Determina el tiempo de llenado del acumulador' }),
      n('overweightPct', 'Sobrepeso por rebaba / purga', '%', 0, 8, 0.1, [0, 50], { decimals: 1 }),
    ],
  },
  {
    id: 'press',
    title: 'Prensa hidráulica y moldeo',
    fields: [
      n('pressTon', 'Tonelaje nominal de cierre', 't', 400, 1200, 10, [1, 10000]),
      n('pressTimeS', 'Tiempo de prensado puro a plena carga', 's', 20, 90, 1, [1, 1800]),
      n('minPressureMPa', 'Umbral mínimo de presión específica', 'MPa', 5, 30, 0.5, [0.1, 200], { decimals: 1 }),
      n('loadS', 'Carga de masa (mesa lanzadera)', 's', 5, 90, 1, [0, 900], { advanced: true }),
      n('openS', 'Apertura de prensa y salida del molde', 's', 3, 60, 1, [0, 600], { advanced: true }),
      n('pressBaseMPa', 'Presión de llenado base', 'MPa', 4, 20, 0.5, [0.1, 200], { decimals: 1, advanced: true }),
      n('pressPerGlassMPa', 'Aumento de presión por % de fibra', 'MPa/%', 0, 0.4, 0.01, [0, 5], { decimals: 2, advanced: true }),
      n('pressPerMeltMPa', 'Aumento de presión por °C bajo 190 °C', 'MPa/°C', 0, 0.4, 0.01, [0, 5], { decimals: 2, advanced: true }),
      n('pressRibExp', 'Exponente de sensibilidad al espesor de nervio', '', 0, 1, 0.05, [0, 3], { decimals: 2, advanced: true }),
      n('moldTempC', 'Temperatura del molde en prensa', '°C', 20, 100, 1, [0, 250], { advanced: true }),
    ],
  },
  {
    id: 'kinematics',
    title: 'Cinemática y operarios',
    fields: [
      n('pinS', 'Colocación y apriete de pasadores roscados', 's', 20, 120, 1, [0, 1800], { hint: 'Ocupa la estación de prensa' }),
      n('unpinS', 'Desapriete y retiro de tensores', 's', 10, 120, 1, [0, 1800]),
      n('craneMoveS', 'Maniobra y traslado de grúa', 's', 15, 60, 1, [1, 600], { hint: 'Por movimiento (2 por pieza)' }),
      n('demoldS', 'Desmoldeo y extracción de pieza', 's', 20, 180, 1, [0, 1800]),
      n('demoldStations', 'Estaciones de desmoldeo', '', 1, 4, 1, [1, 12], { int: true }),
      n('returnS', 'Retorno del molde vacío a la prensa', 's', 10, 120, 1, [0, 900], { advanced: true }),
    ],
  },
  {
    id: 'bath',
    title: 'Batea de enfriamiento',
    fields: [
      n('bathTempC', 'Temperatura del agua', '°C', 10, 35, 1, [0, 90]),
      n('bathSlots', 'Capacidad máxima del tanque', 'posiciones', 4, 20, 1, [1, 40], { int: true }),
      n('moldCount', 'Moldes en la flota rotativa (N)', 'moldes', 2, 24, 1, [1, 60], { int: true }),
      n('targetCoreC', 'Temperatura objetivo de núcleo', '°C', 40, 60, 1, [20, 120], { hint: 'Modo temperatura: criterio de salida. Modo fijo: referencia de la alerta' }),
      n('bathDwellMin', 'Tiempo fijo manual en batea', 'min', 5, 35, 1, [0.5, 600], { visible: (p) => p.dwellMode === 'fixed' }),
      n('hWater', 'Coeficiente de convección del agua recirculada', 'W/m²·K', 200, 2000, 50, [10, 20000], { advanced: true }),
      n('steelThkMm', 'Espesor de acero del molde', 'mm', 10, 100, 1, [1, 500], { advanced: true }),
      n('kSteel', 'Conductividad del acero del molde', 'W/m·K', 15, 60, 1, [1, 500], { advanced: true }),
      n('contactResBath', 'Resistencia de contacto pieza-molde en batea', '×10⁻³ m²K/W', 0, 8, 0.1, [0, 100], { decimals: 1, advanced: true }),
      n('contactResPress', 'Resistencia de contacto pieza-molde en prensa', '×10⁻³ m²K/W', 0, 4, 0.1, [0, 100], { decimals: 1, advanced: true }),
      n('hAir', 'Convección en traslado (aire)', 'W/m²·K', 5, 100, 1, [0.1, 1000], { advanced: true }),
      n('ambientC', 'Temperatura ambiente', '°C', 0, 45, 1, [-30, 60], { advanced: true }),
      n('searchHorizonMin', 'Horizonte de cálculo térmico en batea', 'min', 30, 240, 5, [10, 600], { advanced: true }),
    ],
  },
  {
    id: 'plant',
    title: 'Planta, OEE y calibración mecánica',
    fields: [
      n('availabilityPct', 'Disponibilidad planificada (OEE)', '%', 50, 100, 1, [1, 100], { advanced: true }),
      n('shiftH', 'Duración del turno', 'h', 4, 12, 0.5, [1, 24], { decimals: 1, advanced: true }),
      n('simHorizonH', 'Horizonte de simulación', 'h', 4, 24, 1, [1, 72], { advanced: true }),
      n('warmupH', 'Arranque excluido de las métricas', 'h', 0, 6, 0.5, [0, 20], { decimals: 1, advanced: true }),
      n('loadSpread', 'Reparto de carga (almohadilla, asiento, malla)', '', 0.2, 1.5, 0.01, [0.01, 5], { decimals: 2, advanced: true }),
      n('supportClamp', 'Grado de empotramiento del asiento (1 = apoyo simple)', '', 0.41, 1, 0.01, [0.1, 1], { decimals: 2, advanced: true }),
      n('padFactor', 'Reducción de flecha por carga repartida', '', 0.5, 1, 0.01, [0.1, 1.5], { decimals: 2, advanced: true }),
      n('gridFactor', 'Aporte de nervaduras en dos direcciones', '', 1, 2, 0.05, [0.5, 4], { decimals: 2, advanced: true }),
      n('yieldFrac', 'Fluencia / resistencia última', '', 0.3, 0.9, 0.01, [0.05, 1], { decimals: 2, advanced: true }),
      n('creepBase', 'Fluencia: fracción residual base', '', 0, 0.2, 0.005, [0, 2], { decimals: 3, advanced: true }),
      n('creepGain', 'Fluencia: ganancia por nivel de tensión', '', 0, 1, 0.01, [0, 10], { decimals: 2, advanced: true }),
    ],
  },
  {
    id: 'thresholds',
    title: 'Umbrales de alerta y calidad',
    fields: [
      n('glassMinRec', 'Fibra mínima recomendada', '%', 5, 30, 1, [0, 70], { advanced: true }),
      n('glassMaxRec', 'Fibra máxima recomendada', '%', 25, 45, 1, [0, 70], { advanced: true }),
      n('meltMin', 'Masa fundida: mínimo recomendado', '°C', 160, 200, 1, [50, 320], { advanced: true }),
      n('meltMax', 'Masa fundida: máximo recomendado', '°C', 190, 220, 1, [50, 320], { advanced: true }),
      n('meltCritical', 'Masa fundida: umbral de degradación', '°C', 200, 240, 1, [50, 400], { advanced: true }),
      n('carbonMin', 'Negro de humo mínimo (UV)', '%', 0.5, 2.5, 0.1, [0, 10], { decimals: 1, advanced: true }),
      n('carbonMax', 'Negro de humo máximo', '%', 2, 5, 0.1, [0, 10], { decimals: 1, advanced: true }),
      n('carbonTargetPct', 'Negro de humo con índice UV = 100 %', '%', 1, 4, 0.1, [0.1, 10], { decimals: 1, advanced: true }),
      n('bathWarnC', 'Agua de batea: umbral de aviso', '°C', 20, 50, 1, [0, 90], { advanced: true }),
      n('warpWarnMmM', 'Alabeo: aviso', 'mm/m', 0.5, 5, 0.1, [0.01, 50], { decimals: 1, advanced: true }),
      n('warpCritMmM', 'Alabeo: crítico', 'mm/m', 1, 10, 0.1, [0.01, 100], { decimals: 1, advanced: true }),
      n('sinkWarnPct', 'Rechupes: aviso', '%', 10, 100, 5, [0, 100], { advanced: true }),
      n('safetyWarn', 'Coeficiente de seguridad mínimo (aviso)', '', 1, 2, 0.01, [1, 10], { decimals: 2, advanced: true }),
      n('craneUtilWarnPct', 'Grúa saturada: umbral', '%', 50, 100, 1, [1, 100], { advanced: true }),
      n('pressBlockedWarnPct', 'Prensa retenida: umbral', '%', 1, 50, 1, [0, 100], { advanced: true }),
      n('overPressRatio', 'Prensa sobredimensionada: relación fuerza/requerida', '', 1.2, 3, 0.05, [1, 20], { decimals: 2, advanced: true }),
      n('shortPressS', 'Prensado puro mínimo recomendado', 's', 10, 90, 1, [0, 600], { advanced: true }),
      n('qualityBasePct', 'Rendimiento de calidad base', '%', 80, 100, 0.5, [1, 100], { decimals: 1, advanced: true }),
      n('warpPenalty', 'Penalización de calidad por alabeo', '', 0, 1, 0.01, [0, 10], { decimals: 2, advanced: true }),
      n('sinkPenalty', 'Penalización de calidad por rechupes', '', 0, 1, 0.01, [0, 1], { decimals: 2, advanced: true }),
      n('uvPenalty', 'Penalización de calidad por UV insuficiente', '', 0, 1, 0.01, [0, 1], { decimals: 2, advanced: true }),
      n('meltPenalty', 'Factor de calidad por degradación térmica', '', 0.3, 1, 0.01, [0.01, 1], { decimals: 2, advanced: true }),
      n('lowPressPenaltyFloor', 'Factor mínimo de calidad por presión baja', '', 0.1, 1, 0.01, [0.01, 1], { decimals: 2, advanced: true }),
      n('nonConformFactor', 'Factor de calidad si no cumple EN 124', '', 0, 1, 0.05, [0, 1], { decimals: 2, advanced: true }),
      n('warpDiffWeight', 'Alabeo: peso del gradiente núcleo-piel', '', 0, 2, 0.05, [0, 10], { decimals: 2, advanced: true }),
      n('warpResidualWeight', 'Alabeo: peso de la contracción residual', '', 0, 1, 0.05, [0, 10], { decimals: 2, advanced: true }),
      n('warpScale', 'Alabeo: factor de escala', '', 0.2, 5, 0.1, [0, 50], { decimals: 1, advanced: true }),
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);
export const FIELD_BY_KEY = new Map<NumKey, NumField>(ALL_FIELDS.map((f) => [f.key, f]));
