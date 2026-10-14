import type { CoolingCurve, ProcessParams } from '../types/simulation';

interface Props {
  cooling: CoolingCurve;
  params: ProcessParams;
}

/** Curva Temperatura vs. Tiempo (núcleo y superficie de la nervadura crítica) */
export default function CoolingChart({ cooling, params }: Props) {
  const W = 620;
  const H = 280;
  const m = { l: 44, r: 14, t: 14, b: 36 };
  const tMax = Math.max(cooling.tBathIn + cooling.dwellS * 1.25, cooling.tBathIn + (isFinite(cooling.timeToCore50S) ? cooling.timeToCore50S * 1.2 : 0), 1800);
  const T0 = 0;
  const T1 = Math.ceil((params.meltTempC + 5) / 20) * 20;
  const x = (s: number) => m.l + (s / tMax) * (W - m.l - m.r);
  const y = (T: number) => H - m.b - ((T - T0) / (T1 - T0)) * (H - m.t - m.b);
  const path = (arr: number[]) => {
    let d = '';
    for (let i = 0; i < cooling.t.length; i++) {
      if (cooling.t[i] > tMax) break;
      d += `${d ? 'L' : 'M'}${x(cooling.t[i]).toFixed(1)} ${y(arr[i]).toFixed(1)}`;
    }
    return d;
  };
  const xTicks: number[] = [];
  const step = tMax > 3600 ? 900 : 300;
  for (let s = 0; s <= tMax; s += step) xTicks.push(s);
  const yTicks: number[] = [];
  for (let T = 0; T <= T1; T += 20) yTicks.push(T);
  const exitS = cooling.tBathIn + cooling.dwellS;
  const t50 = isFinite(cooling.timeToCore50S) ? cooling.tBathIn + cooling.timeToCore50S : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {yTicks.map((T) => (
        <g key={T}>
          <line x1={m.l} x2={W - m.r} y1={y(T)} y2={y(T)} stroke="#1e293b" />
          <text x={m.l - 6} y={y(T) + 3} fontSize={9} fill="#94a3b8" textAnchor="end">{T}</text>
        </g>
      ))}
      {xTicks.map((s) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={m.t} y2={H - m.b} stroke="#1e293b" />
          <text x={x(s)} y={H - m.b + 13} fontSize={9} fill="#94a3b8" textAnchor="middle">{Math.round(s / 60)}</text>
        </g>
      ))}
      <text x={(W + m.l) / 2} y={H - 4} fontSize={10} fill="#94a3b8" textAnchor="middle">Tiempo desde inicio de prensado (min)</text>
      <text transform={`translate(11,${H / 2}) rotate(-90)`} fontSize={10} fill="#94a3b8" textAnchor="middle">Temperatura (°C)</text>

      {/* fases */}
      <rect x={x(0)} y={m.t} width={x(cooling.tPressEnd) - x(0)} height={H - m.t - m.b} fill="#f97316" opacity={0.07} />
      <rect x={x(cooling.tBathIn)} y={m.t} width={x(Math.min(exitS, tMax)) - x(cooling.tBathIn)} height={H - m.t - m.b} fill="#0ea5e9" opacity={0.09} />
      <text x={x(cooling.tPressEnd / 2)} y={m.t + 10} fontSize={9} fill="#fb923c" textAnchor="middle">prensa</text>
      <text x={(x(cooling.tBathIn) + x(Math.min(exitS, tMax))) / 2} y={m.t + 10} fontSize={9} fill="#38bdf8" textAnchor="middle">batea (permanencia programada)</text>

      {/* umbral 50 °C y agua */}
      <line x1={m.l} x2={W - m.r} y1={y(50)} y2={y(50)} stroke="#22c55e" strokeDasharray="5 4" />
      <text x={m.l + 4} y={y(50) - 3} fontSize={9} fill="#4ade80">50 °C (límite de extracción)</text>
      <line x1={x(cooling.tBathIn)} x2={W - m.r} y1={y(params.bathTempC)} y2={y(params.bathTempC)} stroke="#38bdf8" strokeDasharray="2 3" opacity={0.7} />
      <text x={W - m.r - 2} y={y(params.bathTempC) + 11} fontSize={9} fill="#7dd3fc" textAnchor="end">agua {params.bathTempC} °C</text>

      <path d={path(cooling.surface)} stroke="#f59e0b" strokeWidth={2} fill="none" />
      <path d={path(cooling.core)} stroke="#ef4444" strokeWidth={2.5} fill="none" />

      {/* marcas */}
      <line x1={x(exitS)} x2={x(exitS)} y1={m.t} y2={H - m.b} stroke="#e2e8f0" strokeDasharray="4 3" />
      <circle cx={x(exitS)} cy={y(cooling.coreAtDwell)} r={4} fill="#ef4444" stroke="#fff" />
      <text x={x(exitS) + 6} y={y(cooling.coreAtDwell) - 6} fontSize={10} fill="#fecaca" fontWeight={600}>
        salida: {cooling.coreAtDwell.toFixed(0)} °C
      </text>
      {t50 !== null && t50 <= tMax && (
        <>
          <line x1={x(t50)} x2={x(t50)} y1={y(50)} y2={H - m.b} stroke="#22c55e" strokeDasharray="2 3" />
          <circle cx={x(t50)} cy={y(50)} r={3.5} fill="#22c55e" />
          <text x={x(t50) + 5} y={H - m.b - 5} fontSize={9} fill="#4ade80">núcleo &lt; 50 °C</text>
        </>
      )}

      {/* leyenda */}
      <g transform={`translate(${m.l + 10},${m.t + 24})`}>
        <line x2={18} stroke="#ef4444" strokeWidth={2.5} /><text x={23} y={3} fontSize={10} fill="#e2e8f0">Núcleo</text>
        <line y1={14} x2={18} y2={14} stroke="#f59e0b" strokeWidth={2} /><text x={23} y={17} fontSize={10} fill="#e2e8f0">Superficie</text>
      </g>
    </svg>
  );
}
