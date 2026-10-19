import type { Alert, ProcessParams } from '../types/simulation';
import type { IntrusionAnalysis, IntrusionParams, StageTimesB } from '../types/intrusion';
import { buildEN124Model } from './mechanicalPhysics';
import { getPart, classLabel } from './parts';
import { runIntrusionDES } from './intrusionDES';
import { cageSpec, intrusionModulus, intrusionStrength, massBreakdown } from './intrusionMechanics';
import { analyzeRheology } from './rheology';
import { applyDwell, simulateCooling, warpIndex } from './thermalPhysics';

export { runIntrusionDES } from './intrusionDES';

/** Parámetros del Método A adaptados al compuesto y a las condiciones térmicas del Método B */
function thermalParams(a: ProcessParams, b: IntrusionParams): ProcessParams {
  return {
    ...a,
    glassPct: b.glassPct,
    carbonPct: b.carbonPct,
    meltTempC: b.meltTempC,
    bathTempC: b.coolMode === 'bath' ? b.bathTempC : b.jacketTempC,
  };
}

export function stageTimesB(b: IntrusionParams, fillS: number, coolS: number): StageTimesB {
  const cageS = b.reinforcement === 'pure' ? 0 : b.cagePlaceS;
  return {
    prepS: cageS + b.boltS,
    cageS,
    boltS: b.boltS,
    switchS: b.switchS,
    fillS,
    holdS: b.holdS,
    coolS,
    hoistS: b.coolMode === 'bath' ? b.hoistS : 0,
    unboltS: b.unboltS,
    extractS: b.extractS,
  };
}

/**
 * Método B · Intrusión directa con manifold en "T".
 * Pipeline: reología/atrición → propiedades del compuesto → térmico → DES → EN 124 → calidad/alertas.
 */
export function analyzeB(a: ProcessParams, b: IntrusionParams): IntrusionAnalysis {
  const part = getPart(a);
  const rheo = analyzeRheology(a, part, b);
  const bath = b.coolMode === 'bath';
  const pp = thermalParams(a, b);
  const fillS = rheo.fillS;

  // Térmico: t=0 en el centro del llenado; contacto con el molde hasta el fin del mantenimiento
  const pressEquiv = b.holdS + fillS / 2;
  const hFilm = bath ? undefined : { hBath: b.hInSitu };
  const curve = simulateCooling(pp, { pressS: pressEquiv, openS: 0, craneS: bath ? b.hoistS : 0 }, b.coolTargetC, hFilm);
  const reqS = curve.timeToTargetS;
  const coolS =
    b.dwellMode === 'temperature'
      ? isFinite(reqS)
        ? Math.ceil(reqS)
        : a.searchHorizonMin * 60
      : Math.round(b.coolFixedMin * 60);
  const cooling = applyDwell(curve, coolS);
  const times = stageTimesB(b, fillS, coolS);

  // Calidad de proceso
  const warp = warpIndex(pp, cooling.coreAtDwell, cooling.surfaceAtDwell);
  const sinkRisk = Math.min(
    1,
    Math.max(0, (cooling.coreAtDwell - 50) / 50) * 0.8 + Math.max(0, (a.ribThkMm - 30) / 30) * 0.15 + Math.max(0, rheo.dPtotalBar / b.pMaxBar - 1) * 1.5,
  );
  const fillRatio = Math.min(1, b.pMaxBar / Math.max(1e-6, rheo.dPtotalBar));
  const uvIndex = Math.min(1.2, b.carbonPct / a.carbonTargetPct);
  const venting = b.ventDepthMm < b.ventMinMm ? 'air' : b.ventDepthMm > b.ventMaxMm ? 'flash' : 'ok';

  let quality = a.qualityBasePct / 100;
  quality *= Math.pow(fillRatio, 3);
  quality *= Math.exp(-Math.max(0, warp - a.warpWarnMmM * 0.75) * a.warpPenalty);
  quality *= 1 - a.sinkPenalty * sinkRisk;
  if (uvIndex < 1) quality *= 1 - a.uvPenalty * (1 - uvIndex);
  if (b.meltTempC > a.meltCritical) quality *= a.meltPenalty;
  if (venting === 'air') quality *= b.ventAirPenalty;
  if (venting === 'flash') quality *= b.ventFlashPenalty;
  if (rheo.moldOpenKN > rheo.boltCapacityKN) quality *= 0.7;

  // Mecánica EN 124 con fibra real y armadura
  const { E } = intrusionModulus(a, b, rheo);
  const sigmaU = intrusionStrength(a, b, rheo) * fillRatio ** 2 * (1 - 0.1 * Math.min(1, warp / 3) - 0.15 * sinkRisk);
  const mech = buildEN124Model({ p: a, part, E, sigmaU, cage: cageSpec(part, b) }).result;
  const mass = massBreakdown(a, part, b);

  // DES
  const des = runIntrusionDES(b, times, {
    horizonS: a.simHorizonH * 3600,
    windowStartS: Math.min(a.warmupH, a.simHorizonH * 0.8) * 3600,
    kCoolStart: cooling.tBathIn,
    fillS,
  });

  // Capacidades teóricas (pz/h)
  const manualS = times.prepS + times.unboltS + times.extractS;
  const loopS =
    times.prepS + times.hoistS * (bath ? 3 : 0) + times.switchS + times.fillS + times.holdS + times.coolS + times.unboltS + times.extractS;
  const fleet = des.moldCount;
  const capacities: Record<string, number> = {
    Extrusor: 3600 / (times.fillS + times.switchS),
    Operarios: (b.operators * 3600) / manualS,
    'Flota / puestos de molde': (fleet * 3600) / loopS,
  };
  if (bath) {
    capacities['Batea'] = (b.bathSlots * 3600) / (times.coolS + times.hoistS);
    capacities['Polipasto'] = 3600 / (3 * times.hoistS);
  }
  let bnId = 'Extrusor';
  for (const k of Object.keys(capacities)) if (capacities[k] < capacities[bnId]) bnId = k;
  const explain: Record<string, string> = {
    Extrusor: 'El extrusor es el límite: cada cavidad consume su tiempo de llenado más la conmutación de la válvula T. Es el escenario ideal (el extrusor nunca espera).',
    Operarios: 'Los operarios no alcanzan para preparar, apernar y desmoldear: el extrusor queda bloqueado esperando matriz. Añadir operarios o reducir tiempos manuales.',
    'Flota / puestos de molde': 'Faltan puestos o moldes: el molde tarda más en enfriar y recuperarse que el tiempo que el extrusor tarda en llenar los demás. Añadir puestos (manifold) o moldes.',
    Batea: 'Las posiciones de batea limitan: el enfriamiento ocupa demasiado tiempo cada posición.',
    Polipasto: 'El polipasto es el cuello de botella: tres traslados por pieza.',
  };
  const performance = Math.min(1, des.piecesPerHour / capacities.Extrusor);
  const availability = a.availabilityPct / 100;
  let q = quality;
  if (!mech.passBreak || !mech.passDeflection) q *= a.nonConformFactor;
  const oee = { availability, performance, quality: q, oee: availability * performance * q };

  const analysis: IntrusionAnalysis = {
    rheo,
    times,
    cooling,
    mech,
    mass,
    des,
    bottleneck: { id: bnId, capacities, explanation: explain[bnId] },
    capacities,
    oee,
    quality,
    uvIndex,
    warpMmPerM: warp,
    sinkRisk,
    piecesPerShift: des.piecesPerHour * a.shiftH * availability,
    goodPiecesPerShift: des.piecesPerHour * a.shiftH * availability * q,
    alerts: [],
    requiredMin: reqS / 60,
    steelAreaPerRibMm2: cageSpec(part, b)?.areaPerRibMm2 ?? 0,
    fleet,
  };
  analysis.alerts = alertsB(a, b, analysis, venting, classLabel(part));
  return analysis;
}

