import type {
  BSegment,
  BStage,
  ExtruderSegment,
  HoistPlace,
  HoistSegment,
  IntrusionDES,
  IntrusionParams,
  StageTimesB,
} from '../types/intrusion';

type Res = 'extruder' | 'operator' | 'hoist' | 'port' | 'bath';

interface Phase {
  stage: BStage;
  dur: number;
  kSet?: number;
}

interface Step {
  wait: BStage;
  phases: Phase[];
  acquire: Res[];
  releaseStart?: Res[];
  releaseEnd?: Res[];
  hoist?: { from: HoistPlace; to: HoistPlace };
  completes?: boolean;
}

interface Mold {
  id: number;
  step: number;
  stage: BStage;
  since: number;
  kAt: number;
  waiting: boolean;
  waitSince: number;
  port: number;
  bath: number;
  piece: boolean;
}

export interface BDesConfig {
  horizonS: number;
  windowStartS: number;
  /** Instante de la curva térmica (s desde mitad del llenado) en que el molde entra al refrigerante */
  kCoolStart: number;
  fillS: number;
}

/**
 * Ruta del molde:
 *  - In-situ: Preparar (jaula + pernos) → Llenar (conmutar válvula + llenado) → Mantener + Refrigerar → Desapretar + Desmoldear
 *  - Batea: igual, pero con polipasto: buffer → puesto → (llenar, mantener) → batea → mesa de desmoldeo
 */
function buildRoute(b: IntrusionParams, t: StageTimesB, cfg: BDesConfig): Step[] {
  const prep: Phase[] = [];
  if (t.cageS > 0) prep.push({ stage: 'PREP_CAGE', dur: t.cageS });
  prep.push({ stage: 'PREP_BOLT', dur: t.boltS });
  const prepStep: Step = { wait: 'WAIT_OPERATOR', phases: prep, acquire: ['operator'], releaseEnd: ['operator'] };
  const fill: Phase[] = [
    { stage: 'SWITCH', dur: t.switchS },
    { stage: 'FILLING', dur: t.fillS, kSet: -cfg.fillS / 2 },
  ];
  const demold: Step = {
    wait: 'WAIT_OPERATOR',
    phases: [
      { stage: 'UNBOLT', dur: t.unboltS },
      { stage: 'EXTRACT', dur: t.extractS },
    ],
    acquire: ['operator'],
    releaseEnd: ['operator'],
    completes: true,
  };
  if (b.coolMode === 'insitu') {
    return [
      prepStep,
      { wait: 'READY', phases: fill, acquire: ['extruder'], releaseEnd: ['extruder'] },
      {
        wait: 'READY',
        phases: [
          { stage: 'HOLD', dur: t.holdS },
          { stage: 'COOL', dur: t.coolS, kSet: cfg.kCoolStart },
        ],
        acquire: [],
      },
      demold,
    ];
  }
  return [
    prepStep,
    {
      wait: 'READY',
      phases: [{ stage: 'HOIST_IN', dur: t.hoistS }],
      acquire: ['hoist', 'port'],
      releaseEnd: ['hoist'],
      hoist: { from: 'buffer', to: 'port' },
    },
    { wait: 'WAIT_EXTRUDER', phases: fill, acquire: ['extruder'], releaseEnd: ['extruder'] },
    { wait: 'HOLD', phases: [{ stage: 'HOLD', dur: t.holdS }], acquire: [] },
    {
      wait: 'WAIT_HOIST_OUT',
      phases: [{ stage: 'HOIST_OUT', dur: t.hoistS }],
      acquire: ['hoist', 'bath'],
      releaseStart: ['port'],
      releaseEnd: ['hoist'],
      hoist: { from: 'port', to: 'bath' },
    },
    { wait: 'COOL', phases: [{ stage: 'COOL', dur: t.coolS, kSet: cfg.kCoolStart }], acquire: [] },
    {
      wait: 'WAIT_HOIST_BENCH',
      phases: [{ stage: 'HOIST_BENCH', dur: t.hoistS }],
      acquire: ['hoist'],
      releaseStart: ['bath'],
      releaseEnd: ['hoist'],
      hoist: { from: 'bath', to: 'bench' },
    },
    demold,
  ];
}

