interface GaugeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  decimals?: number;
  /** Zonas de color: valores límite ascendentes con su color. El valor toma el color de la primera zona cuyo `upTo` lo contiene. */
  zones: { upTo: number; color: string }[];
  note?: string;
}

/** Tacómetro semicircular SVG */
export default function Gauge({ label, value, min, max, unit, decimals = 0, zones, note }: GaugeProps) {
  const cx = 80;
  const cy = 78;
  const r = 60;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const ang = (v: number) => Math.PI * (1 - (clamp(v) - min) / (max - min));
  const pt = (v: number, rr = r) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
  const arc = (v0: number, v1: number) => {
    const [x0, y0] = pt(v0);
    const [x1, y1] = pt(v1);
    return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  let prev = min;
  const zoneArcs = zones.map((z) => {
    const d = arc(prev, Math.min(z.upTo, max));
    const el = <path key={z.upTo} d={d} stroke={z.color} strokeWidth={10} fill="none" opacity={0.85} />;
    prev = Math.min(z.upTo, max);
    return el;
  });
  const color = (zones.find((z) => value <= z.upTo) ?? zones[zones.length - 1]).color;
  const [nx, ny] = pt(value, r - 8);
  return (
    <div className="flex flex-col items-center rounded-lg bg-slate-800/70 p-2">
      <svg viewBox="0 0 160 100" className="w-full max-w-[190px]">
        <path d={arc(min, max)} stroke="#1e293b" strokeWidth={12} fill="none" />
        {zoneArcs}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#f8fafc" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="#f8fafc" />
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={17} fontWeight={700} fill={color} fontFamily="monospace">
          {value.toFixed(decimals)}
          <tspan fontSize={9} fill="#94a3b8"> {unit}</tspan>
        </text>
        <text x={cx - r - 4} y={cy + 12} fontSize={8} fill="#64748b" textAnchor="middle">{min}</text>
        <text x={cx + r + 4} y={cy + 12} fontSize={8} fill="#64748b" textAnchor="middle">{max}</text>
      </svg>
      <div className="text-center text-xs font-medium text-slate-300">{label}</div>
      {note && <div className="text-center text-[10px] text-slate-500">{note}</div>}
    </div>
  );
}
