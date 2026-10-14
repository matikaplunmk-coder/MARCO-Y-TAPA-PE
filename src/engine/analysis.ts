import type { Alert, Analysis, Bottleneck, BottleneckId, ProcessParams, StageTimes } from '../types/simulation';
import { PARTS } from './parts';
import { evaluateEN124 } from './mechanicalPhysics';
import { evaluateProcess, slugMassKg } from './processModel';
import { runDES } from './simulationEngine';
import { simulateCooling } from './thermalPhysics';

export const AVAILABILITY = 0.92; // paradas planificadas, cambios de molde, mantenimiento
export const SHIFT_H = 8;
const LOAD_S = 25; // mesa lanzadera: sale, recibe masa, reingresa
const OPEN_S = 12; // apertura de prensa y salida del molde trabado
const RETURN_S = 40; // retorno del molde vacío a la prensa

export function stageTimes(p: ProcessParams): StageTimes {
  const part = PARTS[p.partId];
  return {
    loadS: LOAD_S,
    pressS: p.pressTimeS,
    openS: OPEN_S,
    craneS: p.craneMoveS,
    coolS: p.bathDwellMin * 60,
    demoldS: p.demoldS,
    returnS: RETURN_S,
    slugS: (slugMassKg(part) / p.extruderKgH) * 3600,
  };
}

function findBottleneck(p: ProcessParams, t: StageTimes): Bottleneck {
  const loopS = t.loadS + t.pressS + t.openS + 2 * t.craneS + t.coolS + t.demoldS + t.returnS;
  const capacities: Record<BottleneckId, number> = {
    Prensa: 3600 / (t.loadS + t.pressS + t.openS),
    Batea: (p.bathSlots * 3600) / (t.coolS + t.craneS),
    'Flota de moldes': (p.moldCount * 3600) / loopS,
    Grúa: 3600 / (2 * t.craneS),
    Desmoldeo: (p.demoldStations * 3600) / t.demoldS,
    Extrusor: 3600 / t.slugS,
  };
  let id: BottleneckId = 'Prensa';
  for (const k of Object.keys(capacities) as BottleneckId[]) if (capacities[k] < capacities[id]) id = k;
  const explain: Record<BottleneckId, string> = {
    Prensa: 'La prensa limita la línea: el ciclo de carga + permanencia + apertura marca el takt. Reducir el tiempo de prensa es la palanca.',
    Batea: 'La batea limita la línea: el enfriamiento ocupa las posiciones demasiado tiempo. Añadir posiciones, bajar la temperatura del agua o reducir el espesor crítico.',
    'Flota de moldes': 'Faltan moldes en circulación: la prensa espera un molde vacío mientras el resto se enfría. Aumentar la flota de moldes rotativos.',
    Grúa: 'El puente grúa es el cuello de botella: dos traslados por pieza. Acortar el traslado o duplicar la grúa.',
    Desmoldeo: 'La estación de desmoldeo no da abasto: añadir estaciones o reducir el tiempo de desenroscado/desmoldeo.',
    Extrusor: 'El extrusor no alcanza a generar la masa a tiempo: aumentar el caudal o instalar un acumulador mayor.',
  };
  return { id, capacities, explanation: explain[id] };
}

export function analyze(p: ProcessParams): Analysis {
  const part = PARTS[p.partId];
  const times = stageTimes(p);

  const cooling = simulateCooling(p, {
    pressS: times.pressS,
    openS: times.openS,
    craneS: times.craneS,
    dwellS: times.coolS,
  });

  const process = evaluateProcess(p, part, cooling.coreAtDwell, cooling.surfaceAtDwell);
  const mech = evaluateEN124({
    part,
    glassPct: p.glassPct,
    carbonPct: p.carbonPct,
    ribThkMm: p.ribThkMm,
    fillFactor: Math.min(1, process.fillRatio) ** 2,
    residualFactor: 1 - 0.1 * Math.min(1, process.warpMmPerM / 3) - 0.15 * process.sinkRisk,
  });

  const des = runDES(p, times, {
    horizonS: 10 * 3600,
    windowStartS: 2 * 3600,
    kBathIn: cooling.tBathIn,
  });
  const bottleneck = findBottleneck(p, times);

  // OEE = disponibilidad × rendimiento (ritmo real / ritmo ideal de prensa) × calidad
  let quality = process.qualityYield;
  if (!mech.passBreak || !mech.passDeflection) quality *= 0.5;
  const pressCapacity = bottleneck.capacities.Prensa;
  const performance = Math.min(1, des.piecesPerHour / pressCapacity);
  const oee = {
    availability: AVAILABILITY,
    performance,
    quality,
    oee: AVAILABILITY * performance * quality,
  };
  const piecesPerShift = des.piecesPerHour * SHIFT_H * AVAILABILITY;
  const goodPiecesPerShift = piecesPerShift * quality;

  return {
    part,
    times,
    cooling,
    mech,
    process,
    des,
    bottleneck,
    oee,
    piecesPerShift,
    goodPiecesPerShift,
    alerts: buildAlerts(p, { part, times, cooling, mech, process, des, bottleneck }),
  };
}

