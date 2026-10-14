import type { CraneSegment, DESResult, ProcessParams, Segment, Stage, StageTimes } from '../types/simulation';

interface Mold {
  id: number;
  stage: Stage;
  since: number;
  piece: number;
  slot: number;
}

interface Ev {
  t: number;
  seq: number;
  fn: () => void;
}

export interface DESConfig {
  horizonS: number;
  windowStartS: number;
  /** Tiempo de referencia de la curva al entrar en batea (s desde inicio de prensado) */
  kBathIn: number;
}

/**
 * Simulación de eventos discretos del circuito:
 * Extrusor → Carga (mesa lanzadera) → Prensado + enroscado → Apertura → Grúa → Batea
 * → Grúa → Desenroscado/Desmoldeo → Retorno → Prensa.
 * Recursos: acumulador (1 masa de reserva), prensa (1), grúa (1), batea (S posiciones), estaciones de desmoldeo.
 * La prensa queda retenida mientras el molde cerrado espera a la grúa o a una posición libre en batea.
 */
export function runDES(p: ProcessParams, st: StageTimes, cfg: DESConfig): DESResult {
  const { horizonS, windowStartS } = cfg;
  const queue: Ev[] = [];
  let seq = 0;
  let now = 0;
  const schedule = (dt: number, fn: () => void) => {
    const ev: Ev = { t: now + dt, seq: seq++, fn };
    let i = queue.length;
    while (i > 0 && (queue[i - 1].t < ev.t || (queue[i - 1].t === ev.t && queue[i - 1].seq < ev.seq))) i--;
    queue.splice(i, 0, ev); // cola ordenada de mayor a menor, se extrae con pop()
  };

  const segments: Segment[] = [];
  const craneSegments: CraneSegment[] = [];
  const molds: Mold[] = Array.from({ length: p.moldCount }, (_, id) => ({
    id,
    stage: 'WAIT_PRESS' as Stage,
    since: 0,
    piece: -1,
    slot: -1,
  }));

  const waitPress: Mold[] = [...molds];
  const waitCraneOut: Mold[] = [];
  const waitDemold: Mold[] = [];
  let pressOccupant: Mold | null = null;
  let waitCraneIn: Mold | null = null;
  let craneBusy = false;
  let slugReady = 1;
  let extProducing = false;
  let demoldActive = 0;
  const freeSlots: boolean[] = Array.from({ length: p.bathSlots }, () => true);
  let bathUsed = 0;
  let pieceCounter = 0;
  const completionTimes: number[] = [];

  // Tiempo de referencia de la curva térmica (k) al comenzar la etapa actual de cada molde
  const kStart = new Map<number, number>();
  const enter = (m: Mold, stage: Stage, kAtStart: number) => {
    if (now > m.since) {
      const k0 = kStart.get(m.id) ?? 0;
      segments.push({ mold: m.id, stage: m.stage, t0: m.since, t1: now, k0, slot: m.slot, piece: m.piece });
    }
    m.stage = stage;
    m.since = now;
    kStart.set(m.id, kAtStart);
  };
  const kNow = (m: Mold) => (kStart.get(m.id) ?? 0) + (now - m.since);

  const dispatch = () => {
    let progress = true;
    while (progress) {
      progress = false;

      // Extrusor: produce la siguiente masa mientras el acumulador esté vacío
      if (!extProducing && slugReady === 0) {
        extProducing = true;
        progress = true;
        schedule(st.slugS, () => {
          extProducing = false;
          slugReady = 1;
          dispatch();
        });
      }

      // Carga en la prensa (mesa lanzadera)
      if (!pressOccupant && waitPress.length > 0 && slugReady === 1) {
        const m = waitPress.shift()!;
        slugReady = 0;
        pressOccupant = m;
        m.piece = pieceCounter++;
        m.slot = -1;
        enter(m, 'LOADING', -st.loadS);
        progress = true;
        schedule(st.loadS, () => {
          enter(m, 'PRESSING', 0);
          schedule(st.pressPureS, () => {
            // La prensa sostiene la presión nominal mientras se colocan los pasadores roscados
            enter(m, 'PINNING', st.pressPureS);
            schedule(st.pinS, () => {
            enter(m, 'OPENING', st.pressS);
            schedule(st.openS, () => {
              enter(m, 'WAIT_CRANE_IN', st.pressS + st.openS);
              waitCraneIn = m;
              dispatch();
            });
            });
          });
        });
      }

      // Grúa
      if (!craneBusy) {
        const slotIdx = freeSlots.findIndex((f) => f);
        if (waitCraneIn && bathUsed < p.bathSlots && slotIdx >= 0) {
          const m = waitCraneIn as Mold;
          waitCraneIn = null;
          pressOccupant = null;
          craneBusy = true;
          freeSlots[slotIdx] = false;
          bathUsed++;
          m.slot = slotIdx;
          const kHere = kNow(m);
          enter(m, 'CRANE_IN', kHere);
          const dur = st.craneS;
          craneSegments.push({ mold: m.id, t0: now, t1: now + dur, from: 'press', to: 'bath', slot: slotIdx });
          progress = true;
          schedule(dur, () => {
            craneBusy = false;
            enter(m, 'COOLING', cfg.kBathIn);
            schedule(st.coolS, () => {
              enter(m, 'WAIT_CRANE_OUT', cfg.kBathIn + st.coolS);
              waitCraneOut.push(m);
              dispatch();
            });
            dispatch();
          });
        } else if (waitCraneOut.length > 0) {
          const m = waitCraneOut.shift()!;
          craneBusy = true;
          freeSlots[m.slot] = true;
          bathUsed--;
          const kHere = kNow(m);
          enter(m, 'CRANE_OUT', kHere);
          craneSegments.push({ mold: m.id, t0: now, t1: now + st.craneS, from: 'bath', to: 'demold', slot: m.slot });
          progress = true;
          schedule(st.craneS, () => {
            craneBusy = false;
            enter(m, 'WAIT_DEMOLD', kStart.get(m.id)! + st.craneS);
            waitDemold.push(m);
            dispatch();
          });
        }
      }

      // Desmoldeo
      if (demoldActive < p.demoldStations && waitDemold.length > 0) {
        const m = waitDemold.shift()!;
        demoldActive++;
        enter(m, 'DEMOLD', kNow(m));
        progress = true;
        schedule(st.demoldS, () => {
          demoldActive--;
          completionTimes.push(now);
          enter(m, 'RETURN', 0);
          m.slot = -1;
          schedule(st.returnS, () => {
            enter(m, 'WAIT_PRESS', 0);
            waitPress.push(m);
            dispatch();
          });
          dispatch();
        });
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
    if (now > m.since) {
      segments.push({ mold: m.id, stage: m.stage, t0: m.since, t1: now, k0: kStart.get(m.id) ?? 0, slot: m.slot, piece: m.piece });
    }
  }

  const segmentsByMold: Segment[][] = molds.map(() => []);
  for (const s of segments) segmentsByMold[s.mold].push(s);
  for (const arr of segmentsByMold) arr.sort((a, b) => a.t0 - b.t0);

  const win = horizonS - windowStartS;
  const piecesInWindow = completionTimes.filter((t) => t >= windowStartS).length;
  const piecesPerHour = (piecesInWindow / win) * 3600;

  const busy = (stages: Stage[]) => {
    let sum = 0;
    for (const s of segments) {
      if (!stages.includes(s.stage)) continue;
      const a = Math.max(s.t0, windowStartS);
      const b = Math.min(s.t1, horizonS);
      if (b > a) sum += b - a;
    }
    return sum;
  };

  const pressBusy = busy(['LOADING', 'PRESSING', 'PINNING', 'OPENING']);
  const pressBlocked = busy(['WAIT_CRANE_IN']);
  const util = {
    press: pressBusy / win,
    pressBlocked: pressBlocked / win,
    pressStarved: Math.max(0, 1 - (pressBusy + pressBlocked) / win),
    crane: busy(['CRANE_IN', 'CRANE_OUT']) / win,
    bath: busy(['COOLING', 'WAIT_CRANE_OUT']) / (win * p.bathSlots),
    demold: busy(['DEMOLD']) / (win * p.demoldStations),
    extruder: Math.min(1, (piecesPerHour / 3600) * st.slugS),
  };

  return {
    horizonS,
    windowStartS,
    segments,
    segmentsByMold,
    craneSegments,
    piecesInWindow,
    piecesPerHour,
    taktS: piecesPerHour > 0 ? 3600 / piecesPerHour : Infinity,
    util,
  };
}
