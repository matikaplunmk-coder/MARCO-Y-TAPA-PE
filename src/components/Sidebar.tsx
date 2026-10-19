import { Download, Loader2, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AppParams } from '../types/intrusion';
import type { Analysis } from '../types/simulation';
import type { IntrusionAnalysis } from '../types/intrusion';
import { DEFAULT_APP, exportAppPreset, importAppPreset } from '../engine/appPresets';
import ControlPanel from './ControlPanel';
import ControlPanelB, { ControlPanelCosts } from './ControlPanelB';
import { Accordion, Segmented } from './ui';

export type Panel = 'part' | 'a' | 'b' | 'costs';

interface Props {
  app: AppParams;
  onChange: (p: AppParams) => void;
  panel: Panel;
  onPanel: (p: Panel) => void;
  ra: Analysis;
  rb: IntrusionAnalysis;
  computing: boolean;
}

export default function Sidebar({ app, onChange, panel, onPanel, ra, rb, computing }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doExport = () => {
    const blob = new Blob([exportAppPreset(app)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preset-planta-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: 'Preset exportado (Método A + Método B + costos).' });
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const res = importAppPreset(await file.text());
      onChange(res.params);
      const extra = [
        res.version === 1 ? 'formato v1: solo Método A' : '',
        res.clamped ? `${res.clamped} ajustados a su rango` : '',
        res.ignored ? `${res.ignored} ignorados` : '',
        res.missing > 0 ? `${res.missing} no incluidos (valor de fábrica)` : '',
      ].filter(Boolean);
      setMsg({ ok: true, text: `Preset cargado: ${res.applied} valores${extra.length ? ' · ' + extra.join(' · ') : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo cargar el preset.' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const btn = 'flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 py-2 text-xs text-slate-200 hover:bg-slate-700';

  return (
    <div className="space-y-3">
      <Accordion title="Acciones rápidas" defaultOpen>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => {
              onChange(DEFAULT_APP);
              setMsg({ ok: true, text: 'Valores de fábrica restablecidos (A, B y costos).' });
            }}
            className={btn}
          >
            <RotateCcw size={14} /> Restablecer valores por defecto de fábrica
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={doExport} className={btn}>
              <Download size={14} /> Exportar preset JSON
            </button>
            <button onClick={() => fileRef.current?.click()} className={btn}>
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

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Panel de parámetros</div>
        <Segmented
          value={panel}
          onChange={onPanel}
          options={[
            ['part', 'Pieza'],
            ['a', 'Método A'],
            ['b', 'Método B'],
            ['costs', 'Costos'],
          ]}
        />
      </div>

      {panel === 'part' && (
        <ControlPanel params={app.a} onChange={(a) => onChange({ ...app, a })} derived={ra.derived} only={['geometry']} />
      )}
      {panel === 'a' && (
        <ControlPanel params={app.a} onChange={(a) => onChange({ ...app, a })} derived={ra.derived} except={['geometry']} />
      )}
      {panel === 'b' && <ControlPanelB b={app.b} onChange={(b) => onChange({ ...app, b })} r={rb} />}
      {panel === 'costs' && <ControlPanelCosts c={app.c} onChange={(c) => onChange({ ...app, c })} />}
    </div>
  );
}