type AlertCtx = Pick<Analysis, 'part' | 'times' | 'cooling' | 'mech' | 'process' | 'des' | 'bottleneck'>;

function buildAlerts(p: ProcessParams, a: AlertCtx): Alert[] {
  const out: Alert[] = [];
  const add = (severity: Alert['severity'], id: string, title: string, detail: string) =>
    out.push({ id, severity, title, detail });
  const reqMin = a.cooling.timeToCore50S / 60;
  const fmt = (x: number, d = 1) => x.toFixed(d);

  // Prensa
  if (a.process.fillRatio < 0.85)
    add('critical', 'ton', 'Tonelaje insuficiente: llenado incompleto',
      `Se requieren ≈ ${fmt(a.process.requiredTon, 0)} t para el área proyectada (${fmt(a.part.projectedAreaM2, 2)} m², Ø${a.part.outerMm} mm); hay ${p.pressTon} t. Nervaduras sin llenar y asiento cónico de 35° deficiente.`);
  else if (a.process.fillRatio < 1)
    add('warn', 'ton', 'Tonelaje justo',
      `Margen negativo de ${fmt((1 - a.process.fillRatio) * 100, 0)} %: riesgo de falta de llenado en nervaduras. Necesarias ≈ ${fmt(a.process.requiredTon, 0)} t.`);
  else if (a.process.fillRatio > 1.6)
    add('info', 'ton-high', 'Prensa sobredimensionada',
      `Se usa ${fmt(100 / a.process.fillRatio, 0)} % de la fuerza disponible; exceso de presión → rebaba excesiva y desgaste del molde.`);

  if (p.pressTimeS < 90)
    add('warn', 'ptime', 'Permanencia en prensa corta',
      'Por debajo de 90 s la piel no consolida y no hay tiempo seguro para enroscar los pasadores bajo presión nominal.');
  else if (p.pressTimeS > 120)
    add('info', 'ptime', 'Permanencia en prensa larga', 'Sobre 120 s la prensa pierde productividad sin ganancia de calidad.');

  // Enfriamiento
  if (!isFinite(a.cooling.timeToCore50S)) {
    add('critical', 'cool', 'El núcleo no baja de 50 °C',
      'Con este espesor y temperatura de agua el núcleo no se enfría dentro del horizonte simulado.');
  } else if (a.times.coolS < a.cooling.timeToCore50S * 0.8) {
    add('critical', 'cool', 'Tiempo en batea insuficiente: riesgo de alabeo y rechupes',
      `Se programan ${fmt(a.times.coolS / 60, 0)} min, pero el núcleo necesita ≈ ${fmt(reqMin)} min para bajar de 50 °C. Saldrá a ${fmt(a.cooling.coreAtDwell, 0)} °C.`);
  } else if (a.times.coolS < a.cooling.timeToCore50S) {
    add('warn', 'cool', 'Tiempo en batea ajustado',
      `El núcleo requiere ≈ ${fmt(reqMin)} min y se programan ${fmt(a.times.coolS / 60, 0)} min (núcleo ${fmt(a.cooling.coreAtDwell, 0)} °C).`);
  } else if (a.times.coolS > a.cooling.timeToCore50S * 1.3) {
    add('info', 'cool', 'Sobre-enfriamiento',
      `Permanencia ${fmt(a.times.coolS / 60, 0)} min vs. ${fmt(reqMin)} min necesarios: se desperdicia capacidad de batea.`);
  }
  if (p.bathTempC > 30) add('warn', 'bath', 'Agua de batea caliente', 'Sobre 30 °C el gradiente térmico cae y el enfriamiento se alarga; revisar el chiller.');
  if (a.process.warpMmPerM > 4) add('critical', 'warp', 'Alabeo previsto elevado', `≈ ${fmt(a.process.warpMmPerM)} mm/m por contracción diferencial núcleo-superficie.`);
  else if (a.process.warpMmPerM > 2) add('warn', 'warp', 'Riesgo de alabeo', `≈ ${fmt(a.process.warpMmPerM)} mm/m; el asiento puede perder planitud.`);
  if (a.process.sinkRisk > 0.5) add('warn', 'sink', 'Riesgo de rechupes', `Índice ${fmt(a.process.sinkRisk * 100, 0)} %: el núcleo contrae después de solidificar la piel.`);

  // Formulación
  if (p.glassPct > 35) add('warn', 'fv-high', 'Fibra de vidrio excesiva', 'Sobre 35 % hay mojado deficiente, rotura de fibra y pérdida de resistencia/fluidez.');
  else if (p.glassPct < 20) add('info', 'fv-low', 'Fibra de vidrio baja', 'Bajo 20 % la rigidez es limitada para clases D400/C250.');
  if (p.carbonPct < 1.5) add('warn', 'cb-low', 'Protección UV insuficiente', 'Menos de 1,5 % de negro de humo incumple el objetivo de estabilización UV (ISO 17855 / ISO 7686).');
  else if (p.carbonPct > 3) add('warn', 'cb-high', 'Exceso de negro de humo', 'Sobre 3 % se reduce la tenacidad y aumenta la viscosidad.');
  if (p.meltTempC < 180) add('warn', 'melt-low', 'Masa fundida fría', 'Bajo 180 °C sube la viscosidad: más presión y riesgo de líneas de soldadura.');
  else if (p.meltTempC > 210) add('critical', 'melt-high', 'Degradación térmica', 'Sobre 210 °C hay oxidación del PEAD y pérdida de propiedades.');
  else if (p.meltTempC > 200) add('warn', 'melt-high', 'Masa fundida caliente', 'Sobre 200 °C el enfriamiento se alarga y aumenta el riesgo de rechupes.');

  // EN 124
  if (!a.mech.passDeflection)
    add('critical', 'en-def', `UNE-EN 124 ${a.part.loadClass}: deformación permanente fuera de límite`,
      `${fmt(a.mech.permanentDeflMm, 2)} mm tras ${fmt((2 / 3) * a.part.breakLoadKN, 1)} kN (máx. 2,0 mm).`);
  if (!a.mech.passBreak)
    add('critical', 'en-break', `UNE-EN 124 ${a.part.loadClass}: carga de rotura insuficiente`,
      `Rotura estimada ${fmt(a.mech.failureLoadKN, 0)} kN < ${a.part.breakLoadKN} kN exigidos.`);
  if (a.mech.passBreak && a.mech.passDeflection && a.mech.safetyFactor < 1.15)
    add('warn', 'en-margin', 'Margen de seguridad EN 124 reducido', `Coeficiente de seguridad ${fmt(a.mech.safetyFactor, 2)}; la dispersión de proceso puede dejar piezas fuera de norma.`);

  // Línea
  if (a.des.util.crane > 0.85) add('warn', 'crane', 'Grúa saturada', `Utilización ${fmt(a.des.util.crane * 100, 0)} %: riesgo de esperas en prensa y batea.`);
  if (a.des.util.extruder > 0.95) add('warn', 'ext', 'Extrusor al límite', 'No hay holgura para absorber paradas del acumulador.');
  if (a.des.util.pressBlocked > 0.08)
    add('warn', 'blocked', 'Prensa retenida', `La prensa pasa ${fmt(a.des.util.pressBlocked * 100, 0)} % del tiempo con un molde cerrado esperando grúa/posición libre en batea.`);

  const hasProblem = out.some((x) => x.severity === 'critical' || x.severity === 'warn');
  if (!hasProblem) add('ok', 'ok', 'Parámetros dentro de ventana de proceso', 'Cumple EN 124, enfriamiento suficiente y tonelaje adecuado.');
  const order = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((x, y) => order[x.severity] - order[y.severity]);
}
