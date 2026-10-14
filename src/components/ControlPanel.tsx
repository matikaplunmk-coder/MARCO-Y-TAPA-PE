import { Beaker, Cog, Droplets, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PartId, ProcessParams } from '../types/simulation';
import { DEFAULT_PARAMS, PART_LIST, PARTS } from '../engine/parts';

interface Props {
  params: ProcessParams;
  onChange: (p: ProcessParams) => void;
  requiredMin: number;
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

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function ControlPanel({ params, onChange, requiredMin }: Props) {
  const part = PARTS[params.partId];
  const set = <K extends keyof ProcessParams>(k: K, v: ProcessParams[K]) => onChange({ ...params, [k]: v });
  const setPart = (id: PartId) =>
    onChange({ ...params, partId: id, ribThkMm: PARTS[id].defaultRibThk });

  return (
    <div className="space-y-3">
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

      <Section icon={<Beaker size={14} />} title="Formulación">
        <Slider label="Fibra de vidrio" value={params.glassPct} min={0} max={40} step={1} unit="%" onChange={(v) => set('glassPct', v)} hint="Ventana recomendada 20–35 %" />
        <Slider label="Negro de humo (UV)" value={params.carbonPct} min={0} max={4} step={0.1} decimals={1} unit="%" onChange={(v) => set('carbonPct', v)} hint="Objetivo 1,5–2,5 % · ISO 17855 / 7686" />
        <Slider label="Temperatura masa fundida" value={params.meltTempC} min={170} max={220} unit="°C" onChange={(v) => set('meltTempC', v)} hint="Ventana 180–200 °C" />
      </Section>

      <Section icon={<Cog size={14} />} title="Prensa y extrusor">
        <Slider label="Tonelaje de prensa" value={params.pressTon} min={400} max={1200} step={10} unit="t" onChange={(v) => set('pressTon', v)} hint="Rango típico 600–1000 t" />
        <Slider label="Tiempo de ciclo en prensa" value={params.pressTimeS} min={60} max={150} unit="s" onChange={(v) => set('pressTimeS', v)} hint="Incluye enroscado de pasadores · 90–120 s" />
        <Slider label="Caudal del extrusor" value={params.extruderKgH} min={600} max={2400} step={50} unit="kg/h" onChange={(v) => set('extruderKgH', v)} />
      </Section>

      <Section icon={<Droplets size={14} />} title="Flota, batea y manipulación">
        <Slider label="Moldes en la flota (N)" value={params.moldCount} min={2} max={16} unit="" onChange={(v) => set('moldCount', v)} />
        <Slider label="Posiciones en batea" value={params.bathSlots} min={2} max={16} unit="" onChange={(v) => set('bathSlots', v)} />
        <Slider label="Temperatura del agua" value={params.bathTempC} min={15} max={30} unit="°C" onChange={(v) => set('bathTempC', v)} />
        <div>
          <Slider
            label="Permanencia en batea"
            value={params.bathDwellMin}
            min={5}
            max={45}
            unit="min"
            onChange={(v) => set('bathDwellMin', v)}
          />
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Necesaria (núcleo &lt; 50 °C): {isFinite(requiredMin) ? requiredMin.toFixed(1) : '—'} min</span>
            {isFinite(requiredMin) && (
              <button
                className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-200 hover:bg-slate-600"
                onClick={() => set('bathDwellMin', Math.min(45, Math.max(5, Math.ceil(requiredMin + 1))))}
              >
                Ajustar
              </button>
            )}
          </div>
        </div>
        <Slider label="Traslado de grúa" value={params.craneMoveS} min={30} max={120} unit="s" onChange={(v) => set('craneMoveS', v)} hint="Por movimiento (2 por pieza)" />
        <Slider label="Desmoldeo por molde" value={params.demoldS} min={120} max={600} step={10} unit="s" onChange={(v) => set('demoldS', v)} />
        <Slider label="Estaciones de desmoldeo" value={params.demoldStations} min={1} max={4} unit="" onChange={(v) => set('demoldStations', v)} />
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
