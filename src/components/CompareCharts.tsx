import { useState } from 'react';
import type { LoadCurve } from '../engine/compareCurves';

export const COLOR_A = '#f97316';
export const COLOR_B = '#22d3ee';

export interface Seg {
  label: string;
  s: number;
  cat: 'prep' | 'form' | 'move' | 'cool' | 'demold';
}

const CAT_COLOR: Record<Seg['cat'], string> = {
  prep: '#818cf8',
  form: '#f97316',
  move: '#eab308',
  cool: '#38bdf8',
  demold: '#a78bfa',
};
const CAT_LABEL: Record<Seg['cat'], string> = {
  prep: 'Carga / preparación',
  form: 'Conformado (prensado, llenado)',
  move: 'Traslados',
  cool: 'Enfriamiento',
  demold: 'Desapriete y desmoldeo',
};

interface CycleProps {
  a: { segs: Seg[]; takt: number };
  b: { segs: Seg[]; takt: number };
}

const mm = (s: number) => `${(s / 60).toFixed(1)} min`;

/** Barras de takt time y descomposición del ciclo del molde por estación */
export function CycleBars({ a, b }: CycleProps) {
  const [hover, setHover] = useState<string | null>(null);
  const totA = a.segs.reduce((s, x) => s + x.s, 0);
  const totB = b.segs.reduce((s, x) => s + x.s, 0);
  const max = Math.max(totA, totB, 1);
  const W = 640;
  const x0 = 96;
  const bw = W - x0 - 80;
  const rows = [
    { name: 'A · Compresión', data: a, tot: totA, color: COLOR_A },
    { name: 'B · Intrusión', data: b, tot: totB, color: COLOR_B },
  ];
  const taktMax = Math.max(a.takt, b.takt, 1);
  return (
    <svg viewBox={`0 0 ${W} 268`} className="w-full">
      <text x={0} y={14} fontSize={11} fill="#94a3b8" fontWeight={600}>Ciclo completo de un molde (min) · barras apiladas por estación</text>
      {rows.map((r, i) => {
        let x = x0;
        const y = 28 + i * 44;
        return (
          <g key={r.name}>
            <text x={0} y={y + 18} fontSize={11} fill={r.color} fontWeight={700}>{r.name}</text>
            {r.data.segs.map((sg, j) => {
              const w = Math.max(0, (sg.s / max) * bw);
              const el = (
                <g key={j} onMouseEnter={() => setHover(`${r.name}: ${sg.label} — ${mm(sg.s)} (${((sg.s / r.tot) * 100).toFixed(0)} %)`)} onMouseLeave={() => setHover(null)}>
                  <rect x={x} y={y} width={w} height={26} fill={CAT_COLOR[sg.cat]} stroke="#0f172a" strokeWidth={1} opacity={0.92} />
                  {w > 34 && <text x={x + w / 2} y={y + 17} textAnchor="middle" fontSize={9} fill="#0f172a" fontWeight={700}>{(sg.s / 60).toFixed(1)}</text>}
                </g>
              );
              x += w;
              return el;
            })}
            <text x={x + 4} y={y + 18} fontSize={10} fill="#e2e8f0">{(r.tot / 60).toFixed(1)} min</text>
          </g>
        );
      })}
      <text x={0} y={128} fontSize={11} fill="#94a3b8" fontWeight={600}>Takt time: intervalo entre piezas terminadas (min)</text>
      {rows.map((r, i) => {
        const y = 140 + i * 32;
        const w = (r.data.takt / taktMax) * bw;
        return (
          <g key={r.name} onMouseEnter={() => setHover(`${r.name}: takt ${isFinite(r.data.takt) ? mm(r.data.takt) : '—'}`)} onMouseLeave={() => setHover(null)}>
            <text x={0} y={y + 16} fontSize={11} fill={r.color} fontWeight={700}>{r.name}</text>
            <rect x={x0} y={y} width={isFinite(w) ? w : 0} height={22} fill={r.color} opacity={0.85} rx={2} />
            <text x={x0 + (isFinite(w) ? w : 0) + 4} y={y + 15} fontSize={10} fill="#e2e8f0">{isFinite(r.data.takt) ? mm(r.data.takt) : '—'}</text>
          </g>
        );
      })}
      <g transform="translate(0,214)">
        {(Object.keys(CAT_COLOR) as Seg['cat'][]).map((c, i) => (
          <g key={c} transform={`translate(${(i % 3) * 215},${Math.floor(i / 3) * 16})`}>
            <rect width={10} height={10} fill={CAT_COLOR[c]} rx={2} />
            <text x={14} y={9} fontSize={10} fill="#cbd5e1">{CAT_LABEL[c]}</text>
          </g>
        ))}
      </g>
      <text x={W} y={262} textAnchor="end" fontSize={10} fill="#e2e8f0">{hover ?? 'Pase el cursor sobre una barra'}</text>
    </svg>
  );
}

