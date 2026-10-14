import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { Alert, Analysis, BottleneckId, ProcessParams } from '../types/simulation';
import { fmtMinSec } from '../engine/format';
import CoolingChart from './CoolingChart';
import Gauge from './Gauge';

interface Props {
  analysis: Analysis;
  params: ProcessParams;
}

const SEV_STYLE: Record<Alert['severity'], { cls: string; icon: JSX.Element }> = {
  critical: { cls: 'border-red-500/60 bg-red-950/50 text-red-100', icon: <OctagonAlert size={16} className="mt-0.5 shrink-0 text-red-400" /> },
  warn: { cls: 'border-amber-500/60 bg-amber-950/40 text-amber-100', icon: <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" /> },
  info: { cls: 'border-sky-500/40 bg-sky-950/40 text-sky-100', icon: <Info size={16} className="mt-0.5 shrink-0 text-sky-400" /> },
  ok: { cls: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-100', icon: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> },
};

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-700 bg-slate-900 p-3 ${className}`}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

function Bar({ label, value, color, extra }: { label: string; value: number; color: string; extra?: string }) {
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

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex justify-between border-b border-slate-800 py-1 text-xs">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono ${ok === undefined ? 'text-slate-100' : ok ? 'text-emerald-400' : 'text-red-400'}`}>{v}</span>
    </div>
  );
}