function alertsB(a: ProcessParams, b: IntrusionParams, r: IntrusionAnalysis, venting: string, cls: string): Alert[] {
  const out: Alert[] = [];
  const add = (severity: Alert['severity'], id: string, title: string, detail: string) => out.push({ id, severity, title, detail });
  const f = (x: number, d = 1) => x.toFixed(d);
  const rh = r.rheo;

  if (rh.dPtotalBar > b.pMaxBar)
    add('critical', 'overp', 'Sobrepresión en boquilla / riesgo de taponamiento',
      `ΔP total ${f(rh.dPtotalBar, 0)} bar (bebedero ${f(rh.dPsprueBar, 0)} + cavidad ${f(rh.dPcavityBar, 0)}) > ${b.pMaxBar} bar admisibles en cabeza. Aumentar el Ø del bebedero, la conicidad, el acuerdo o bajar el caudal.`);
  else if (rh.dPtotalBar > 0.8 * b.pMaxBar)
    add('warn', 'overp', 'Presión en boquilla cercana al límite', `ΔP total ${f(rh.dPtotalBar, 0)} bar = ${f((rh.dPtotalBar / b.pMaxBar) * 100, 0)} % del máximo.`);
  if (venting === 'air')
    add('warn', 'vent', 'Riesgo de atrapamiento de aire / quemaduras diesel', `Venteo de ${f(b.ventDepthMm, 3)} mm < ${f(b.ventMinMm, 3)} mm: el aire comprimido no escapa y quema el polímero.`);
  if (venting === 'flash')
    add('warn', 'vent', 'Riesgo de rebaba excesiva en línea de partición', `Venteo de ${f(b.ventDepthMm, 3)} mm > ${f(b.ventMaxMm, 3)} mm: el fundido escapa por la partición.`);
  if (rh.moldOpenKN > rh.boltCapacityKN)
    add('critical', 'open', 'Apertura del molde por presión de cavidad', `Fuerza de apertura ≈ ${f(rh.moldOpenKN, 0)} kN > capacidad de los pernos ${f(rh.boltCapacityKN, 0)} kN.`);
  if (rh.rpm > b.rpmMax)
    add('warn', 'rpm', 'Husillo por encima de las RPM máximas', `${f(rh.rpm, 0)} rpm > ${b.rpmMax} rpm: el caudal exige más diámetro de tornillo (D = ${b.screwDiaMm} mm).`);
  if (b.fiberFeed === 'hopper' && b.glassPct > 0)
    add('warn', 'attr', 'Fibra por tolva: atrición severa', `La fibra cae de ${f(b.fiberL0Mm, 1)} a ${f(rh.fiberLengthFinalMm, 2)} mm; el refuerzo pierde eficacia (ηℓ = ${f(rh.lengthEff, 2)}). Considere Side Feeder.`);
  else if (rh.fiberLengthFinalMm < b.fiberMinMm && b.glassPct > 0)
    add('warn', 'attr', 'Longitud final de fibra baja', `${f(rh.fiberLengthFinalMm, 2)} mm < ${f(b.fiberMinMm, 1)} mm: bajar RPM, subir viscosidad (MFI menor) o reducir L/D efectivo.`);
  if (b.couplingPct <= 0 && b.glassPct > 0)
    add('warn', 'coupling', 'Sin agente de acoplamiento (PE-g-MA)', `La interfase fibra-matriz transmite solo el ${f(rh.couplingEff * 100, 0)} % del esfuerzo.`);
  if (b.mfi < b.mfiMin || b.mfi > b.mfiMax)
    add('info', 'mfi', 'MFI fuera del rango típico del scrap de tubería', `MFI ${f(b.mfi, 2)} g/10 min (típico ${b.mfiMin}–${b.mfiMax}).`);
  if (b.carbonPct < a.carbonMin)
    add('warn', 'cb', 'Protección UV insuficiente', `Negro de humo ${f(b.carbonPct, 1)} % < ${a.carbonMin} %.`);

  const tgt = b.coolTargetC;
  if (!isFinite(r.cooling.timeToTargetS))
    add('critical', 'cool', `El núcleo no alcanza ${tgt} °C`, `No se alcanza en ${a.searchHorizonMin} min con este espesor y refrigerante.`);
  else if (b.dwellMode === 'fixed' && r.cooling.coreAtDwell > tgt)
    add('critical', 'cool', 'Riesgo crítico de alabeo y deformación post-desmoldeo',
      `Desmoldeo a ${f(b.coolFixedMin, 0)} min con el núcleo a ${f(r.cooling.coreAtDwell, 0)} °C (objetivo ${tgt} °C; se necesitan ≈ ${f(r.requiredMin)} min).`);
  if (r.warpMmPerM > a.warpCritMmM) add('critical', 'warp', 'Alabeo previsto elevado', `≈ ${f(r.warpMmPerM)} mm/m.`);
  else if (r.warpMmPerM > a.warpWarnMmM) add('warn', 'warp', 'Riesgo de alabeo', `≈ ${f(r.warpMmPerM)} mm/m.`);
  if (b.coolMode === 'insitu' && b.hInSitu < 60) add('info', 'insitu', 'Refrigeración in-situ lenta', 'Con aire o camisa débil el puesto queda ocupado mucho tiempo.');

  if (!r.mech.passDeflection)
    add('critical', 'en-def', `UNE-EN 124 ${cls}: deformación permanente fuera de límite`, `${f(r.mech.permanentDeflMm, 2)} mm tras ${f((a.proofLoadPct / 100) * a.breakLoadKN, 1)} kN (máx. ${f(a.maxResidualMm, 1)} mm).`);
  if (!r.mech.passBreak)
    add('critical', 'en-break', `UNE-EN 124 ${cls}: carga de rotura insuficiente`, `Rotura estimada ${f(r.mech.failureLoadKN, 0)} kN < ${a.breakLoadKN} kN.`);
  if (r.mech.passBreak && r.mech.passDeflection && r.mech.safetyFactor < a.safetyWarn)
    add('warn', 'en-margin', 'Margen de seguridad EN 124 reducido', `Coeficiente de seguridad ${f(r.mech.safetyFactor, 2)}.`);

  if (r.des.util.blocked * 100 > b.blockedWarnPct)
    add('warn', 'blocked', 'Extrusor BLOQUEADO / espera de matriz', `El extrusor pasa ${f(r.des.util.blocked * 100, 0)} % del tiempo sin molde listo y apernado: penaliza OEE y producción.`);
  if (b.coolMode === 'bath' && r.des.util.hoist * 100 > a.craneUtilWarnPct) add('warn', 'hoist', 'Polipasto saturado', `Utilización ${f(r.des.util.hoist * 100, 0)} %.`);
  if (b.reinforcement !== 'pure' && r.steelAreaPerRibMm2 < 20) add('info', 'cage', 'Armadura de acero muy ligera', 'Aporta poco a la rigidez; aumentar varillas o diámetro.');

  const bad = out.some((x) => x.severity === 'critical' || x.severity === 'warn');
  if (!bad) add('ok', 'ok', 'Parámetros dentro de la ventana de proceso', 'Cumple EN 124, presión admisible y enfriamiento suficiente.');
  const order = { critical: 0, warn: 1, info: 2, ok: 3 } as const;
  return out.sort((x, y) => order[x.severity] - order[y.severity]);
}
