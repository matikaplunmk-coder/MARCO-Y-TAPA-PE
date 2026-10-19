import { Beaker, Cog, Droplets, Factory, Gauge, ShieldAlert, Timer, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Derived, LoadClass, ProcessParams } from '../types/simulation';
import { FIELD_GROUPS, type NumField, type NumKey } from '../engine/paramSchema';
import { CLASS_LOAD_KN, PART_PRESETS } from '../engine/parts';
import NumberField from './NumberField';
import { Accordion, Readout, Segmented } from './ui';

interface Props {
  params: ProcessParams;
  onChange: (p: ProcessParams) => void;
  derived: Derived;
  /** Grupos a mostrar (por id). Si se omite, todos. */
  only?: string[];
  /** Grupos a ocultar (por id). */
  except?: string[];
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

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function ControlPanel({ params, onChange, derived, only, except }: Props) {
  const patch = (changes: Partial<ProcessParams>) => onChange({ ...params, ...changes });
  const setNum = (key: NumKey, v: number) => {
    const changes: Partial<ProcessParams> = { [key]: v };
    if (GEOMETRY_KEYS.includes(key)) changes.partId = 'custom';
    if (key === 'breakLoadKN' && params.loadClass !== 'MANUAL' && CLASS_LOAD_KN[params.loadClass] !== v) {
      changes.loadClass = 'MANUAL'; // editar la carga a mano pasa a modo manual
    }
    patch(changes);
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
      {FIELD_GROUPS.filter((g) => (!only || only.includes(g.id)) && !except?.includes(g.id)).map((g) => {
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
