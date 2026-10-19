import type { IntrusionAnalysis, IntrusionParams } from '../types/intrusion';
import type { ProcessParams } from '../types/simulation';
import { classLabel, getPart } from '../engine/parts';
import { fmtMinSec } from '../engine/format';
import CoolingChart from './CoolingChart';
import Gauge from './Gauge';
import { Bar, Card, Row, SEV_STYLE } from './panelParts';

interface Props {
  r: IntrusionAnalysis;
  b: IntrusionParams;
  a: ProcessParams;
}

export default function MetricsPanelB({ r, b, a }: Props) {
  const { des, rheo, mech, cooling, bottleneck, oee, mass } = r;
  const caps = r.capacities;
  const capEntries = Object.keys(caps).sort((x, y) => caps[x] - caps[y]);
  const maxCap = Math.max(...capEntries.map((k) => caps[k]));
  const part = getPart(a);
  const f = (x: number, d = 1) => x.toFixed(d);
  const pMax = b.pMaxBar;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Gauge
          label="Piezas por hora"
          value={des.piecesPerHour}
          min={0}
          max={Math.max(30, Math.ceil(caps.Extrusor / 5) * 5)}
          unit="pz/h"
          decimals={1}
          zones={[{ upTo: caps.Extrusor * 0.4, color: '#ef4444' }, { upTo: caps.Extrusor * 0.8, color: '#f59e0b' }, { upTo: 1e9, color: '#22c55e' }]}
          note={`Takt ${isFinite(des.taktS) ? fmtMinSec(des.taktS) : '—'} min · ${f(r.piecesPerShift, 0)} pz/turno ${a.shiftH} h`}
        />
        <Gauge
          label="Utilización efectiva del extrusor"
          value={des.util.extruder * 100}
          min={0}
          max={100}
          unit="%"
          zones={[{ upTo: 40, color: '#ef4444' }, { upTo: 70, color: '#f59e0b' }, { upTo: 100, color: '#22c55e' }]}
          note={`bloqueado ${f(des.util.blocked * 100, 0)} % · OEE ${f(oee.oee * 100, 0)} %`}
        />
        <Gauge
          label="Deformación permanente EN 124"
          value={mech.permanentDeflMm}
          min={0}
          max={Math.max(4, Math.ceil(a.maxResidualMm * 2))}
          unit="mm"
          decimals={2}
          zones={[{ upTo: a.maxResidualMm * 0.7, color: '#22c55e' }, { upTo: a.maxResidualMm, color: '#f59e0b' }, { upTo: 1e9, color: '#ef4444' }]}
          note={`Límite ≤ ${f(a.maxResidualMm)} mm tras ${f((a.proofLoadPct / 100) * a.breakLoadKN)} kN`}
        />
        <div className="flex flex-col justify-center rounded-lg bg-slate-800/70 p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Cuello de botella detectado</div>
          <div className="text-2xl font-bold text-cyan-400">{bottleneck.id.split(' /')[0]}</div>
          <div className="text-xs text-slate-400">{f(caps[bottleneck.id])} pz/h máx.</div>
          <div className="mt-1 text-[10px] leading-snug text-slate-400">{bottleneck.explanation}</div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        <Card title="Curva de enfriamiento · nervadura crítica" className="xl:col-span-3">
          <CoolingChart cooling={cooling} meltTempC={b.meltTempC} coolantC={b.coolMode === 'bath' ? b.bathTempC : b.jacketTempC} />
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
            <span>
              Núcleo ≤ {cooling.targetC} °C en <b className="text-emerald-400">{isFinite(cooling.timeToTargetS) ? `${f(cooling.timeToTargetS / 60)} min` : 'no alcanzado'}</b>
            </span>
            <span>Desmoldeo: núcleo <b>{f(cooling.coreAtDwell, 0)} °C</b> / piel <b>{f(cooling.surfaceAtDwell, 0)} °C</b></span>
          </div>
        </Card>
        <Card title="Capacidad por recurso (teórica, pz/h)" className="xl:col-span-2">
          <div className="space-y-2">
            {capEntries.map((k) => (
              <Bar key={k} label={k + (k === bottleneck.id ? '  ◄ límite' : '')} value={caps[k] / maxCap} color={k === bottleneck.id ? '#f97316' : '#38bdf8'} extra={`${f(caps[k])} pz/h`} />
            ))}
          </div>
          <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase text-slate-500">Utilización simulada (DES)</h4>
          <div className="space-y-2">
            <Bar label="Extrusor llenando" value={des.util.extruder} color="#22c55e" />
            <Bar label="Extrusor conmutando válvula T" value={des.util.switching} color="#f59e0b" />
            <Bar label="Extrusor BLOQUEADO (espera de matriz)" value={des.util.blocked} color="#ef4444" />
            <Bar label="Operarios" value={des.util.operators} color="#a78bfa" />
            {b.coolMode === 'bath' && <Bar label="Polipasto" value={des.util.hoist} color="#eab308" />}
            {b.coolMode === 'bath' && <Bar label="Batea (posiciones ocupadas)" value={des.util.bath} color="#38bdf8" />}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card title="Reología y fibra">
          <Row k="RPM del husillo / cizalla en canal" v={`${f(rheo.rpm, 0)} rpm · ${f(rheo.shearRateScrew, 0)} s⁻¹`} ok={rheo.rpm <= b.rpmMax} />
          <Row k="Viscosidad relativa η_rel" v={f(rheo.etaRel, 2)} />
          <Row k="Exponente de atrición k·RPM·(L/D)/η_rel" v={f(rheo.attritionExponent, 2)} />
          <Row k="Longitud de fibra tras el tornillo" v={`${f(rheo.fiberLengthMm, 2)} mm`} />
          <Row k="Longitud final (tras bebedero)" v={`${f(rheo.fiberLengthFinalMm, 2)} mm`} ok={rheo.fiberLengthFinalMm >= b.fiberMinMm} />
          <Row k="Relación de aspecto A_f" v={f(rheo.aspectRatio, 0)} />
          <Row k="Eficiencia de interfase" v={`${f(rheo.couplingEff * 100, 0)} %`} ok={rheo.couplingEff >= 0.6} />
          <Row k="Long. crítica L_c / eficiencia ηℓ" v={`${f(rheo.criticalLengthMm, 2)} mm / ${f(rheo.lengthEff, 2)}`} />
          <Row k="Cizalla en la pared del bebedero" v={`${f(rheo.sprueWallShear, 0)} s⁻¹`} />
        </Card>
        <Card title="Presión y llenado">
          <div className="space-y-2">
            <Bar label="ΔP bebedero" value={rheo.dPsprueBar / pMax} color="#fb923c" extra={`${f(rheo.dPsprueBar, 0)} bar`} />
            <Bar label="ΔP cavidad" value={rheo.dPcavityBar / pMax} color="#38bdf8" extra={`${f(rheo.dPcavityBar, 0)} bar`} />
            <Bar label={`ΔP total vs. máximo ${pMax} bar`} value={rheo.dPtotalBar / pMax} color={rheo.dPtotalBar > pMax ? '#ef4444' : '#22c55e'} extra={`${f(rheo.dPtotalBar, 0)} bar`} />
          </div>
          <div className="mt-2">
            <Row k="Tiempo de llenado por cavidad" v={`${f(rheo.fillS, 0)} s`} />
            <Row k="Caudal volumétrico" v={`${f(rheo.flowM3s * 1000, 2)} L/s`} />
            <Row k="Salida del bebedero" v={`Ø ${f(rheo.sprueExitMm, 0)} mm`} />
            <Row k="Espesor medio de flujo" v={`${f(rheo.flowThickMm, 0)} mm`} />
            <Row k="Fuerza de apertura / pernos" v={`${f(rheo.moldOpenKN, 0)} / ${f(rheo.boltCapacityKN, 0)} kN`} ok={rheo.moldOpenKN <= rheo.boltCapacityKN} />
            <Row k="Venteo" v={`${f(b.ventDepthMm, 3)} mm`} ok={b.ventDepthMm >= b.ventMinMm && b.ventDepthMm <= b.ventMaxMm} />
          </div>
        </Card>
        <Card title={`UNE-EN 124 · ${classLabel(part)}`}>
          <Row k="Módulo del compuesto (Halpin-Tsai)" v={`${f(mech.modulusMPa / 1000, 2)} GPa`} />
          <Row k="Resistencia del compuesto" v={`${f(mech.tensileStrengthMPa, 0)} MPa`} />
          <Row k="Flecha elástica en el ensayo" v={`${f(mech.elasticDeflMm, 2)} mm`} />
          <Row k="Deformación permanente" v={`${f(mech.permanentDeflMm, 2)} mm ${mech.passDeflection ? '✓' : '✗'}`} ok={mech.passDeflection} />
          <Row k="Carga de rotura estimada" v={`${f(mech.failureLoadKN, 0)} / ${a.breakLoadKN} kN ${mech.passBreak ? '✓' : '✗'}`} ok={mech.passBreak} />
          <Row k="Coef. de seguridad" v={f(mech.safetyFactor, 2)} ok={mech.safetyFactor >= a.safetyWarn} />
          <Row k="Masa: polímero / fibra / acero" v={`${f(mass.polymerKg, 1)} / ${f(mass.fiberKg, 1)} / ${f(mass.steelKg, 1)} kg`} />
          <Row k="Masa total de la pieza" v={`${f(mass.totalKg, 1)} kg`} />
          <Row k="Alabeo / rechupes / calidad" v={`${f(r.warpMmPerM)} mm/m · ${f(r.sinkRisk * 100, 0)} % · ${f(r.quality * 100, 0)} %`} />
        </Card>
      </div>

      <Card title={`Diagnóstico y alertas (${r.alerts.filter((x) => x.severity === 'critical' || x.severity === 'warn').length})`}>
        <ul className="grid gap-2 md:grid-cols-2">
          {r.alerts.map((al) => (
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
