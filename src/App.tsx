import { useDeferredValue, useMemo, useState } from 'react';
import { Factory, GitCompare, Hammer, Layers } from 'lucide-react';
import type { AppParams } from './types/intrusion';
import ComparePanel from './components/ComparePanel';
import MetricsPanel from './components/MetricsPanel';
import MetricsPanelB from './components/MetricsPanelB';
import PlantCanvas from './components/PlantCanvas';
import PlantCanvasB from './components/PlantCanvasB';
import Sidebar, { type Panel } from './components/Sidebar';
import { analyze } from './engine/analysis';
import { DEFAULT_APP } from './engine/appPresets';
import { computeEconomics } from './engine/economics';
import { analyzeB } from './engine/intrusionEngine';

type Tab = 'A' | 'B' | 'COMPARE';

const TABS: { id: Tab; label: string; short: string; icon: typeof Factory }[] = [
  { id: 'A', label: 'Método A: Compresión Desacoplada', short: 'Método A', icon: Factory },
  { id: 'B', label: 'Método B: Intrusión en T', short: 'Método B', icon: Hammer },
  { id: 'COMPARE', label: 'Comparativa A vs B (Directa)', short: 'A vs B', icon: GitCompare },
];

export default function App() {
  const [app, setApp] = useState<AppParams>(DEFAULT_APP);
  const [tab, setTab] = useState<Tab>('A');
  const [panel, setPanel] = useState<Panel>('a');

  // El motor trabaja con una copia diferida: los controles responden al instante y la animación no se congela
  const deferred = useDeferredValue(app);
  const ra = useMemo(() => analyze(deferred.a), [deferred.a]);
  const rb = useMemo(() => analyzeB(deferred.a, deferred.b), [deferred.a, deferred.b]);
  const econ = useMemo(() => computeEconomics(deferred.a, deferred.b, deferred.c, ra, rb), [deferred, ra, rb]);

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t === 'A') setPanel('a');
    if (t === 'B') setPanel('b');
  };

  const sync = (dir: 'AtoB' | 'BtoA') =>
    setApp((p) =>
      dir === 'BtoA'
        ? { ...p, b: { ...p.b, extruderKgH: p.a.extruderKgH, glassPct: p.a.glassPct, carbonPct: p.a.carbonPct, meltTempC: p.a.meltTempC, bathTempC: p.a.bathTempC } }
        : { ...p, a: { ...p.a, extruderKgH: p.b.extruderKgH, glassPct: p.b.glassPct, carbonPct: p.b.carbonPct, meltTempC: p.b.meltTempC, bathTempC: p.b.bathTempC } },
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-5 pt-3">
        <div className="flex items-center gap-3">
          <Layers className="text-sky-400" />
          <div>
            <h1 className="text-base font-bold leading-tight">Planta de marcos y tapas de registro · PEAD + fibra de vidrio</h1>
            <p className="text-[11px] text-slate-400">Compresión desacoplada vs. intrusión directa con manifold en «T» · UNE-EN 124 (D400 / C250) · modo sandbox total</p>
          </div>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Vistas">
          {TABS.map(({ id, label, short, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => selectTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-xs font-semibold transition ${
                tab === id ? 'border-slate-600 bg-slate-950 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="grid gap-4 p-4 lg:grid-cols-[340px_1fr]">
        <aside className="lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:pr-1">
          <Sidebar app={app} onChange={setApp} panel={panel} onPanel={setPanel} ra={ra} rb={rb} computing={deferred !== app} />
        </aside>
        <div className="min-w-0 space-y-4">
          {tab === 'A' && (
            <>
              <PlantCanvas analysis={ra} params={deferred.a} />
              <MetricsPanel analysis={ra} params={deferred.a} />
            </>
          )}
          {tab === 'B' && (
            <>
              <PlantCanvasB r={rb} b={deferred.b} />
              <MetricsPanelB r={rb} b={deferred.b} a={deferred.a} />
            </>
          )}
          {tab === 'COMPARE' && <ComparePanel app={deferred} ra={ra} rb={rb} econ={econ} onSync={sync} />}
        </div>
      </main>
    </div>
  );
}
