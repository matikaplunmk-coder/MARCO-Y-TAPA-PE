import { Beaker, ChevronDown, Cog, Droplets, Gauge, Loader2, RotateCcw, Timer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PartId, ProcessParams } from '../types/simulation';
import { DEFAULT_PARAMS, PART_LIST, PARTS } from '../engine/parts';

interface Props {
  params: ProcessParams;
  onChange: (p: ProcessParams) => void;
  /** Tiempo (min) en batea para alcanzar la temperatura objetivo */
  requiredMin: number;
  slugKg: number;
  slugS: number;
  pressureMPa: number;
  computing: boolean;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
  hint?: string;
  decimals?: number;
}) {
  const { label, value, min, max, step = 1, unit, onChange, hint, decimals = 0 } = props;
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono text-sky-300">
          {value.toFixed(decimals)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-sky-400"
      />
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </label>
  );
}

function Section({ icon, title, children, defaultOpen = true }: { icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
      >
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}

function Readout({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex justify-between rounded bg-slate-800 px-2 py-1 text-[11px] ${warn ? 'text-amber-300' : 'text-slate-300'}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function ControlPanel({ params, onChange, requiredMin, slugKg, slugS, pressureMPa, computing }: Props) {
  const part = PARTS[params.partId];
  const set = <K extends keyof ProcessParams>(k: K, v: ProcessParams[K]) => onChange({ ...params, [k]: v });
  const setPart = (id: PartId) => onChange({ ...params, partId: id, ribThkMm: PARTS[id].defaultRibThk });
  const fixed = params.dwellMode === 'fixed';
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  return (
    <div className="space-y-3">
      {computing && (
        <div className="flex items-center gap-1 text-[10px] text-sky-300">
          <Loader2 size={12} className="animate-spin" /> recalculando…
        </div>
      )}
      <Section icon={<Cog size={14} />} title="Pieza">
        <div className="grid grid-cols-2 gap-1.5">
          {PART_LIST.map((p) => (
            <button
              key={p.id}
              onClick={() => setPart(p.id)}
              className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                p.id === params.partId
                  ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
              }`}
            >
              <div className="font-semibold">{p.name.split(' (')[0]}</div>
              <div className="text-[10px] text-slate-400">
                {p.massKg} kg · {p.loadClass}
              </div>
            </button>
          ))}
        </div>
        <Slider
          label="Espesor crítico en nervaduras"
          value={params.ribThkMm}
          min={part.ribThkRange[0]}
          max={part.ribThkRange[1]}
          unit="mm"
          onChange={(v) => set('ribThkMm', v)}
          hint="Más espesor: más rigidez, enfriamiento mucho más lento (∝ e²)"
        />
      </Section>

      <Section icon={<Beaker size={14} />} title="1 · Extrusión y formulación">
        <Slider label="Caudal del extrusor" value={params.extruderKgH} min={60} max={240} step={5} unit="kg/h" onChange={(v) => set('extruderKgH', v)} />
        <Readout label={`Llenado del acumulador (${slugKg.toFixed(1)} kg)`} value={`${mmss(slugS)} min`} />
        <Slider label="Temperatura de masa fundida (T₀)" value={params.meltTempC} min={170} max={220} unit="°C" onChange={(v) => set('meltTempC', v)} hint="Condición inicial del perfil térmico · ventana 180–200 °C" />
        <Slider label="Fibra de vidrio" value={params.glassPct} min={0} max={40} step={1} unit="%" onChange={(v) => set('glassPct', v)} hint="Ventana recomendada 20–35 %" />
        <Slider label="Negro de humo (UV)" value={params.carbonPct} min={0} max={4} step={0.1} decimals={1} unit="%" onChange={(v) => set('carbonPct', v)} hint="Objetivo 1,5–2,5 % · ISO 17855 / 7686" />
      </Section>

      <Section icon={<Gauge size={14} />} title="2 · Prensa hidráulica">
        <Slider label="Fuerza nominal de prensa" value={params.pressTon} min={400} max={1200} step={10} unit="t" onChange={(v) => set('pressTon', v)} />
        <Readout
          label={`Presión específica (${part.projectedAreaM2.toFixed(2)} m²)`}
          value={`${pressureMPa.toFixed(1)} MPa${pressureMPa < 15 ? ' ⚠ < 15' : ''}`}
          warn={pressureMPa < 15}
        />
        <Slider label="Tiempo de prensado puro" value={params.pressTimeS} min={20} max={90} unit="s" onChange={(v) => set('pressTimeS', v)} />
      </Section>

      <Section icon={<Timer size={14} />} title="3 · Tiempos operativos y grúa">
        <Slider label="Colocación de pasadores roscados" value={params.pinS} min={20} max={120} unit="s" onChange={(v) => set('pinS', v)} hint="Suma a la ocupación de la estación de prensa" />
        <Slider label="Traslado de grúa" value={params.craneMoveS} min={15} max={60} unit="s" onChange={(v) => set('craneMoveS', v)} hint="Por movimiento (2 por pieza)" />
        <Slider label="Desapriete y desmoldeo" value={params.demoldS} min={30} max={180} unit="s" onChange={(v) => set('demoldS', v)} />
        <Slider label="Estaciones de desmoldeo" value={params.demoldStations} min={1} max={4} unit="" onChange={(v) => set('demoldStations', v)} />
        <Slider label="Moldes en la flota (N)" value={params.moldCount} min={2} max={24} unit="" onChange={(v) => set('moldCount', v)} />
      </Section>

      <Section icon={<Droplets size={14} />} title="4 · Batea y control térmico">
        <Slider label="Temperatura del agua" value={params.bathTempC} min={10} max={35} unit="°C" onChange={(v) => set('bathTempC', v)} />
        <label className="block text-xs">
          <span className="text-slate-300">Capacidad del tanque</span>
          <select
            value={params.bathSlots}
            onChange={(e) => set('bathSlots', Number(e.target.value))}
            className="mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-slate-100"
          >
            {Array.from({ length: 17 }, (_, i) => i + 4).map((n) => (
              <option key={n} value={n}>
                {n} posiciones de inmersión
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="mb-1 text-xs text-slate-300">Modo de permanencia en batea</div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1 text-[11px]">
            {(
              [
                ['temperature', 'Gobernado por temperatura'],
                ['fixed', 'Tiempo fijo manual'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => set('dwellMode', mode)}
                className={`rounded-md px-1.5 py-1.5 leading-tight transition ${
                  params.dwellMode === mode ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Slider label="Temperatura objetivo del núcleo" value={params.targetCoreC} min={40} max={60} unit="°C" onChange={(v) => set('targetCoreC', v)} hint={fixed ? 'Referencia para la alerta de alabeo' : 'El molde sale al alcanzarla'} />
        {fixed ? (
          <div>
            <Slider label="Permanencia manual" value={params.bathDwellMin} min={5} max={35} unit="min" onChange={(v) => set('bathDwellMin', v)} />
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span className="text-slate-500">
                Necesaria: {isFinite(requiredMin) ? `${requiredMin.toFixed(1)} min` : 'no alcanzable'}
              </span>
              {isFinite(requiredMin) && requiredMin <= 35 && (
                <button
                  className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-200 hover:bg-slate-600"
                  onClick={() => set('bathDwellMin', Math.min(35, Math.max(5, Math.ceil(requiredMin))))}
                >
                  Ajustar
                </button>
              )}
            </div>
          </div>
        ) : (
          <Readout label="Permanencia resultante" value={isFinite(requiredMin) ? `${requiredMin.toFixed(1)} min` : 'no alcanzable'} warn={!isFinite(requiredMin)} />
        )}
      </Section>

      <button
        onClick={() => onChange(DEFAULT_PARAMS)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 py-2 text-xs text-slate-200 hover:bg-slate-700"
      >
        <RotateCcw size={14} /> Restablecer valores por defecto
      </button>
    </div>
  );
}
