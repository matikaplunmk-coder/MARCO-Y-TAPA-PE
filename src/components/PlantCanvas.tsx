import { useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { Analysis, CraneSegment, ProcessParams, Segment } from '../types/simulation';
import { useAnimationClock } from '../hooks/useAnimationClock';
import { sampleCurve } from '../engine/thermalPhysics';
import { STAGE_LABEL, fmtClock, fmtMinSec, tempColor } from '../engine/format';

interface Props {
  analysis: Analysis;
  params: ProcessParams;
}

const LOOP_S = 3 * 3600;
const PRESS_X = 445; // centro de la prensa
const DEMOLD_X = 1165;
const BED_Y = 450; // cara superior de la mesa de prensa
const MOLD_H = 40; // altura de cada semimolde
const BATH = { x: 620, y: 380, w: 340, h: 150 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

function findSegment(segs: Segment[], t: number): Segment | undefined {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].t1 <= t) lo = mid + 1;
    else if (segs[mid].t0 > t) hi = mid - 1;
    else return segs[mid];
  }
  return undefined;
}

function slotPos(slot: number, slots: number) {
  const cols = Math.ceil(slots / 2);
  const slotW = (BATH.w - 40) / cols;
  const col = Math.floor(slot / 2);
  const row = slot % 2; // 0 = fondo, 1 = frente
  const w = Math.min(60, slotW * 0.86);
  return { x: BATH.x + 20 + slotW * (col + 0.5), y: BATH.y + 34 + row * 48, w, row, slotW, cols };
}

interface CraneState {
  x: number;
  hookY: number;
  carrying: number | null;
}

function craneStateAt(segs: CraneSegment[], t: number, slots: number): CraneState {
  const xOf = (where: 'press' | 'bath' | 'demold', slot: number) =>
    where === 'press' ? PRESS_X : where === 'demold' ? DEMOLD_X : slotPos(slot, slots).x;
  // búsqueda binaria del último segmento con t0 <= t
  let lo = 0;
  let hi = segs.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].t0 <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0) return { x: PRESS_X, hookY: 130, carrying: null };
  const s = segs[idx];
  const prev = idx > 0 ? segs[idx - 1] : undefined;
  const prevX = prev ? xOf(prev.to, prev.slot) : PRESS_X;
  const pickX = xOf(s.from, s.slot);
  const dropX = xOf(s.to, s.slot);
  if (t >= s.t1) return { x: dropX, hookY: 130, carrying: null };
  const f = (t - s.t0) / (s.t1 - s.t0);
  const pickY = s.from === 'press' ? BED_Y - 2 * MOLD_H - 6 : slotPos(s.slot, slots).y - 30;
  const dropY = s.to === 'bath' ? slotPos(s.slot, slots).y - 18 : BED_Y - MOLD_H - 6;
  if (f < 0.15) return { x: lerp(prevX, pickX, f / 0.15), hookY: lerp(130, pickY, f / 0.15), carrying: null };
  if (f < 0.25) return { x: pickX, hookY: lerp(pickY, 190, (f - 0.15) / 0.1), carrying: s.mold };
  if (f < 0.78) return { x: lerp(pickX, dropX, (f - 0.25) / 0.53), hookY: 190, carrying: s.mold };
  return { x: dropX, hookY: lerp(190, dropY, (f - 0.78) / 0.22), carrying: s.mold };
}

