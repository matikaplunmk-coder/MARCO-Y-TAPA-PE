import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Alert } from '../types/simulation';

export const SEV_STYLE: Record<Alert['severity'], { cls: string; icon: JSX.Element }> = {
  critical: { cls: 'border-red-500/60 bg-red-950/50 text-red-100', icon: <OctagonAlert size={16} className="mt-0.5 shrink-0 text-red-400" /> },
  warn: { cls: 'border-amber-500/60 bg-amber-950/40 text-amber-100', icon: <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" /> },
  info: { cls: 'border-sky-500/40 bg-sky-950/40 text-sky-100', icon: <Info size={16} className="mt-0.5 shrink-0 text-sky-400" /> },
  ok: { cls: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-100', icon: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> },
};

export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-700 bg-slate-900 p-3 ${className}`}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

export function Bar({ label, value, color, extra }: { label: string; value: number; color: string; extra?: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-300">
        <span>{label}</span>
        <span className="font-mono">{(value * 100).toFixed(0)} %{extra ? ` · ${extra}` : ''}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex justify-between border-b border-slate-800 py-1 text-xs">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono ${ok === undefined ? 'text-slate-100' : ok ? 'text-emerald-400' : 'text-red-400'}`}>{v}</span>
    </div>
  );
}