interface LDProps {
  a: LoadCurve;
  b: LoadCurve;
  xMax: number;
  limitMm: number;
  classes: { label: string; kN: number }[];
  targetKN: number;
}

/** Curvas carga-flecha (deformación permanente y total) frente al límite EN 124 */
export function LoadDeflectionChart({ a, b, xMax, limitMm, classes, targetKN }: LDProps) {
  const [hx, setHx] = useState<number | null>(null);
  const W = 640;
  const H = 300;
  const m = { l: 46, r: 14, t: 16, b: 38 };
  const yMax = Math.max(limitMm * 3, 6);
  const x = (v: number) => m.l + (v / xMax) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - (Math.min(v, yMax) / yMax) * (H - m.t - m.b);
  const path = (c: LoadCurve, key: 'permanentMm' | 'totalMm') => {
    let d = '';
    for (const p of c.points) {
      if (p[key] > yMax) break;
      d += `${d ? 'L' : 'M'}${x(p.loadKN).toFixed(1)} ${y(p[key]).toFixed(1)}`;
    }
    return d;
  };
  const at = (c: LoadCurve, kN: number, key: 'permanentMm' | 'totalMm') => {
    const pts = c.points;
    if (kN > c.failureKN) return null;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].loadKN >= kN) {
        const f = (kN - pts[i - 1].loadKN) / Math.max(1e-9, pts[i].loadKN - pts[i - 1].loadKN);
        return pts[i - 1][key] + (pts[i][key] - pts[i - 1][key]) * f;
      }
    }
    return pts[pts.length - 1][key];
  };
  const xTicks = Array.from({ length: Math.floor(xMax / 100) + 1 }, (_, i) => i * 100);
  const yTicks = Array.from({ length: Math.floor(yMax) + 1 }, (_, i) => i);
  const hv = hx === null ? null : hx;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const v = ((px - m.l) / (W - m.l - m.r)) * xMax;
        setHx(v >= 0 && v <= xMax ? v : null);
      }}
      onMouseLeave={() => setHx(null)}
    >
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#1e293b" />
          <text x={m.l - 6} y={y(v) + 3} fontSize={9} fill="#94a3b8" textAnchor="end">{v}</text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke="#1e293b" />
          <text x={x(v)} y={H - m.b + 13} fontSize={9} fill="#94a3b8" textAnchor="middle">{v}</text>
        </g>
      ))}
      <text x={(W + m.l) / 2} y={H - 4} fontSize={10} fill="#94a3b8" textAnchor="middle">Carga aplicada (kN)</text>
      <text transform={`translate(11,${H / 2}) rotate(-90)`} fontSize={10} fill="#94a3b8" textAnchor="middle">Flecha (mm)</text>

      <line x1={m.l} x2={W - m.r} y1={y(limitMm)} y2={y(limitMm)} stroke="#ef4444" strokeDasharray="6 4" />
      <text x={W - m.r - 2} y={y(limitMm) - 4} fontSize={9} fill="#f87171" textAnchor="end">límite de flecha residual {limitMm.toFixed(1)} mm</text>
      {classes.map((c) => (
        <g key={c.label}>
          <line x1={x(c.kN)} x2={x(c.kN)} y1={m.t} y2={H - m.b} stroke="#64748b" strokeDasharray="4 4" />
          <text x={x(c.kN) + 3} y={m.t + 10} fontSize={9} fill="#94a3b8">{c.label} · {c.kN} kN</text>
        </g>
      ))}

      <path d={path(a, 'totalMm')} stroke={COLOR_A} strokeWidth={1.5} fill="none" strokeDasharray="3 3" opacity={0.6} />
      <path d={path(b, 'totalMm')} stroke={COLOR_B} strokeWidth={1.5} fill="none" strokeDasharray="3 3" opacity={0.6} />
      <path d={path(a, 'permanentMm')} stroke={COLOR_A} strokeWidth={2.5} fill="none" />
      <path d={path(b, 'permanentMm')} stroke={COLOR_B} strokeWidth={2.5} fill="none" />

      {[ [a, COLOR_A], [b, COLOR_B] ].map(([c, col], i) => {
        const cv = c as LoadCurve;
        const lastP = cv.points[cv.points.length - 1];
        return (
          <g key={i}>
            <circle cx={x(cv.proof.loadKN)} cy={y(cv.proof.permanentMm)} r={4} fill={col as string} stroke="#fff" />
            <text x={x(lastP.loadKN)} y={y(Math.min(lastP.permanentMm, yMax)) - 6} fontSize={11} fill={col as string} textAnchor="middle" fontWeight={700}>✕</text>
          </g>
        );
      })}
      <text x={x(targetKN)} y={H - m.b - 4} fontSize={9} fill="#e2e8f0" textAnchor="middle">▲ F ensayo {targetKN.toFixed(0)} kN</text>

      {hv !== null && (
        <g>
          <line x1={x(hv)} x2={x(hv)} y1={m.t} y2={H - m.b} stroke="#e2e8f0" opacity={0.5} />
          {(() => {
            const va = at(a, hv, 'permanentMm');
            const vb = at(b, hv, 'permanentMm');
            const ta = at(a, hv, 'totalMm');
            const tb = at(b, hv, 'totalMm');
            return (
              <g transform={`translate(${Math.min(x(hv) + 8, W - 190)},${m.t + 18})`}>
                <rect width={182} height={64} rx={5} fill="#0f172a" stroke="#475569" opacity={0.95} />
                <text x={8} y={14} fontSize={10} fill="#e2e8f0" fontWeight={700}>{hv.toFixed(0)} kN</text>
                <text x={8} y={30} fontSize={10} fill={COLOR_A}>A: perm. {va === null ? 'rotura' : `${va.toFixed(2)} mm`} · total {ta === null ? '—' : `${ta.toFixed(2)}`}</text>
                <text x={8} y={46} fontSize={10} fill={COLOR_B}>B: perm. {vb === null ? 'rotura' : `${vb.toFixed(2)} mm`} · total {tb === null ? '—' : `${tb.toFixed(2)}`}</text>
                <text x={8} y={59} fontSize={8} fill="#94a3b8">sólida = permanente · punteada = total</text>
              </g>
            );
          })()}
        </g>
      )}
      <g transform={`translate(${m.l + 8},${m.t + 24})`}>
        <line x2={18} stroke={COLOR_A} strokeWidth={2.5} /><text x={23} y={3} fontSize={10} fill="#e2e8f0">A · Compresión</text>
        <line y1={14} x2={18} y2={14} stroke={COLOR_B} strokeWidth={2.5} /><text x={23} y={17} fontSize={10} fill="#e2e8f0">B · Intrusión</text>
      </g>
    </svg>
  );
}