export default function MetricsPanel({ analysis: a, params }: Props) {
  const { des, mech, process, cooling, bottleneck, oee } = a;
  const caps = bottleneck.capacities;
  const capEntries = (Object.keys(caps) as BottleneckId[]).sort((x, y) => caps[x] - caps[y]);
  const maxCap = Math.max(...capEntries.map((k) => caps[k]));
  const bnShort = bottleneck.id === 'Prensa' ? 'Prensa' : bottleneck.id === 'Batea' || bottleneck.id === 'Flota de moldes' ? 'Batea' : bottleneck.id;
  const bnColor = bnShort === 'Prensa' ? 'text-orange-400' : bnShort === 'Batea' ? 'text-sky-400' : 'text-amber-400';

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Gauge
          label="Piezas por hora"
          value={des.piecesPerHour}
          min={0}
          max={Math.max(30, Math.ceil(caps.Prensa / 5) * 5)}
          unit="pz/h"
          decimals={1}
          zones={[{ upTo: caps.Prensa * 0.5, color: '#ef4444' }, { upTo: caps.Prensa * 0.8, color: '#f59e0b' }, { upTo: 1e9, color: '#22c55e' }]}
          note={`Takt ${isFinite(des.taktS) ? fmtMinSec(des.taktS) : '—'} min · ${a.piecesPerShift.toFixed(0)} pz/turno 8 h`}
        />
        <Gauge
          label="Utilización de prensa"
          value={des.util.press * 100}
          min={0}
          max={100}
          unit="%"
          zones={[{ upTo: 50, color: '#ef4444' }, { upTo: 75, color: '#f59e0b' }, { upTo: 100, color: '#22c55e' }]}
          note={`OEE ${(oee.oee * 100).toFixed(0)} % (D ${(oee.availability * 100).toFixed(0)} · R ${(oee.performance * 100).toFixed(0)} · C ${(oee.quality * 100).toFixed(0)})`}
        />
        <Gauge
          label="Deformación permanente EN 124"
          value={mech.permanentDeflMm}
          min={0}
          max={4}
          unit="mm"
          decimals={2}
          zones={[{ upTo: 1.4, color: '#22c55e' }, { upTo: 2.0, color: '#f59e0b' }, { upTo: 4, color: '#ef4444' }]}
          note={`Límite ≤ 2,0 mm tras ${((2 / 3) * a.part.breakLoadKN).toFixed(1)} kN`}
        />
        <div className="flex flex-col justify-center rounded-lg bg-slate-800/70 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Cuello de botella detectado</div>
          <div className={`text-2xl font-bold ${bnColor}`}>{bnShort}</div>
          <div className="text-xs text-slate-400">{bottleneck.id !== bnShort ? bottleneck.id : `${caps[bottleneck.id].toFixed(1)} pz/h máx.`}</div>
          <div className="mt-1 text-[10px] leading-snug text-slate-400">{bottleneck.explanation}</div>
        </div>
      </div>

      {/* Curva + capacidades */}
      <div className="grid gap-3 xl:grid-cols-5">
        <Card title="Curva de enfriamiento · nervadura crítica" className="xl:col-span-3">
          <CoolingChart cooling={cooling} params={params} />
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
            <span>Núcleo &lt; 50 °C en <b className="text-emerald-400">{isFinite(cooling.timeToCore50S) ? `${(cooling.timeToCore50S / 60).toFixed(1)} min` : '—'}</b></span>
            <span>Salida programada: núcleo <b>{cooling.coreAtDwell.toFixed(0)} °C</b> / piel <b>{cooling.surfaceAtDwell.toFixed(0)} °C</b></span>
          </div>
        </Card>
        <Card title="Capacidad por estación (teórica, pz/h)" className="xl:col-span-2">
          <div className="space-y-2">
            {capEntries.map((k) => (
              <Bar
                key={k}
                label={k + (k === bottleneck.id ? '  ◄ límite' : '')}
                value={caps[k] / maxCap}
                color={k === bottleneck.id ? '#f97316' : '#38bdf8'}
                extra={`${caps[k].toFixed(1)} pz/h`}
              />
            ))}
          </div>
          <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase text-slate-500">Utilización simulada (DES)</h4>
          <div className="space-y-2">
            <Bar label="Prensa (trabajando)" value={des.util.press} color="#f97316" />
            <Bar label="Prensa retenida esperando grúa" value={des.util.pressBlocked} color="#ef4444" />
            <Bar label="Prensa vacía (sin molde/masa)" value={des.util.pressStarved} color="#64748b" />
            <Bar label="Batea (posiciones ocupadas)" value={des.util.bath} color="#38bdf8" />
            <Bar label="Grúa" value={des.util.crane} color="#eab308" />
            <Bar label="Desmoldeo" value={des.util.demold} color="#a78bfa" />
            <Bar label="Extrusor" value={des.util.extruder} color="#fb923c" />
          </div>
        </Card>
      </div>

      {/* Calidad */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card title={`UNE-EN 124 · ${a.part.loadClass}`}>
          <Row k="Fracción vol. fibra" v={`${(mech.glassVolFrac * 100).toFixed(1)} %`} />
          <Row k="Módulo elástico E" v={`${(mech.modulusMPa / 1000).toFixed(2)} GPa`} />
          <Row k="Resistencia última" v={`${mech.tensileStrengthMPa.toFixed(0)} MPa`} />
          <Row k="Límite de fluencia" v={`${mech.yieldStrengthMPa.toFixed(0)} MPa`} />
          <Row k="Espesor equivalente flexión" v={`${mech.equivThicknessMm.toFixed(0)} mm`} />
          <Row k="Flecha elástica (2/3 F)" v={`${mech.elasticDeflMm.toFixed(2)} mm`} />
          <Row k="Deformación permanente" v={`${mech.permanentDeflMm.toFixed(2)} mm ${mech.passDeflection ? '✓' : '✗'}`} ok={mech.passDeflection} />
          <Row k="Carga de rotura estimada" v={`${mech.failureLoadKN.toFixed(0)} / ${a.part.breakLoadKN} kN ${mech.passBreak ? '✓' : '✗'}`} ok={mech.passBreak} />
          <Row k="Coef. de seguridad" v={mech.safetyFactor.toFixed(2)} ok={mech.safetyFactor >= 1.15} />
        </Card>
        <Card title="Proceso y calidad">
          <Row k="Tonelaje requerido" v={`${process.requiredTon.toFixed(0)} t`} />
          <Row k="Relación de llenado" v={`${(process.fillRatio * 100).toFixed(0)} %`} ok={process.fillRatio >= 1} />
          <Row k="Contracción de moldeo" v={`${process.shrinkagePct.toFixed(2)} %`} />
          <Row k="Alabeo previsto" v={`${process.warpMmPerM.toFixed(2)} mm/m`} ok={process.warpMmPerM <= 2} />
          <Row k="Riesgo de rechupes" v={`${(process.sinkRisk * 100).toFixed(0)} %`} ok={process.sinkRisk <= 0.3} />
          <Row k="Índice UV (negro de humo)" v={`${(process.uvIndex * 100).toFixed(0)} %`} ok={process.uvIndex >= 0.75} />
          <Row k="Rendimiento de calidad" v={`${(process.qualityYield * 100).toFixed(1)} %`} ok={process.qualityYield >= 0.9} />
          <Row k="Piezas buenas / turno (8 h)" v={`${a.goodPiecesPerShift.toFixed(0)}`} />
        </Card>
        <Card title="Tiempos de ciclo">
          <Row k="Carga (mesa lanzadera)" v={`${a.times.loadS} s`} />
          <Row k="Prensado + enroscado" v={`${a.times.pressS} s`} />
          <Row k="Apertura y salida" v={`${a.times.openS} s`} />
          <Row k="Grúa (×2)" v={`${a.times.craneS * 2} s`} />
          <Row k="Batea" v={`${(a.times.coolS / 60).toFixed(0)} min`} />
          <Row k="Desmoldeo" v={`${a.times.demoldS} s`} />
          <Row k="Masa del extrusor" v={`${a.times.slugS.toFixed(0)} s`} />
          <Row k="Ciclo completo del molde" v={`${((a.times.loadS + a.times.pressS + a.times.openS + 2 * a.times.craneS + a.times.coolS + a.times.demoldS + a.times.returnS) / 60).toFixed(1)} min`} />
        </Card>
      </div>

      {/* Alertas */}
      <Card title={`Diagnóstico y alertas (${a.alerts.filter((x) => x.severity === 'critical' || x.severity === 'warn').length})`}>
        <ul className="grid gap-2 md:grid-cols-2">
          {a.alerts.map((al) => (
            <li key={al.id + al.title} className={`flex gap-2 rounded-lg border p-2 text-xs ${SEV_STYLE[al.severity].cls}`}>
              {SEV_STYLE[al.severity].icon}
              <div>
                <div className="font-semibold">{al.title}</div>
                <div className="opacity-80">{al.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
