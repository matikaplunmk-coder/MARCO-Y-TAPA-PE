import { ArrowLeftRight, Trophy } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { AppParams, IntrusionAnalysis } from '../types/intrusion';
import type { Analysis } from '../types/simulation';
import type { Economics } from '../engine/economics';
import { loadDeflectionCurves } from '../engine/compareCurves';
import { CLASS_LOAD_KN, classLabel } from '../engine/parts';
import { fmtMinSec } from '../engine/format';
import { COLOR_A, COLOR_B, CostBars, CycleBars, LoadDeflectionChart, type Seg } from './CompareCharts';
import { Card } from './panelParts';

interface Props {
  app: AppParams;
  ra: Analysis;
  rb: IntrusionAnalysis;
  econ: Economics;
  onSync: (dir: 'AtoB' | 'BtoA') => void;
}

interface Row {
  label: string;
  a: ReactNode;
  b: ReactNode;
  /** 'a' | 'b' | null: método con mejor valor */
  best?: 'a' | 'b' | null;
  note?: string;
}

const pick = (va: number, vb: number, higher: boolean, tol = 0.005): 'a' | 'b' | null => {
  if (!Number.isFinite(va) && !Number.isFinite(vb)) return null;
  if (Math.abs(va - vb) <= tol * Math.max(Math.abs(va), Math.abs(vb), 1e-9)) return null;
  return (va > vb) === higher ? 'a' : 'b';
};