export default function PlantCanvas({ analysis, params }: Props) {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [t, setT] = useAnimationClock(playing, speed, LOOP_S);
  const [selected, setSelected] = useState<number | null>(0);
  const des = analysis.des;
  const cool = analysis.cooling;
  const melt = params.meltTempC;

  const completions = useMemo(
    () => des.segments.filter((s) => s.stage === 'DEMOLD').map((s) => s.t1).sort((a, b) => a - b),
    [des],
  );
  const done = useMemo(() => {
    let lo = 0;
    let hi = completions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (completions[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }, [completions, t]);

  const molds = useMemo(() => Array.from({ length: params.moldCount }, (_, i) => i), [params.moldCount]);
  const states = molds.map((id) => {
    const seg = findSegment(des.segmentsByMold[id], t);
    const k = seg ? seg.k0 + (t - seg.t0) : 0;
    const hasPiece = !!seg && !['WAIT_PRESS', 'RETURN'].includes(seg.stage);
    const core = hasPiece ? sampleCurve(cool, k, 'core', melt) : 35;
    const surf = hasPiece ? sampleCurve(cool, k, 'surface', melt) : 35;
    const progress = seg ? clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0)) : 0;
    return { id, seg, k, core, surf, hasPiece, progress };
  });
  const byStage = (stage: Segment['stage']) => states.filter((s) => s.seg?.stage === stage);

  const crane = craneStateAt(des.craneSegments, t, params.bathSlots);

  // --- Estado de la prensa ---
  const pressMold = states.find((s) => s.seg && ['LOADING', 'PRESSING', 'OPENING', 'WAIT_CRANE_IN'].includes(s.seg.stage));
  const craneInMold = states.find((s) => s.seg?.stage === 'CRANE_IN' && crane.carrying !== s.id);
  const stage = pressMold?.seg?.stage;
  let openness = 1;
  if (stage === 'PRESSING') {
    const p = pressMold!.progress;
    openness = p < 0.08 ? 1 - p / 0.08 : 0;
  } else if (stage === 'OPENING') openness = pressMold!.progress;
  let shuttle = 0;
  let slugFalling = 0; // 0..1
  if (stage === 'LOADING') {
    const p = pressMold!.progress;
    shuttle = p < 0.3 ? p / 0.3 : p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    slugFalling = p >= 0.3 && p <= 0.7 ? (p - 0.3) / 0.4 : p > 0.7 ? 1 : 0;
  }
  const platenBottom = BED_Y - 2 * MOLD_H - 4;
  const platenY = platenBottom - openness * 95;
  const forceOn = stage === 'PRESSING' && pressMold!.progress > 0.08;
  const lockedMold = stage && stage !== 'LOADING';
  const sel = selected !== null ? states[selected] : undefined;

  // --- Moldes por posición ---
  const queue = byStage('WAIT_PRESS');
  const demoldQ = states.filter((s) => s.seg && ['WAIT_DEMOLD', 'DEMOLD'].includes(s.seg.stage));
  const returning = byStage('RETURN');

  const moldGlyph = (
    id: number,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    locked: boolean,
    opts: { dim?: boolean } = {},
  ) => (
    <g
      key={`m${id}`}
      transform={`translate(${x - w / 2},${y})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setSelected(id);
      }}
      opacity={opts.dim ? 0.9 : 1}
    >
      <rect width={w} height={h} rx={3} fill={color} stroke={selected === id ? '#fff' : '#0f172a'} strokeWidth={selected === id ? 2.5 : 1.5} />
      {locked && (
        <>
          <circle cx={4} cy={h / 2} r={2.2} fill="#cbd5e1" />
          <circle cx={w - 4} cy={h / 2} r={2.2} fill="#cbd5e1" />
        </>
      )}
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={Math.min(13, w / 2.6)} fontWeight={700} fill="#0f172a">
        {id + 1}
      </text>
    </g>
  );

  const bathMolds = states.filter((s) => s.seg && ['COOLING', 'WAIT_CRANE_OUT'].includes(s.seg.stage));
  const slotRows = Array.from({ length: params.bathSlots }, (_, i) => slotPos(i, params.bathSlots));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Planta · vista esquemática animada</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <button
            className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pausa' : 'Reanudar'}
          </button>
          <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={() => setT(0)} title="Reiniciar">
            <RotateCcw size={14} />
          </button>
          <label className="flex items-center gap-1 text-slate-400">
            Velocidad
            <select
              className="rounded bg-slate-800 px-1 py-1 text-slate-200"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {[10, 30, 60, 120, 300, 600].map((v) => (
                <option key={v} value={v}>
                  ×{v}
                </option>
              ))}
            </select>
          </label>
          <span className="font-mono text-slate-300">{fmtClock(t)}</span>
          <input
            type="range"
            min={0}
            max={LOOP_S}
            step={10}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            className="w-40 accent-sky-400"
            aria-label="Tiempo de simulación"
          />
        </div>
      </div>

      <svg viewBox="0 0 1280 622" className="w-full rounded-lg bg-slate-950" onClick={() => setSelected(null)}>
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0369a1" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#64748b" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#1e293b" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1280" height="622" fill="url(#grid)" />
        <rect y="572" width="1280" height="50" fill="#0b1220" />

        {/* Riel de retorno */}
        <line x1={DEMOLD_X + 60} y1={556} x2={20} y2={556} stroke="#475569" strokeWidth={4} strokeDasharray="10 6" />
        <text x={420} y={570} fontSize={11} fill="#64748b" textAnchor="middle">
          ← retorno de moldes vacíos (carro de rieles)
        </text>

        {/* ===== Extrusor + acumulador ===== */}
        <g>
          <path d="M30 330 L90 330 L75 280 L45 280 Z" fill="#475569" stroke="#94a3b8" />
          <text x={60} y={272} textAnchor="middle" fontSize={11} fill="#94a3b8">Tolva PEAD+FV</text>
          <rect x={30} y={330} width={190} height={46} rx={6} fill="url(#steel)" stroke="#94a3b8" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={46 + i * 34} y={330} width={14} height={46} fill={['#f59e0b', '#fb923c', '#f97316', '#ef4444', '#dc2626'][i]} opacity={0.75} />
          ))}
          <rect x={220} y={322} width={70} height={62} rx={8} fill="#7f1d1d" stroke="#fca5a5" />
          <text x={255} y={358} textAnchor="middle" fontSize={11} fill="#fecaca" fontWeight={600}>
            Acumul.
          </text>
          <text x={125} y={400} textAnchor="middle" fontSize={12} fill="#cbd5e1" fontWeight={600}>
            Extrusor · {Math.round(melt)} °C
          </text>
          <text x={125} y={416} textAnchor="middle" fontSize={11} fill="#94a3b8">
            masa {analysis.process.slugKg.toFixed(1)} kg (+2,5 %)
          </text>
        </g>

        {/* ===== Prensa hidráulica de 4 columnas ===== */}
        <g>
          <rect x={PRESS_X - 140} y={BED_Y} width={280} height={34} fill="url(#steel)" stroke="#94a3b8" />
          <rect x={PRESS_X - 150} y={BED_Y + 34} width={300} height={14} fill="#1e293b" stroke="#475569" />
          {[PRESS_X - 128, PRESS_X - 108, PRESS_X + 108, PRESS_X + 128].map((cx, i) => (
            <rect key={i} x={cx - 6} y={140} width={12} height={BED_Y - 140} fill={i % 2 ? '#94a3b8' : '#64748b'} />
          ))}
          <rect x={PRESS_X - 150} y={120} width={300} height={34} rx={4} fill="url(#steel)" stroke="#94a3b8" />
          <rect x={PRESS_X - 40} y={70} width={80} height={52} rx={6} fill={forceOn ? '#f97316' : '#475569'} stroke="#cbd5e1" />
          <text x={PRESS_X} y={102} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={700}>
            {params.pressTon} t
          </text>
          <rect x={PRESS_X - 12} y={154} width={24} height={Math.max(0, platenY - 154)} fill="#cbd5e1" />
          <rect x={PRESS_X - 120} y={platenY} width={240} height={14} rx={2} fill="url(#steel)" stroke="#e2e8f0" />
          {/* semimolde superior solidario al plato móvil mientras carga */}
          {!lockedMold && (
            <rect x={PRESS_X - 100} y={platenY + 14} width={200} height={MOLD_H - 10} fill="#475569" stroke="#0f172a" />
          )}
          {forceOn && (
            <g>
              {[-70, -35, 0, 35, 70].map((dx) => (
                <path key={dx} d={`M${PRESS_X + dx} ${platenY - 18} v14 m-5 -6 l5 6 l5 -6`} stroke="#fb923c" strokeWidth={2.5} fill="none">
                  <animate attributeName="opacity" values="1;0.2;1" dur="0.7s" repeatCount="indefinite" />
                </path>
              ))}
            </g>
          )}
          <text x={PRESS_X} y={BED_Y + 66} textAnchor="middle" fontSize={12} fill="#cbd5e1" fontWeight={600}>
            Prensa hidráulica 4 columnas
          </text>
          {/* mesa lanzadera y molde */}
          {pressMold && pressMold.seg && (
            (() => {
              const m = pressMold;
              const dx = -shuttle * 175;
              const color = tempColor(m.core);
              return (
                <g transform={`translate(${dx},0)`}>
                  {lockedMold ? (
                    moldGlyph(m.id, PRESS_X, BED_Y - 2 * MOLD_H, 200, 2 * MOLD_H, color, true)
                  ) : (
                    moldGlyph(m.id, PRESS_X, BED_Y - MOLD_H, 200, MOLD_H, '#64748b', false)
                  )}
                </g>
              );
            })()
          )}
          {/* masa cayendo / sobre el molde en la carga */}
          {stage === 'LOADING' && (
            <ellipse
              cx={PRESS_X - 175 * shuttle}
              cy={lerp(BED_Y - MOLD_H - 60, BED_Y - MOLD_H - 8, slugFalling)}
              rx={52}
              ry={slugFalling >= 1 ? 7 : 12}
              fill="#f97316"
              stroke="#fed7aa"
            />
          )}
          <text x={PRESS_X} y={60} textAnchor="middle" fontSize={11} fill="#94a3b8">
            {stage ? STAGE_LABEL[stage] : 'Prensa libre — esperando masa y molde'}
          </text>
        </g>

        {/* ===== Puente grúa ===== */}
        <g>
          <line x1={250} y1={34} x2={1250} y2={34} stroke="#facc15" strokeWidth={3} />
          <rect x={250} y={30} width={1000} height={9} fill="#ca8a04" />
          <rect x={crane.x - 22} y={26} width={44} height={20} rx={3} fill="#eab308" stroke="#fef08a" />
          <line x1={crane.x} y1={46} x2={crane.x} y2={crane.hookY} stroke="#e2e8f0" strokeWidth={2} />
          <path d={`M${crane.x - 8} ${crane.hookY} h16 v6 a8 8 0 0 1 -16 0 z`} fill="#facc15" />
          {crane.carrying !== null && states[crane.carrying] &&
            moldGlyph(
              crane.carrying,
              crane.x,
              crane.hookY + 12,
              64,
              2 * MOLD_H - 20,
              tempColor(states[crane.carrying].core),
              true,
            )}
          <text x={1190} y={22} textAnchor="end" fontSize={11} fill="#facc15">
            Puente grúa
          </text>
        </g>
        {/* molde en espera de grúa dibujado ya sobre la mesa (sigue en prensa hasta que inicia el movimiento) */}
        {craneInMold && craneInMold.seg && craneInMold.progress < 0.25 &&
          moldGlyph(craneInMold.id, PRESS_X, BED_Y - 2 * MOLD_H, 200, 2 * MOLD_H, tempColor(craneInMold.core), true)}

        {/* ===== Batea de enfriamiento ===== */}
        <g>
          <rect x={BATH.x} y={BATH.y} width={BATH.w} height={BATH.h} rx={6} fill="#082f49" stroke="#38bdf8" strokeWidth={2} />
          {slotRows.map((s, i) => (
            <rect key={i} x={s.x - s.w / 2 - 2} y={s.y + 44} width={s.w + 4} height={4} fill="#0c4a6e" />
          ))}
          {bathMolds
            .slice()
            .sort((a, b) => (a.seg!.slot % 2) - (b.seg!.slot % 2))
            .map((m) => {
              const sp = slotPos(m.seg!.slot, params.bathSlots);
              const remaining = Math.max(0, analysis.times.coolS - (m.seg!.stage === 'COOLING' ? t - m.seg!.t0 : analysis.times.coolS));
              return (
                <g key={m.id}>
                  {moldGlyph(m.id, sp.x, sp.y, sp.w, 44, tempColor(m.core), true)}
                  <text x={sp.x} y={sp.y + 58} textAnchor="middle" fontSize={9.5} fill="#e0f2fe" fontFamily="monospace">
                    {m.seg!.stage === 'COOLING' ? fmtMinSec(remaining) : '✓'}
                  </text>
                </g>
              );
            })}
          <rect x={BATH.x} y={BATH.y} width={BATH.w} height={BATH.h} rx={6} fill="url(#water)" pointerEvents="none" />
          <path d={`M${BATH.x} ${BATH.y + 4} q 24 -6 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0`} stroke="#bae6fd" strokeWidth={1.5} fill="none" opacity={0.6} pointerEvents="none">
            <animate attributeName="d" dur="3s" repeatCount="indefinite"
              values={`M${BATH.x} ${BATH.y + 4} q 24 -6 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0;M${BATH.x} ${BATH.y + 4} q 24 6 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0;M${BATH.x} ${BATH.y + 4} q 24 -6 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0 t 48 0`} />
          </path>
          <text x={BATH.x + BATH.w / 2} y={BATH.y + BATH.h + 18} textAnchor="middle" fontSize={12} fill="#7dd3fc" fontWeight={600}>
            Batea de inmersión · agua {params.bathTempC} °C · {params.bathSlots} posiciones
          </text>
          {/* chiller */}
          <rect x={BATH.x + BATH.w + 14} y={BATH.y + 70} width={60} height={64} rx={6} fill="#0c4a6e" stroke="#38bdf8" />
          <text x={BATH.x + BATH.w + 44} y={BATH.y + 98} textAnchor="middle" fontSize={11} fill="#bae6fd" fontWeight={700}>Chiller</text>
          <text x={BATH.x + BATH.w + 44} y={BATH.y + 114} textAnchor="middle" fontSize={10} fill="#7dd3fc">{params.bathTempC} °C</text>
          <path d={`M${BATH.x + BATH.w} ${BATH.y + 90} H${BATH.x + BATH.w + 14}`} stroke="#38bdf8" strokeWidth={3} strokeDasharray="6 4">
            <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
          </path>
          <path d={`M${BATH.x + BATH.w + 14} ${BATH.y + 120} H${BATH.x + BATH.w - 4}`} stroke="#0ea5e9" strokeWidth={3} strokeDasharray="6 4">
            <animate attributeName="stroke-dashoffset" from="0" to="20" dur="1s" repeatCount="indefinite" />
          </path>
        </g>

        {/* ===== Estación de desmoldeo ===== */}
        <g>
          <rect x={DEMOLD_X - 95} y={BED_Y + 8} width={190} height={14} fill="url(#steel)" stroke="#94a3b8" />
          <rect x={DEMOLD_X - 85} y={BED_Y + 22} width={12} height={56} fill="#475569" />
          <rect x={DEMOLD_X + 73} y={BED_Y + 22} width={12} height={56} fill="#475569" />
          {demoldQ.slice(0, 4).map((m, i) => {
            const working = m.seg!.stage === 'DEMOLD';
            const px = DEMOLD_X + (i - (Math.min(demoldQ.length, 4) - 1) / 2) * 84;
            return (
              <g key={m.id}>
                {moldGlyph(m.id, px, BED_Y - 24 + 6, 74, 2 * MOLD_H - 22, working ? tempColor(m.core) : '#64748b', !working)}
                {working && (
                  <g>
                    <rect x={px - 30} y={BED_Y - 30} width={60} height={4} fill="#1e293b" />
                    <rect x={px - 30} y={BED_Y - 30} width={60 * m.progress} height={4} fill="#22c55e" />
                  </g>
                )}
              </g>
            );
          })}
          <text x={DEMOLD_X} y={BED_Y + 84} textAnchor="middle" fontSize={12} fill="#cbd5e1" fontWeight={600}>
            Desmoldeo y acabado
          </text>
          <text x={DEMOLD_X} y={BED_Y + 97} textAnchor="middle" fontSize={10} fill="#94a3b8">
            botadores · desbarbado · herraje antivandálico
          </text>
          <rect x={DEMOLD_X - 62} y={96} width={124} height={54} rx={8} fill="#052e16" stroke="#22c55e" />
          <text x={DEMOLD_X} y={116} textAnchor="middle" fontSize={10} fill="#86efac">PIEZAS TERMINADAS</text>
          <text x={DEMOLD_X} y={140} textAnchor="middle" fontSize={22} fill="#4ade80" fontWeight={700} fontFamily="monospace">{done}</text>
        </g>

        {/* ===== Cola de moldes y retorno ===== */}
        {queue.slice(0, 5).map((m, i) => moldGlyph(m.id, 290 - i * 52, 522, 44, 30, '#64748b', false))}
        {queue.length > 5 && (
          <text x={290 - 5 * 52 + 18} y={541} fontSize={12} fill="#94a3b8" textAnchor="middle">+{queue.length - 5}</text>
        )}
        <text x={40} y={514} fontSize={10} fill="#64748b">cola de moldes vacíos →</text>
        {returning.map((m) => {
          const x = lerp(DEMOLD_X + 60, 320, m.progress);
          return moldGlyph(m.id, x, 522, 44, 30, '#64748b', false);
        })}

        {/* Leyenda de temperaturas */}
        <g transform="translate(40,592)">
          <text x={0} y={10} fontSize={10} fill="#94a3b8">Temp. núcleo</text>
          {[30, 50, 80, 110, 150, 190].map((v, i) => (
            <g key={v} transform={`translate(${85 + i * 60},0)`}>
              <rect width={14} height={12} fill={tempColor(v)} rx={2} />
              <text x={18} y={10} fontSize={10} fill="#cbd5e1">{v}°C</text>
            </g>
          ))}
        </g>
        <text x={1240} y={602} textAnchor="end" fontSize={11} fill="#64748b">
          Molde en foco: haga clic en un molde
        </text>
      </svg>

      <div className="mt-2 min-h-[44px] rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
        {sel && sel.seg ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="font-semibold text-sky-300">Molde #{sel.id + 1}</span>
            <span>{STAGE_LABEL[sel.seg.stage]}</span>
            {sel.hasPiece ? (
              <>
                <span>
                  Núcleo{' '}
                  <b style={{ color: tempColor(sel.core) }}>{sel.core.toFixed(0)} °C</b>
                </span>
                <span>
                  Superficie <b style={{ color: tempColor(sel.surf) }}>{sel.surf.toFixed(0)} °C</b>
                </span>
              </>
            ) : (
              <span>Molde vacío</span>
            )}
            <span>Etapa: {fmtMinSec(Math.max(0, sel.seg.t1 - t))} restantes</span>
            {sel.seg.stage === 'COOLING' && (
              <span>
                Batea: {fmtMinSec(Math.max(0, analysis.times.coolS - (t - sel.seg.t0)))} para completar permanencia
              </span>
            )}
          </div>
        ) : (
          'Seleccione un molde para ver su estado, temperatura y tiempo restante.'
        )}
      </div>
    </div>
  );

}
