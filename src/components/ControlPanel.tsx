import {
  Beaker,
  ChevronDown,
  Cog,
  Download,
  Droplets,
  Factory,
  Gauge,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Timer,
  Upload,
  Zap,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { Derived, LoadClass, ProcessParams } from '../types/simulation';
import { FIELD_GROUPS, type NumField, type NumKey } from '../engine/paramSchema';
import { CLASS_LOAD_KN, DEFAULT_PARAMS, PART_PRESETS } from '../engine/parts';
import { exportPreset, importPreset } from '../engine/presets';
import NumberField from './NumberField';

interface Props {
  params: ProcessParams;
  onChange: (p: ProcessParams) => void;
  derived: Derived;
  computing: boolean;
}

const GROUP_ICON: Record<string, ReactNode> = {
  geometry: <Cog size={14} />,
  material: <Beaker size={14} />,
  extruder: <Zap size={14} />,
  press: <Gauge size={14} />,
  kinematics: <Timer size={14} />,
  bath: <Droplets size={14} />,
  plant: <Factory size={14} />,
  thresholds: <ShieldAlert size={14} />,
};

const GEOMETRY_KEYS: NumKey[] = ['massKg', 'projectedAreaM2', 'voidPct', 'ribThkMm', 'breakLoadKN', 'openingMm', 'plateThkMm', 'ribHeightMm', 'ribSpacingMm'];
const DEFAULT_OPEN = new Set(['geometry', 'material', 'extruder', 'press', 'kinematics', 'bath']);

function Accordion({
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

function Readout({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 rounded bg-slate-800 px-2 py-1 text-[11px] ${warn ? 'text-amber-300' : 'text-slate-300'}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Segmented<T extends string>({
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

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function ControlPanel({ params, onChange, derived, computing }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const patch = (changes: Partial<ProcessParams>) => onChange({ ...params, ...changes });
  const setNum = (key: NumKey, v: number) => {
    const changes: Partial<ProcessParams> = { [key]: v };
    if (GEOMETRY_KEYS.includes(key)) changes.partId = 'custom';
    if (key === 'breakLoadKN' && params.loadClass !== 'MANUAL' && CLASS_LOAD_KN[params.loadClass] !== v) {
      changes.loadClass = 'MANUAL'; // editar la carga a mano pasa a modo manual
    }
    patch(changes);
  };

  const doExport = () => {
    const blob = new Blob([exportPreset(params)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preset-planta-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: 'Preset exportado.' });
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const res = importPreset(await file.text());
      onChange(res.params);
      const extra = [
        res.clamped.length ? `${res.clamped.length} ajustados a su rango` : '',
        res.ignored.length ? `${res.ignored.length} ignorados` : '',
        res.missing > 0 ? `${res.missing} no incluidos (valor de fábrica)` : '',
      ].filter(Boolean);
      setMsg({ ok: true, text: `Preset cargado: ${res.applied} valores${extra.length ? ' · ' + extra.join(' · ') : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo cargar el preset.' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const renderField = (f: NumField) => {
    if (f.visible && !f.visible(params)) return null;
    return (
      <NumberField
        key={f.key}
        field={f}
        value={params[f.key]}
        disabled={f.disabled?.(params)}
        onChange={(v) => setNum(f.key, v)}
      />
    );
  };

  const extras = (id: string): ReactNode => {
    switch (id) {
      case 'geometry':
        return (
          <>
            <div>
              <div className="mb-1 text-xs text-slate-300">
                Preset de pieza{' '}
                {params.partId === 'custom' && <span className="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-300">personalizada</span>}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PART_PRESETS.map((pr) => (
                  <button
                    key={pr.id}
                    onClick={() => patch({ ...pr.values, partId: pr.id })}
                    className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                      pr.id === params.partId ? 'border-sky-400 bg-sky-500/20 text-sky-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="font-semibold">{pr.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {pr.values.massKg} kg · {pr.values.loadClass}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-xs">
              <span className="text-slate-300">Clase normativa objetivo (UNE-EN 124)</span>
              <select
                value={params.loadClass}
                onChange={(e) => {
                  const c = e.target.value as LoadClass;
                  patch(c === 'MANUAL' ? { loadClass: c } : { loadClass: c, breakLoadKN: CLASS_LOAD_KN[c] });
                }}
                className="mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-slate-100"
              >
                <option value="D400">D400 · 400 kN</option>
                <option value="C250">C250 · 250 kN</option>
                <option value="B125">B125 · 125 kN</option>
                <option value="MANUAL">Manual · carga de prueba libre (kN)</option>
              </select>
            </label>
            <Readout label="Área efectiva de prensado" value={`${derived.effAreaM2.toFixed(3)} m²`} />
          </>
        );
      case 'material':
        return (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={params.kAuto} onChange={(e) => patch({ kAuto: e.target.checked })} className="accent-sky-400" />
              Conductividad del composite automática (Maxwell según % de fibra)
            </label>
            <Readout label={params.kAuto ? 'k calculada' : 'k manual'} value={`${derived.kValue.toFixed(3)} W/m·K`} />
            <Readout label="Módulo del composite (Halpin-Tsai)" value={`${derived.modulusGPa.toFixed(2)} GPa`} />
          </>
        );
      case 'extruder':
        return (
          <Readout label={`Llenado del acumulador (${derived.slugKg.toFixed(1)} kg)`} value={`${mmss(derived.slugS)} min`} />
        );
      case 'press':
        return (
          <Readout
            label="Presión específica sobre área efectiva"
            value={`${derived.pressureMPa.toFixed(1)} MPa${derived.pressureMPa < params.minPressureMPa ? ` ⚠ < ${params.minPressureMPa}` : ''}`}
            warn={derived.pressureMPa < params.minPressureMPa}
          />
        );
      case 'bath':
        return (
          <>
            <div>
              <div className="mb-1 text-xs text-slate-300">Modo de salida de la batea</div>
              <Segmented
                value={params.dwellMode}
                onChange={(v) => patch({ dwellMode: v })}
                options={[
                  ['fixed', 'Tiempo fijo manual (min)'],
                  ['temperature', 'Temperatura objetivo de núcleo (°C)'],
                ]}
              />
            </div>
            <Readout
              label={params.dwellMode === 'temperature' ? 'Permanencia resultante' : `Necesaria para ≤ ${params.targetCoreC} °C`}
              value={isFinite(derived.requiredMin) ? `${derived.requiredMin.toFixed(1)} min` : 'no alcanzable'}
              warn={!isFinite(derived.requiredMin)}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <Accordion icon={<SlidersHorizontal size={14} />} title="Acciones rápidas" defaultOpen>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => {
              onChange(DEFAULT_PARAMS);
              setMsg({ ok: true, text: 'Valores de fábrica restablecidos.' });
            }}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 py-2 text-xs text-slate-200 hover:bg-slate-700"
          >
            <RotateCcw size={14} /> Restablecer valores por defecto de fábrica
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={doExport} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 py-2 text-xs text-slate-200 hover:bg-slate-700">
              <Download size={14} /> Exportar preset JSON
            </button>
            <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 py-2 text-xs text-slate-200 hover:bg-slate-700">
              <Upload size={14} /> Cargar preset JSON
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
          {msg && (
            <div role="status" className={`rounded px-2 py-1 text-[11px] ${msg.ok ? 'bg-emerald-950/60 text-emerald-300' : 'bg-red-950/60 text-red-300'}`}>
              {msg.text}
            </div>
          )}
          {computing && (
            <div className="flex items-center gap-1 text-[10px] text-sky-300">
              <Loader2 size={12} className="animate-spin" /> recalculando…
            </div>
          )}
        </div>
      </Accordion>

      {FIELD_GROUPS.map((g) => {
        const main = g.fields.filter((f) => !f.advanced);
        const adv = g.fields.filter((f) => f.advanced);
        const body = (
          <>
            {extras(g.id)}
            {main.map(renderField)}
            {adv.length > 0 && main.length > 0 && (
              <Accordion nested title="Avanzado / calibración" badge={`${adv.length}`}>
                {adv.map(renderField)}
              </Accordion>
            )}
            {main.length === 0 && adv.map(renderField)}
          </>
        );
        return (
          <Accordion key={g.id} icon={GROUP_ICON[g.id]} title={g.title} badge={`${g.fields.length}`} defaultOpen={DEFAULT_OPEN.has(g.id)}>
            {body}
          </Accordion>
        );
      })}
    </div>
  );
}