const PORT_STAGES: BStage[] = ['HOIST_IN', 'WAIT_EXTRUDER', 'SWITCH', 'FILLING', 'HOLD', 'WAIT_HOIST_OUT'];
const BATH_STAGES: BStage[] = ['HOIST_OUT', 'COOL', 'WAIT_HOIST_BENCH', 'HOIST_BENCH'];

export function runIntrusionDES(b: IntrusionParams, t: StageTimesB, cfg: BDesConfig): IntrusionDES {
  const { horizonS, windowStartS } = cfg;
  const bath = b.coolMode === 'bath';
  const ports = b.stations;
  const fleet = bath ? Math.max(b.moldFleet, ports) : ports;
  const route = buildRoute(b, t, cfg);

  const queue: { t: number; seq: number; fn: () => void }[] = [];
  let seq = 0;
  let now = 0;
  const schedule = (dt: number, fn: () => void) => {
    const ev = { t: now + dt, seq: seq++, fn };
    let i = queue.length;
    while (i > 0 && (queue[i - 1].t < ev.t || (queue[i - 1].t === ev.t && queue[i - 1].seq < ev.seq))) i--;
    queue.splice(i, 0, ev);
  };

  const segments: BSegment[] = [];
  const hoistSegments: HoistSegment[] = [];
  const extruderSegments: ExtruderSegment[] = [];
  const completions: number[] = [];

  // Recursos
  let extruderFree = true;
  let operatorsFree = b.operators;
  let hoistFree = bath;
  const portTokens: boolean[] = Array.from({ length: ports }, () => true);
  const bathTokens: boolean[] = Array.from({ length: bath ? b.bathSlots : 0 }, () => true);

  const startStep = 1; // los moldes arrancan preparados y apernados
  const molds: Mold[] = Array.from({ length: fleet }, (_, id) => ({
    id,
    step: startStep,
    stage: route[startStep].wait,
    since: 0,
    kAt: 0,
    waiting: true,
    waitSince: id * 1e-6,
    port: bath ? -1 : id,
    bath: -1,
    piece: false,
  }));

  const slotOf = (m: Mold, stage: BStage): number => {
    if (!bath) return m.id;
    if (PORT_STAGES.includes(stage)) return m.port;
    if (BATH_STAGES.includes(stage)) return m.bath;
    return -1;
  };

  const enter = (m: Mold, stage: BStage, kSet?: number) => {
    if (now > m.since) {
      segments.push({ mold: m.id, stage: m.stage, t0: m.since, t1: now, k0: m.kAt, slot: slotOf(m, m.stage), piece: m.piece });
    }
    const kNow = m.kAt + (now - m.since);
    m.kAt = kSet !== undefined ? kSet : kNow;
    m.stage = stage;
    m.since = now;
    if (stage === 'FILLING') m.piece = true;
  };

  const take = (res: Res, m: Mold) => {
    if (res === 'extruder') extruderFree = false;
    else if (res === 'operator') operatorsFree--;
    else if (res === 'hoist') hoistFree = false;
    else if (res === 'port') {
      m.port = portTokens.findIndex((f) => f);
      portTokens[m.port] = false;
    } else {
      m.bath = bathTokens.findIndex((f) => f);
      bathTokens[m.bath] = false;
    }
  };
  const give = (res: Res, m: Mold) => {
    if (res === 'extruder') extruderFree = true;
    else if (res === 'operator') operatorsFree++;
    else if (res === 'hoist') hoistFree = true;
    else if (res === 'port') {
      portTokens[m.port] = true;
      m.port = bath ? -1 : m.port;
    } else {
      bathTokens[m.bath] = true;
      m.bath = -1;
    }
  };
  const available = (res: Res): boolean =>
    res === 'extruder'
      ? extruderFree
      : res === 'operator'
        ? operatorsFree > 0
        : res === 'hoist'
          ? hoistFree
          : res === 'port'
            ? portTokens.some((f) => f)
            : bathTokens.some((f) => f);

  const runPhase = (m: Mold, step: Step, i: number) => {
    const ph = step.phases[i];
    enter(m, ph.stage, ph.kSet);
    if (ph.stage === 'SWITCH' || ph.stage === 'FILLING') {
      extruderSegments.push({ t0: now, t1: now + ph.dur, state: ph.stage === 'SWITCH' ? 'SWITCHING' : 'FILLING', mold: m.id });
    }
    schedule(ph.dur, () => {
      if (i + 1 < step.phases.length) {
        runPhase(m, step, i + 1);
        return;
      }
      step.releaseEnd?.forEach((r) => give(r, m));
      if (step.completes) {
        completions.push(now);
        m.piece = false;
      }
      m.step = (m.step + 1) % route.length;
      m.waiting = true;
      m.waitSince = now;
      enter(m, route[m.step].wait);
      dispatch();
    });
  };

  const dispatch = () => {
    let progress = true;
    while (progress) {
      progress = false;
      // Prioridad a los pasos más avanzados del circuito (evita bloqueos entre puestos, polipasto y batea)
      const cands = molds.filter((m) => m.waiting).sort((x, y) => y.step - x.step || x.waitSince - y.waitSince);
      for (const m of cands) {
        const step = route[m.step];
        if (!step.acquire.every(available)) continue;
        m.waiting = false;
        step.acquire.forEach((r) => take(r, m));
        if (step.hoist) {
          const slot = step.hoist.from === 'bath' || step.hoist.to === 'bath' ? m.bath : m.port;
          const total = step.phases.reduce((sum, p) => sum + p.dur, 0);
          hoistSegments.push({ mold: m.id, t0: now, t1: now + total, from: step.hoist.from, to: step.hoist.to, slot });
        }
        step.releaseStart?.forEach((r) => give(r, m));
        runPhase(m, step, 0);
        progress = true;
        break;
      }
    }
  };

  dispatch();
  while (queue.length > 0) {
    const ev = queue.pop()!;
    if (ev.t > horizonS) break;
    now = ev.t;
    ev.fn();
  }
  now = horizonS;
  for (const m of molds) {
    if (now > m.since) segments.push({ mold: m.id, stage: m.stage, t0: m.since, t1: now, k0: m.kAt, slot: slotOf(m, m.stage), piece: m.piece });
  }

  const segmentsByMold: BSegment[][] = molds.map(() => []);
  for (const s of segments) segmentsByMold[s.mold].push(s);
  for (const arr of segmentsByMold) arr.sort((x, y) => x.t0 - y.t0);

  const win = horizonS - windowStartS;
  const clip = (t0: number, t1: number) => Math.max(0, Math.min(t1, horizonS) - Math.max(t0, windowStartS));
  const busy = (stages: BStage[]) => segments.filter((s) => stages.includes(s.stage)).reduce((sum, s) => sum + clip(s.t0, s.t1), 0);
  const extBusy = (state: ExtruderSegment['state']) =>
    extruderSegments.filter((s) => s.state === state).reduce((sum, s) => sum + clip(s.t0, s.t1), 0);
  const piecesInWindow = completions.filter((c) => c >= windowStartS).length;
  const pph = (piecesInWindow / win) * 3600;
  const filling = extBusy('FILLING');
  const switching = extBusy('SWITCHING');

  return {
    horizonS,
    windowStartS,
    moldCount: fleet,
    ports,
    bathSlots: bath ? b.bathSlots : 0,
    segments,
    segmentsByMold,
    hoistSegments,
    extruderSegments,
    piecesInWindow,
    piecesPerHour: pph,
    taktS: pph > 0 ? 3600 / pph : Infinity,
    util: {
      extruder: filling / win,
      switching: switching / win,
      blocked: Math.max(0, 1 - (filling + switching) / win),
      operators: busy(['PREP_CAGE', 'PREP_BOLT', 'UNBOLT', 'EXTRACT']) / (win * b.operators),
      hoist: hoistSegments.reduce((sum, s) => sum + clip(s.t0, s.t1), 0) / win,
      bath: bath ? busy(['COOL', 'WAIT_HOIST_BENCH']) / (win * b.bathSlots) : 0,
    },
  };
}