interface CostProps {
  a: { material: number; labor: number; energy: number; capex: number };
  b: { material: number; labor: number; energy: number; capex: number };
}

const COST_PARTS: { key: 'material' | 'labor' | 'energy' | 'capex'; label: string; color: string }[] = [
  { key: 'material', label: 'Materiales', color: '#34d399' },
  { key: 'labor', label: 'Mano de obra', color: '#a78bfa' },
  { key: 'energy', label: 'Energía', color: '#fbbf24' },
  { key: 'capex', label: 'Amortización', color: '#60a5fa' },
];

export function CostBars({ a, b }: CostProps) {
  const [hover, setHover] = useState<string | null>(null);
  const tot = (c: CostProps['a']) => c.material + c.labor + c.energy + c.capex;
  const max = Math.max(tot(a), tot(b), 1e-9);
  const W = 640;
  const x0 = 96;
  const bw = W - x0 - 70;
  return (
    <svg viewBox={`0 0 ${W} 124`} className="mx-auto w-full max-w-[760px]">
      {[ ['A · Compresión', a, COLOR_A], ['B · Intrusión', b, COLOR_B] ].map(([name, c, col], i) => {
        const cc = c as CostProps['a'];
        let x = x0;
        const y = 8 + i * 38;
        return (
          <g key={name as string}>
            <text x={0} y={y + 18} fontSize={11} fill={col as string} fontWeight={700}>{name as string}</text>
            {COST_PARTS.map((p) => {
              const w = (cc[p.key] / max) * bw;
              const el = (
                <g key={p.key} onMouseEnter={() => setHover(`${name}: ${p.label} $${cc[p.key].toFixed(2)}/pieza`)} onMouseLeave={() => setHover(null)}>
                  <rect x={x} y={y} width={w} height={26} fill={p.color} stroke="#0f172a" opacity={0.9} />
                </g>
              );
              x += w;
              return el;
            })}
            <text x={x + 4} y={y + 18} fontSize={11} fill="#e2e8f0" fontWeight={700}>${tot(cc).toFixed(2)}</text>
          </g>
        );
      })}
      <g transform="translate(0,90)">
        {COST_PARTS.map((p, i) => (
          <g key={p.key} transform={`translate(${i * 120},0)`}>
            <rect width={10} height={10} fill={p.color} rx={2} />
            <text x={14} y={9} fontSize={10} fill="#cbd5e1">{p.label}</text>
          </g>
        ))}
      </g>
      <text x={W} y={118} textAnchor="end" fontSize={10} fill="#e2e8f0">{hover ?? ''}</text>
    </svg>
  );
}
