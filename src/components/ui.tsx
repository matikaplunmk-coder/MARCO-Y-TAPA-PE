import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export function Accordion({
  icon,
  title,
  badge,
  defaultOpen = false,
  nested = false,
  children,
}: {
  icon?: ReactNode;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  nested?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={nested ? 'rounded-lg border border-slate-800 bg-slate-950/40' : 'rounded-xl border border-slate-700 bg-slate-900'}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 px-3 text-left font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 ${
          nested ? 'py-1.5 text-[10px]' : 'py-2.5 text-xs'
        }`}
      >
        {icon}
        <span className="flex-1">{title}</span>
        {badge && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-normal normal-case text-slate-400">{badge}</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Readout({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 rounded bg-slate-800 px-2 py-1 text-[11px] ${warn ? 'text-amber-300' : 'text-slate-300'}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-lg bg-slate-800 p-1 text-[11px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-1.5 py-1.5 leading-tight transition ${value === v ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