export default function ComparePanel({ app, ra, rb, econ, onSync }: Props) {
  const { a, b } = app;
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

  const curves = useMemo(() => loadDeflectionCurves(a, b, ra, rb), [a, b, ra, rb]);

  const segsA: Seg[] = [
    { label: 'Carga de masa (mesa lanzadera)', s: ra.times.loadS, cat: 'prep' },
    { label: 'Prensado puro', s: ra.times.pressPureS, cat: 'form' },
    { label: 'Colocación de pasadores', s: ra.times.pinS, cat: 'form' },
    { label: 'Apertura de prensa', s: ra.times.openS, cat: 'move' },
    { label: 'Grúa ×2', s: ra.times.craneS * 2, cat: 'move' },
    { label: 'Enfriamiento en batea', s: ra.times.coolS, cat: 'cool' },
    { label: 'Desapriete y desmoldeo', s: ra.times.demoldS, cat: 'demold' },
    { label: 'Retorno del molde', s: ra.times.returnS, cat: 'move' },
  ];
  const bath = b.coolMode === 'bath';
  const segsB: Seg[] = [
    ...(rb.times.cageS > 0 ? [{ label: 'Colocación de la jaula', s: rb.times.cageS, cat: 'prep' as const }] : []),
    { label: 'Apriete de pernos', s: rb.times.boltS, cat: 'prep' },
    { label: 'Conmutación de válvula T', s: rb.times.switchS, cat: 'form' },
    { label: 'Llenado de la cavidad', s: rb.times.fillS, cat: 'form' },
    { label: 'Mantenimiento / retracción', s: rb.times.holdS, cat: 'form' },
    ...(bath ? [{ label: 'Polipasto ×3', s: rb.times.hoistS * 3, cat: 'move' as const }] : []),
    { label: bath ? 'Enfriamiento en batea' : 'Enfriamiento in-situ', s: rb.times.coolS, cat: 'cool' },
    { label: 'Desapriete y desmoldeo', s: rb.times.unboltS + rb.times.extractS, cat: 'demold' },
  ];

  const fiberA = (a.fiberAspect * a.fiberDiamUm) / 1000;
  const fiberB = rb.rheo.fiberLengthFinalMm;
  const massA = { polymer: a.massKg * (1 - a.glassPct / 100), fiber: a.massKg * (a.glassPct / 100), steel: 0 };
  const critA = ra.alerts.filter((x) => x.severity === 'critical').length;
  const critB = rb.alerts.filter((x) => x.severity === 'critical').length;
  const okA = ra.mech.passBreak && ra.mech.passDeflection;
  const okB = rb.mech.passBreak && rb.mech.passDeflection;

  const bnA = ra.bottleneck.id;
  const bnB = rb.bottleneck.id;

  const rows: Row[] = [
    { label: 'Piezas por hora (throughput)', a: f(ra.des.piecesPerHour), b: f(rb.des.piecesPerHour), best: pick(ra.des.piecesPerHour, rb.des.piecesPerHour, true) },
    { label: `Piezas buenas por turno (${a.shiftH} h)`, a: f(ra.goodPiecesPerShift, 0), b: f(rb.goodPiecesPerShift, 0), best: pick(ra.goodPiecesPerShift, rb.goodPiecesPerShift, true) },
    { label: 'Takt time (min entre piezas)', a: isFinite(ra.des.taktS) ? fmtMinSec(ra.des.taktS) : '—', b: isFinite(rb.des.taktS) ? fmtMinSec(rb.des.taktS) : '—', best: pick(ra.des.taktS, rb.des.taktS, false) },
    { label: 'Utilización efectiva del extrusor (%)', a: f(ra.des.util.extruder * 100, 0), b: f(rb.des.util.extruder * 100, 0), best: pick(ra.des.util.extruder, rb.des.util.extruder, true), note: 'tiempo produciendo masa útil' },
    { label: 'OEE (%)', a: f(ra.oee.oee * 100, 0), b: f(rb.oee.oee * 100, 0), best: pick(ra.oee.oee, rb.oee.oee, true) },
    { label: 'Cuello de botella principal', a: bnA, b: bnB, best: null },
    { label: 'Longitud final promedio de fibra (mm)', a: f(fiberA, 2), b: f(fiberB, 2), best: pick(fiberA, fiberB, true), note: 'A: l/d × d' },
    { label: 'Módulo elástico E (GPa)', a: f(ra.mech.modulusMPa / 1000, 2), b: f(rb.mech.modulusMPa / 1000, 2), best: pick(ra.mech.modulusMPa, rb.mech.modulusMPa, true) },
    { label: 'Deformación permanente EN 124 (mm)', a: f(ra.mech.permanentDeflMm, 2), b: f(rb.mech.permanentDeflMm, 2), best: pick(ra.mech.permanentDeflMm, rb.mech.permanentDeflMm, false) },
    { label: 'Carga máxima de rotura (kN)', a: f(ra.mech.failureLoadKN, 0), b: f(rb.mech.failureLoadKN, 0), best: pick(ra.mech.failureLoadKN, rb.mech.failureLoadKN, true) },
    { label: 'Cumple UNE-EN 124', a: okA ? '✓ cumple' : '✗ no cumple', b: okB ? '✓ cumple' : '✗ no cumple', best: okA === okB ? null : okA ? 'a' : 'b' },
    { label: 'Peso final de la pieza (kg)', a: f(a.massKg, 1), b: f(rb.mass.totalKg, 1), best: null },
    {
      label: 'Desglose de masa: polímero / fibra / inserto (kg)',
      a: `${f(massA.polymer, 1)} / ${f(massA.fiber, 1)} / ${f(massA.steel, 1)}`,
      b: `${f(rb.mass.polymerKg, 1)} / ${f(rb.mass.fiberKg, 1)} / ${f(rb.mass.steelKg, 1)}`,
      best: null,
    },
    { label: 'Costo unitario ($/pieza buena)', a: `$${f(econ.a.total, 2)}`, b: `$${f(econ.b.total, 2)}`, best: pick(econ.a.total, econ.b.total, false), note: `amortizado a ${app.c.amortYears} años` },
    { label: '   · materiales', a: `$${f(econ.a.material, 2)}`, b: `$${f(econ.b.material, 2)}`, best: null },
    { label: '   · mano de obra', a: `$${f(econ.a.labor, 2)}`, b: `$${f(econ.b.labor, 2)}`, best: null },
    { label: '   · energía', a: `$${f(econ.a.energy, 2)} (${f(econ.a.energyKWh, 1)} kWh)`, b: `$${f(econ.b.energy, 2)} (${f(econ.b.energyKWh, 1)} kWh)`, best: null },
    { label: '   · amortización de la inversión', a: `$${f(econ.a.capex, 2)}`, b: `$${f(econ.b.capex, 2)}`, best: null },
    { label: 'Producción anual (piezas buenas)', a: f(econ.a.goodPiecesPerYear, 0), b: f(econ.b.goodPiecesPerYear, 0), best: pick(econ.a.goodPiecesPerYear, econ.b.goodPiecesPerYear, true) },
    { label: 'Alertas críticas', a: critA, b: critB, best: critA === critB ? null : critA < critB ? 'a' : 'b' },
  ];

  const winsA = rows.filter((r) => r.best === 'a').length;
  const winsB = rows.filter((r) => r.best === 'b').length;
  const cheaper = econ.a.total === econ.b.total ? null : econ.a.total < econ.b.total ? 'A' : 'B';
  const cell = (r: Row, who: 'a' | 'b') =>
    `px-3 py-1.5 text-right font-mono text-xs ${r.best === who ? 'bg-emerald-950/60 font-bold text-emerald-300' : 'text-slate-200'}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs">
        <Trophy size={16} className="text-amber-400" />
        <span className="text-slate-300">
          Mejor valor en <b style={{ color: COLOR_A }}>A: {winsA}</b> indicadores · <b style={{ color: COLOR_B }}>B: {winsB}</b> indicadores
          {cheaper && (
            <>
              {' '}· menor costo unitario: <b className="text-emerald-300">Método {cheaper}</b> ({f(Math.abs(econ.a.total - econ.b.total), 2)} $/pieza)
            </>
          )}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={() => onSync('BtoA')} className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700" title="Copia caudal, fibra, negro de humo y T₀ del Método A al B">
            <ArrowLeftRight size={12} /> Igualar B := A
          </button>
          <button onClick={() => onSync('AtoB')} className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700" title="Copia caudal, fibra, negro de humo y T₀ del Método B al A">
            <ArrowLeftRight size={12} /> Igualar A := B
          </button>
        </span>
      </div>

      <Card title={`Tabla comparativa de KPIs · pieza ${a.massKg} kg · ${classLabel({ loadClass: a.loadClass, breakLoadKN: a.breakLoadKN })}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5 text-left font-semibold">Indicador</th>
                <th className="px-3 py-1.5 text-right font-semibold" style={{ color: COLOR_A }}>A · Compresión desacoplada</th>
                <th className="px-3 py-1.5 text-right font-semibold" style={{ color: COLOR_B }}>B · Intrusión en T</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-800/80">
                  <td className="px-3 py-1.5 text-xs text-slate-300">
                    {r.label}
                    {r.note && <span className="ml-1 text-[10px] text-slate-500">({r.note})</span>}
                  </td>
                  <td className={cell(r, 'a')}>{r.a}</td>
                  <td className={cell(r, 'b')}>{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Verde = mejor valor. Modelos simplificados calibrados cualitativamente: sirven para comparar configuraciones, no sustituyen ensayos ni cotizaciones reales.
          Los costos usan los valores editables del panel «Costos».
        </p>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card title="Takt time y descomposición del ciclo por estación">
          <CycleBars a={{ segs: segsA, takt: ra.des.taktS }} b={{ segs: segsB, takt: rb.des.taktS }} />
        </Card>
        <Card title="Curva carga–flecha vs. límite UNE-EN 124">
          <LoadDeflectionChart
            a={curves.a}
            b={curves.b}
            xMax={curves.xMax}
            limitMm={a.maxResidualMm}
            classes={[
              { label: 'C250', kN: CLASS_LOAD_KN.C250 },
              { label: 'D400', kN: CLASS_LOAD_KN.D400 },
            ]}
            targetKN={(a.proofLoadPct / 100) * a.breakLoadKN}
          />
        </Card>
      </div>

      <Card title="Costo unitario por pieza buena ($) · desglose">
        <CostBars a={econ.a} b={econ.b} />
      </Card>
    </div>
  );
}
