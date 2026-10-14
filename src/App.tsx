import { useDeferredValue, useMemo, useState } from 'react';
import { Factory } from 'lucide-react';
import ControlPanel from './components/ControlPanel';
import MetricsPanel from './components/MetricsPanel';
import PlantCanvas from './components/PlantCanvas';
import { analyze } from './engine/analysis';
import { DEFAULT_PARAMS } from './engine/parts';
import type { ProcessParams } from './types/simulation';

export default function App() {
  const [params, setParams] = useState<ProcessParams>(DEFAULT_PARAMS);
  // El motor trabaja con una copia diferida: los sliders responden al instante y la animación no se congela
  const deferred = useDeferredValue(params);
  const analysis = useMemo(() => analyze(deferred), [deferred]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-5 py-3">
        <Factory className="text-sky-400" />
        <div>
          <h1 className="text-base font-bold leading-tight">Planta de marcos y tapas de registro · PEAD + fibra de vidrio</h1>
          <p className="text-[11px] text-slate-400">
            Moldeo por compresión con cierre mecánico desacoplado · enfriamiento en batea · UNE-EN 124 (D400 / C250)
          </p>
        </div>
      </header>
      <main className="grid gap-4 p-4 lg:grid-cols-[320px_1fr]">
        <aside className="lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:pr-1">
          <ControlPanel
            params={params}
            onChange={setParams}
            requiredMin={analysis.cooling.timeToTargetS / 60}
            slugKg={analysis.process.slugKg}
            slugS={analysis.times.slugS}
            pressureMPa={analysis.process.pressureMPa}
            computing={deferred !== params}
          />
        </aside>
        <div className="min-w-0 space-y-4">
          <PlantCanvas analysis={analysis} params={deferred} />
          <MetricsPanel analysis={analysis} params={deferred} />
        </div>
      </main>
    </div>
  );
}
