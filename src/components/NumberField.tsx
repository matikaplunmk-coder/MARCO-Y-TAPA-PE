import { useEffect, useRef, useState } from 'react';
import type { NumField } from '../engine/paramSchema';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: NumField<any, string>;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

const fmt = (v: number, decimals: number) => (Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : '');

/** Slider (rango orientativo) + campo numérico (rango duro): permite valores fuera del slider. */
export default function NumberField({ field, value, disabled, onChange }: Props) {
  const { label, unit, min, max, step, hard, hint, int } = field;
  const decimals = field.decimals ?? (int ? 0 : step < 1 ? 1 : 0);
  const [text, setText] = useState(fmt(value, decimals + 2));
  const focused = useRef(false);
  const outOfRange = value < min || value > max;

  useEffect(() => {
    if (!focused.current) setText(fmt(value, decimals + 2));
  }, [value, decimals]);

  const clamp = (v: number) => Math.min(hard[1], Math.max(hard[0], int ? Math.round(v) : v));

  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            disabled={disabled}
            value={text}
            onFocus={() => (focused.current = true)}
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value.replace(',', '.'));
              if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= hard[0] && v <= hard[1]) onChange(int ? Math.round(v) : v);
            }}
            onBlur={() => {
              focused.current = false;
              const v = Number(text.replace(',', '.'));
              const c = text.trim() !== '' && Number.isFinite(v) ? clamp(v) : value;
              onChange(c);
              setText(fmt(c, decimals + 2));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`w-[4.6rem] rounded border bg-slate-800 px-1.5 py-0.5 text-right font-mono text-sky-300 outline-none focus:border-sky-400 ${
              outOfRange ? 'border-amber-500/70' : 'border-slate-700'
            }`}
          />
          <span className="w-[3.2rem] truncate text-[10px] text-slate-500" title={unit}>
            {unit}
          </span>
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} (slider)`}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-1.5 w-full cursor-pointer accent-sky-400"
      />
      {(hint || outOfRange) && (
        <div className="text-[10px] text-slate-500">
          {outOfRange && <span className="text-amber-400">Fuera del rango del slider · </span>}
          {hint}
        </div>
      )}
    </div>
  );
}
