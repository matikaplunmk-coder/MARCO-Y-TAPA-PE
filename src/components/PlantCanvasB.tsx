import { useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { BSegment, HoistPlace, HoistSegment, IntrusionAnalysis, IntrusionParams } from '../types/intrusion';
import { useAnimationClock } from '../hooks/useAnimationClock';
import { sampleCurve } from '../engine/thermalPhysics';
import { STAGE_LABEL_B, fmtClock, fmtMinSec, tempColor } from '../engine/format';

interface Props {
  r: IntrusionAnalysis;
  b: IntrusionParams;
}

const LOOP_S = 3 * 3600;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (x: number, y: number, f: number) => x + (y - x) * f;

const PORT_X = 520;
const MOLD_W = 190;
const MOLD_H = 62;
const BATH = { x: 790, y: 360, w: 260, h: 190 };
const BENCH_X = 1175;
const BENCH_Y = 470;
const BUFFER = { x: 560, y: 572 };
const PORT_STAGES = ['HOIST_IN', 'WAIT_EXTRUDER', 'SWITCH', 'FILLING', 'HOLD', 'WAIT_HOIST_OUT'];
const BATH_STAGES = ['HOIST_OUT', 'COOL', 'WAIT_HOIST_BENCH', 'HOIST_BENCH'];
const WORK_STAGES = ['PREP_CAGE', 'PREP_BOLT', 'UNBOLT', 'EXTRACT'];

function findSeg<T extends { t0: number; t1: number }>(segs: T[], t: number): T | undefined {
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

export default function PlantCanvasB({ r, b }: Props) {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [t, setT] = useAnimationClock(playing, speed, LOOP_S);
  const [selected, setSelected] = useState<number | null>(0);
  const des = r.des;
  const bath = b.coolMode === 'bath';
  const P = des.ports;
  const spacing = Math.min(100, 400 / Math.max(1, P - 1));
  const portY = (i: number) => 325 + (i - (P - 1) / 2) * spacing - MOLD_H / 2; // arista superior del molde
  const cols = Math.ceil(b.bathSlots / 2);
  const slotW = (BATH.w - 24) / cols;
  const bathPos = (s: number) => ({
    x: BATH.x + 12 + slotW * (Math.floor(s / 2) + 0.5),
    y: BATH.y + 46 + (s % 2) * 62,
    w: Math.min(70, slotW * 0.86),
  });

  const placeXY = (place: HoistPlace, slot: number): { x: number; y: number } => {
    if (place === 'port') return { x: PORT_X + MOLD_W / 2, y: portY(Math.max(0, slot)) };
    if (place === 'bath') {
      const p = bathPos(Math.max(0, slot));
      return { x: p.x, y: p.y };
    }
    if (place === 'bench') return { x: BENCH_X, y: BENCH_Y - 44 };
    return { x: BUFFER.x + 50, y: BUFFER.y - 30 };
  };

  // Estado de cada molde
  const states = Array.from({ length: des.moldCount }, (_, id) => {
    const seg = findSeg(des.segmentsByMold[id], t);
    const k = seg ? seg.k0 + (t - seg.t0) : 0;
    const hasPiece = !!seg && seg.piece;
    const core = hasPiece ? sampleCurve(r.cooling, k, 'core', b.meltTempC) : 35;
    const surf = hasPiece ? sampleCurve(r.cooling, k, 'surface', b.meltTempC) : 35;
    const progress = seg ? clamp01((t - seg.t0) / Math.max(1e-6, seg.t1 - seg.t0)) : 0;
    return { id, seg, k, hasPiece, core, surf, progress };
  });
  type MS = (typeof states)[number];

  // Extrusor / válvula
  const extSeg = findSeg(des.extruderSegments, t);
  const extState = extSeg ? extSeg.state : 'BLOCKED';
  const fillingMold = extSeg ? states[extSeg.mold] : undefined;
  const targetPort = (m: MS | undefined): number => (m?.seg ? (bath ? Math.max(0, m.seg.slot) : m.id) : 0);
  const extProg = extSeg ? clamp01((t - extSeg.t0) / (extSeg.t1 - extSeg.t0)) : 0;

  // Polipasto
  const hoist = (() => {
    const segs = des.hoistSegments;
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
    if (idx < 0) return { x: 700, y: 120, carrying: null as number | null, seg: undefined as HoistSegment | undefined, f: 0 };
    const s = segs[idx];
    const prev = idx > 0 ? placeXY(segs[idx - 1].to, segs[idx - 1].slot) : { x: 700, y: 120 };
    const from = placeXY(s.from, s.slot);
    const to = placeXY(s.to, s.slot);
    if (t >= s.t1) return { x: to.x, y: 120, carrying: null, seg: undefined, f: 1 };
    const f = (t - s.t0) / (s.t1 - s.t0);
    const lift = 150;
    if (f < 0.15) return { x: lerp(prev.x, from.x, f / 0.15), y: lerp(120, from.y - 8, f / 0.15), carrying: null, seg: s, f };
    if (f < 0.25) return { x: from.x, y: lerp(from.y - 8, lift, (f - 0.15) / 0.1), carrying: s.mold, seg: s, f };
    if (f < 0.78) return { x: lerp(from.x, to.x, (f - 0.25) / 0.53), y: lift, carrying: s.mold, seg: s, f };
    return { x: to.x, y: lerp(lift, to.y - 8, (f - 0.78) / 0.22), carrying: s.mold, seg: s, f };
  })();

  const doneCount = useMemo(() => {
    const times = des.segments.filter((s) => s.stage === 'EXTRACT').map((s) => s.t1).sort((x, y) => x - y);
    return times;
  }, [des]);
  const done = (() => {
    let lo = 0;
    let hi = doneCount.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (doneCount[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  })();

  const busyOps = states.filter((s) => s.seg && WORK_STAGES.includes(s.seg.stage)).length;

  // Posición de cada molde (esquina superior izquierda del glifo)
  const benchMolds = states.filter((s) => s.seg && ['PREP_CAGE', 'PREP_BOLT', 'UNBOLT', 'EXTRACT', 'WAIT_OPERATOR'].includes(s.seg.stage) && bath);
  const bufferMolds = states.filter((s) => s.seg?.stage === 'READY' && bath);

  const bufferRect = (m: MS) => {
    const i = Math.max(0, bufferMolds.findIndex((x) => x.id === m.id));
    return { x: BUFFER.x + i * 60, y: BUFFER.y - 40, w: 52, h: 36, visible: true };
  };
  const portRect = (slot: number) => ({ x: PORT_X, y: portY(Math.max(0, slot)), w: MOLD_W, h: MOLD_H, visible: true });
  const bathRect = (slot: number) => {
    const sp = bathPos(Math.max(0, slot));
    return { x: sp.x - sp.w / 2, y: sp.y, w: sp.w, h: 44, visible: true };
  };

  const moldPos = (m: MS): { x: number; y: number; w: number; h: number; visible: boolean } => {
    const seg = m.seg as BSegment | undefined;
    if (!seg) return { x: 0, y: 0, w: 0, h: 0, visible: false };
    if (!bath) return portRect(m.id);
    const st = seg.stage;
    if (['HOIST_IN', 'HOIST_OUT', 'HOIST_BENCH'].includes(st)) {
      const hs = hoist.seg;
      if (hs && hs.mold === m.id) {
        if (hoist.f >= 0.15) return { x: hoist.x - 40, y: hoist.y + 8, w: 80, h: 44, visible: true };
        // la grúa aún se aproxima: el molde sigue en su origen
        if (hs.from === 'buffer') return bufferRect(m);
        if (hs.from === 'port') return portRect(hs.slot);
        return bathRect(hs.slot);
      }
      return { x: 0, y: 0, w: 0, h: 0, visible: false };
    }
    if (PORT_STAGES.includes(st)) return portRect(seg.slot);
    if (BATH_STAGES.includes(st)) return bathRect(seg.slot);
    if (st === 'READY') return bufferRect(m);
    const i = Math.max(0, benchMolds.findIndex((x) => x.id === m.id));
    return { x: BENCH_X - 46 + ((i % 2) - 0.5) * 100 + 20, y: BENCH_Y - 62, w: 92, h: 44, visible: true };
  };

  const glyph = (m: MS) => {
    const pos = moldPos(m);
    if (!pos.visible || !m.seg) return null;
    const color = m.hasPiece ? tempColor(m.core) : '#64748b';
    const sel = selected === m.id;
    const big = pos.w >= 150;
    const stage = m.seg.stage;
    const fillFrac = stage === 'FILLING' ? m.progress : stage === 'SWITCH' || stage === 'WAIT_EXTRUDER' || stage === 'READY' || !m.hasPiece ? 0 : 1;
    return (
      <g key={m.id} transform={`translate(${pos.x},${pos.y})`} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelected(m.id); }}>
        <rect width={pos.w} height={pos.h} rx={4} fill="#475569" stroke={sel ? '#fff' : '#0f172a'} strokeWidth={sel ? 2.5 : 1.5} />
        {big ? (
          <>
            <rect x={8} y={8} width={pos.w - 16} height={pos.h - 16} rx={3} fill="#0f172a" />
            <rect x={8} y={8} width={(pos.w - 16) * (stage === 'FILLING' ? fillFrac : m.hasPiece ? 1 : 0)} height={pos.h - 16} rx={3} fill={color} />
            {[14, pos.w / 2, pos.w - 14].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy={4} r={2.4} fill="#cbd5e1" />
                <circle cx={cx} cy={pos.h - 4} r={2.4} fill="#cbd5e1" />
              </g>
            ))}
          </>
        ) : (
          <rect x={3} y={3} width={pos.w - 6} height={pos.h - 6} rx={3} fill={color} opacity={fillFrac > 0 || m.hasPiece ? 1 : 0.5} />
        )}
        <text x={pos.w / 2} y={pos.h / 2 + 4} textAnchor="middle" fontSize={big ? 14 : 11} fontWeight={700} fill="#f8fafc" stroke="#0f172a" strokeWidth={0.4}>
          {m.id + 1}
        </text>
        {r.mass.steelKg > 0 && big && m.hasPiece && <text x={pos.w - 6} y={pos.h - 10} textAnchor="end" fontSize={9} fill="#e2e8f0">#</text>}
      </g>
    );
  };

  // Etiqueta por puesto
  const stationLabel = (m: MS | undefined, i: number) => {
    const y = portY(i);
    const occupant = bath
      ? states.find((s) => s.seg && PORT_STAGES.includes(s.seg.stage) && s.seg.slot === i && !(s.seg.stage === 'HOIST_IN' && hoist.carrying === s.id && hoist.f >= 0.15 && hoist.f < 0.78))
      : m;
    return (
      <g key={i}>
        <text x={PORT_X + MOLD_W + 10} y={y + 20} fontSize={11} fill="#cbd5e1" fontWeight={600}>Puesto {i + 1}</text>
        <text x={PORT_X + MOLD_W + 10} y={y + 35} fontSize={10} fill="#94a3b8">
          {occupant?.seg ? STAGE_LABEL_B[occupant.seg.stage] : bath ? 'libre' : ''}
        </text>
        {occupant?.hasPiece && (
          <text x={PORT_X + MOLD_W + 10} y={y + 50} fontSize={10} fill={tempColor(occupant.core)}>
            núcleo {occupant.core.toFixed(0)} °C
          </text>
        )}
      </g>
    );
  };

  const sel = selected !== null ? states[selected] : undefined;
  const leverY = P > 1 ? 325 + (targetPort(fillingMold) - (P - 1) / 2) * spacing : 325;
  const activeBranchY = extState === 'FILLING' || extState === 'SWITCHING' ? 325 + (targetPort(fillingMold) - (P - 1) / 2) * spacing : null;
  const slotsBath = Array.from({ length: bath ? b.bathSlots : 0 }, (_, i) => bathPos(i));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Método B · intrusión directa con manifold en «T»</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <button className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pausa' : 'Reanudar'}
          </button>
          <button className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600" onClick={() => setT(0)} title="Reiniciar">
            <RotateCcw size={14} />
          </button>
          <label className="flex items-center gap-1 text-slate-400">
            Velocidad
            <select className="rounded bg-slate-800 px-1 py-1 text-slate-200" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[10, 30, 60, 120, 300, 600].map((v) => (
                <option key={v} value={v}>×{v}</option>
              ))}
            </select>
          </label>
          <span className="font-mono text-slate-300">{fmtClock(t)}</span>
          <input type="range" min={0} max={LOOP_S} step={10} value={t} onChange={(e) => setT(Number(e.target.value))} className="w-40 accent-sky-400" aria-label="Tiempo de simulación" />
        </div>
      </div>

      <svg viewBox="0 0 1280 640" className="w-full rounded-lg bg-slate-950" onClick={() => setSelected(null)}>
        <defs>
          <linearGradient id="steelB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#64748b" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="waterB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0ea5e9" stopOpacity="0.5" />
            <stop offset="1" stopColor="#0369a1" stopOpacity="0.8" />
          </linearGradient>
          <pattern id="gridB" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#1e293b" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1280" height="640" fill="url(#gridB)" />
        <rect y="610" width="1280" height="30" fill="#0b1220" />

        {/* ===== Extrusor ===== */}
        <g>
          <rect x={14} y={296} width={50} height={58} rx={6} fill="#1e3a5f" stroke="#60a5fa" />
          <text x={39} y={329} textAnchor="middle" fontSize={10} fill="#bfdbfe" fontWeight={700}>M</text>
          <rect x={64} y={300} width={270} height={50} rx={8} fill="url(#steelB)" stroke="#94a3b8" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={74 + i * 42} y={300} width={16} height={50} fill={['#64748b', '#94a3b8', '#f59e0b', '#fb923c', '#f97316', '#ef4444'][i]} opacity={0.7}>
              <animate attributeName="opacity" values="0.5;0.9;0.5" dur={`${Math.max(0.4, 6 / Math.max(1, r.rheo.rpm / 20))}s`} begin={`${i * 0.15}s`} repeatCount="indefinite" />
            </rect>
          ))}
          <path d="M100 300 L130 300 L120 250 L110 250 Z" fill="#475569" stroke="#94a3b8" />
          <text x={115} y={242} textAnchor="middle" fontSize={10} fill="#94a3b8">
            Tolva {b.fiberFeed === 'hopper' ? '+ FV' : 'PE scrap'}
          </text>
          {b.fiberFeed === 'side' ? (
            <g>
              <rect x={236} y={236} width={34} height={64} rx={4} fill="#14532d" stroke="#4ade80" />
              <text x={253} y={214} textAnchor="middle" fontSize={10} fill="#86efac" fontWeight={700}>Side Feeder</text>
              {[0, 1, 2].map((i) => (
                <rect key={i} x={244 + i * 8} y={246} width={3} height={14} fill="#bbf7d0">
                  <animate attributeName="y" values="246;286;246" dur="1.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                </rect>
              ))}
              <text x={253} y={227} textAnchor="middle" fontSize={9} fill="#4ade80">zona de venteo</text>
            </g>
          ) : (
            <text x={115} y={230} textAnchor="middle" fontSize={9} fill="#fbbf24">FV con el PE (dry blend)</text>
          )}
          <text x={190} y={372} textAnchor="middle" fontSize={11} fill="#cbd5e1" fontWeight={600}>
            Extrusor Ø{b.screwDiaMm} · L/D {b.screwLD} · {r.rheo.rpm.toFixed(0)} rpm
          </text>
          <text x={190} y={387} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {b.extruderKgH} kg/h · masa {b.meltTempC} °C · fibra final {r.rheo.fiberLengthFinalMm.toFixed(2)} mm
          </text>
          <g transform="translate(70,412)">
            <rect width={250} height={24} rx={12} fill={extState === 'FILLING' ? '#052e16' : extState === 'SWITCHING' ? '#422006' : '#450a0a'} stroke={extState === 'FILLING' ? '#22c55e' : extState === 'SWITCHING' ? '#f59e0b' : '#ef4444'} />
            <text x={125} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill={extState === 'FILLING' ? '#4ade80' : extState === 'SWITCHING' ? '#fbbf24' : '#f87171'}>
              {extState === 'FILLING' ? `EXTRUSOR LLENANDO · molde ${(fillingMold?.id ?? 0) + 1}` : extState === 'SWITCHING' ? 'CONMUTANDO VÁLVULA T' : 'BLOQUEADO · ESPERA DE MATRIZ'}
            </text>
          </g>
          <text x={195} y={460} textAnchor="middle" fontSize={10} fill="#94a3b8">
            Utilización {(des.util.extruder * 100).toFixed(0)} % · bloqueado {(des.util.blocked * 100).toFixed(0)} %
          </text>
        </g>

        {/* ===== Boquilla, válvula en T y ramales ===== */}
        <g>
          <path d="M334 325 H372" stroke={extState === 'BLOCKED' ? '#475569' : '#f97316'} strokeWidth={14} />
          <rect x={372} y={298} width={52} height={54} rx={8} fill="#7c2d12" stroke="#fdba74" strokeWidth={2} />
          <text x={398} y={321} textAnchor="middle" fontSize={11} fill="#ffedd5" fontWeight={700}>T</text>
          <line x1={398} y1={325} x2={398 + 18} y2={325 + (leverY - 325) * 0.25} stroke="#fff" strokeWidth={4} strokeLinecap="round" />
          <text x={398} y={372} textAnchor="middle" fontSize={10} fill="#fdba74">ΔP {r.rheo.dPtotalBar.toFixed(0)}/{b.pMaxBar} bar</text>
          {P > 1 && <line x1={448} y1={325 + (0 - (P - 1) / 2) * spacing} x2={448} y2={325 + ((P - 1) / 2) * spacing} stroke="#9a3412" strokeWidth={10} />}
          <path d="M424 325 H448" stroke="#9a3412" strokeWidth={10} />
          {Array.from({ length: P }, (_, i) => {
            const y = 325 + (i - (P - 1) / 2) * spacing;
            const active = activeBranchY !== null && Math.abs(activeBranchY - y) < 1;
            return (
              <g key={i}>
                <path d={`M448 ${y} H${PORT_X}`} stroke={active ? '#f97316' : '#9a3412'} strokeWidth={active ? 10 : 8} />
                {active && extState === 'FILLING' && (
                  <path d={`M448 ${y} H${PORT_X}`} stroke="#fed7aa" strokeWidth={3} strokeDasharray="8 10">
                    <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.7s" repeatCount="indefinite" />
                  </path>
                )}
                <circle cx={448} cy={y} r={5} fill={active ? '#fb923c' : '#7c2d12'} />
              </g>
            );
          })}
          {extState === 'FILLING' && activeBranchY !== null && (
            <path d={`M424 325 H448 V${activeBranchY}`} stroke="#fb923c" strokeWidth={10} fill="none" opacity={0.85} />
          )}
          {extState === 'SWITCHING' && activeBranchY !== null && (
            <path d={`M424 325 H448 V${lerp(325, activeBranchY, extProg)}`} stroke="#fbbf24" strokeWidth={6} fill="none" strokeDasharray="4 6" />
          )}
        </g>

        {/* ===== Puestos y moldes ===== */}
        {Array.from({ length: P }, (_, i) => (
          <g key={`port${i}`}>
            <rect x={PORT_X - 14} y={portY(i) - 6} width={MOLD_W + 28} height={MOLD_H + 12} rx={6} fill="none" stroke={!bath ? '#0ea5e9' : '#334155'} strokeDasharray={bath ? '5 4' : undefined} strokeWidth={!bath ? 2 : 1} opacity={0.8} />
            {stationLabel(!bath ? states[i] : undefined, i)}
          </g>
        ))}
        {!bath && <text x={PORT_X + MOLD_W / 2} y={portY(0) - 20} textAnchor="middle" fontSize={10} fill="#38bdf8">camisa de refrigeración in-situ · {b.jacketTempC} °C · h = {b.hInSitu} W/m²K</text>}

        {/* ===== Batea, polipasto y mesa (modo batea) ===== */}
        {bath && (
          <g>
            <line x1={480} y1={36} x2={1250} y2={36} stroke="#facc15" strokeWidth={3} />
            <rect x={480} y={32} width={770} height={8} fill="#ca8a04" />
            <rect x={hoist.x - 22} y={26} width={44} height={20} rx={3} fill="#eab308" stroke="#fef08a" />
            <line x1={hoist.x} y1={46} x2={hoist.x} y2={hoist.y} stroke="#e2e8f0" strokeWidth={2} />
            <path d={`M${hoist.x - 8} ${hoist.y} h16 v6 a8 8 0 0 1 -16 0 z`} fill="#facc15" />
            <text x={1240} y={22} textAnchor="end" fontSize={11} fill="#facc15">Polipasto</text>

            <rect x={BATH.x} y={BATH.y} width={BATH.w} height={BATH.h} rx={6} fill="#082f49" stroke="#38bdf8" strokeWidth={2} />
            {slotsBath.map((s, i) => (
              <rect key={i} x={s.x - s.w / 2 - 2} y={s.y + 46} width={s.w + 4} height={3} fill="#0c4a6e" />
            ))}
            <text x={BATH.x + BATH.w / 2} y={BATH.y + BATH.h + 16} textAnchor="middle" fontSize={11} fill="#7dd3fc" fontWeight={600}>
              Batea · agua {b.bathTempC} °C · {b.bathSlots} posiciones
            </text>

            <rect x={BENCH_X - 100} y={BENCH_Y} width={200} height={12} fill="url(#steelB)" stroke="#94a3b8" />
            <rect x={BENCH_X - 92} y={BENCH_Y + 12} width={10} height={56} fill="#475569" />
            <rect x={BENCH_X + 82} y={BENCH_Y + 12} width={10} height={56} fill="#475569" />
            <text x={BENCH_X} y={BENCH_Y + 88} textAnchor="middle" fontSize={11} fill="#cbd5e1" fontWeight={600}>Mesa de desmoldeo</text>
            <text x={BENCH_X} y={BENCH_Y + 102} textAnchor="middle" fontSize={10} fill="#94a3b8">pernos · botadores · jaula</text>
            <text x={BUFFER.x - 10} y={BUFFER.y - 48} fontSize={10} fill="#64748b">buffer de moldes listos y apernados →</text>
            <line x1={BUFFER.x - 20} y1={BUFFER.y - 2} x2={BUFFER.x + 330} y2={BUFFER.y - 2} stroke="#475569" strokeWidth={3} strokeDasharray="8 5" />
          </g>
        )}

        {/* moldes */}
        {states.filter((m) => !(bath && hoist.carrying === m.id && hoist.f >= 0.15 && m.seg && ['HOIST_IN', 'HOIST_OUT', 'HOIST_BENCH'].includes(m.seg.stage))).map(glyph)}
        {bath && hoist.carrying !== null && states[hoist.carrying]?.seg && hoist.f >= 0.15 && ['HOIST_IN', 'HOIST_OUT', 'HOIST_BENCH'].includes(states[hoist.carrying].seg!.stage) && glyph(states[hoist.carrying])}

        {/* Operarios */}
        {states.filter((s) => s.seg && WORK_STAGES.includes(s.seg.stage)).map((m) => {
          const pos = moldPos(m);
          const left = pos.x + pos.w + 160 > 1270;
          const ox = left ? pos.x - 12 : pos.x + pos.w + 10;
          const oy = pos.y + pos.h / 2;
          return (
            <g key={`op${m.id}`} transform={`translate(${ox},${oy})`}>
              <circle r={6} cy={-8} fill="#fbbf24" stroke="#0f172a" />
              <rect x={-5} y={-2} width={10} height={14} rx={3} fill="#f59e0b" stroke="#0f172a" />
              <text x={left ? -12 : 12} y={4} fontSize={9} fill="#fde68a" textAnchor={left ? 'end' : 'start'}>{STAGE_LABEL_B[m.seg!.stage]}</text>
            </g>
          );
        })}

        {/* contador y leyenda */}
        <g>
          <rect x={1100} y={70} width={150} height={56} rx={8} fill="#052e16" stroke="#22c55e" />
          <text x={1175} y={90} textAnchor="middle" fontSize={10} fill="#86efac">PIEZAS TERMINADAS</text>
          <text x={1175} y={116} textAnchor="middle" fontSize={22} fill="#4ade80" fontWeight={700} fontFamily="monospace">{done}</text>
          <rect x={1100} y={134} width={150} height={26} rx={6} fill="#1e293b" stroke="#475569" />
          <text x={1175} y={151} textAnchor="middle" fontSize={10} fill="#cbd5e1">Operarios ocupados {busyOps}/{b.operators}</text>
        </g>
        <g transform="translate(30,622)">
          <text x={0} y={0} fontSize={10} fill="#94a3b8">Temp. núcleo</text>
          {[30, 50, 80, 110, 150, 190].map((v, i) => (
            <g key={v} transform={`translate(${82 + i * 60},-10)`}>
              <rect width={14} height={12} fill={tempColor(v)} rx={2} />
              <text x={18} y={10} fontSize={10} fill="#cbd5e1">{v}°C</text>
            </g>
          ))}
        </g>
        <text x={1250} y={632} textAnchor="end" fontSize={10} fill="#64748b">Clic en un molde para ver su estado</text>
      </svg>

      <div className="mt-2 min-h-[44px] rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
        {sel && sel.seg ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="font-semibold text-sky-300">Molde #{sel.id + 1}</span>
            <span>{STAGE_LABEL_B[sel.seg.stage]}</span>
            {sel.hasPiece ? (
              <>
                <span>Núcleo <b style={{ color: tempColor(sel.core) }}>{sel.core.toFixed(0)} °C</b></span>
                <span>Superficie <b style={{ color: tempColor(sel.surf) }}>{sel.surf.toFixed(0)} °C</b></span>
              </>
            ) : (
              <span>Molde sin pieza</span>
            )}
            <span>Etapa: {fmtMinSec(Math.max(0, sel.seg.t1 - t))} restantes</span>
          </div>
        ) : (
          'Seleccione un molde para ver su estado, temperatura y tiempo restante.'
        )}
      </div>
    </div>
  );
}
