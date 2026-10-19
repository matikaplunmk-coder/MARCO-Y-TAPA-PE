import { Beaker, Droplets, Hammer, Layers, Pipette, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CostParams, IntrusionAnalysis, IntrusionParams, PeType } from '../types/intrusion';
import { B_GROUPS, COST_GROUPS } from '../engine/intrusionSchema';
import { PE_TYPES } from '../engine/rheology';
import FieldList from './FieldList';
import { Accordion, Readout, Segmented } from './ui';

const ICONS: Record<string, ReactNode> = {
  b_material: <Beaker size={14} />,
  b_extruder: <Zap size={14} />,
  b_sprue: <Pipette size={14} />,
  b_reinf: <Layers size={14} />,
  b_kin: <Droplets size={14} />,
};
const OPEN = new Set(['b_material', 'b_extruder', 'b_sprue', 'b_reinf', 'b_kin']);

interface Props {
  b: IntrusionParams;
  onChange: (b: IntrusionParams) => void;
  r: IntrusionAnalysis;
}

export default function ControlPanelB({ b, onChange, r }: Props) {
  const patch = (c: Partial<IntrusionParams>) => onChange({ ...b, ...c });
  const rh = r.rheo;
  const f = (x: number, d = 1) => x.toFixed(d);

  const setNum = (key: string, v: number) => {
    const c: Partial<IntrusionParams> = { [key]: v };
    if (key === 'mfi') c.peType = 'CUSTOM';
    if (key === 'stations' && b.coolMode === 'bath' && b.moldFleet < v) c.moldFleet = v;
    if (key === 'moldFleet' && v < b.stations) c.moldFleet = b.stations;
    patch(c);
  };

  const extras = (id: string): ReactNode => {
    switch (id) {
      case 'b_material':
        return (
          <>
            <label className="block text-xs">
              <span className="text-slate-300">Tipo de polietileno</span>
              <select
                value={b.peType}
                onChange={(e) => {
                  const t = e.target.value as PeType;
                  patch(t === 'CUSTOM' ? { peType: t } : { peType: t, mfi: PE_TYPES[t].mfi });
                }}
                className="mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-slate-100"
              >
                {(Object.keys(PE_TYPES) as Exclude<PeType, 'CUSTOM'>[]).map((k) => (
                  <option key={k} value={k}>
                    {PE_TYPES[k].label}
                  </option>
                ))}
                <option value="CUSTOM">Personalizado (MFI libre)</option>
              </select>
            </label>
            <div>
              <div className="mb-1 text-xs text-slate-300">Incorporación de la fibra de vidrio</div>
              <Segmented
                value={b.fiberFeed}
                onChange={(v) => patch({ fiberFeed: v })}
                options={[
                  ['side', 'Side Feeder en zona de venteo'],
                  ['hopper', 'Tolva principal / dry blend'],
                ]}
              />
            </div>
            <Readout label="Longitud final de fibra" value={`${f(rh.fiberLengthFinalMm, 2)} mm (A_f = ${f(rh.aspectRatio, 0)})`} warn={rh.fiberLengthFinalMm < b.fiberMinMm} />
            <Readout label="Eficiencia de interfase (PE-g-MA)" value={`${f(rh.couplingEff * 100, 0)} %`} warn={b.couplingPct <= 0} />
          </>
        );
      case 'b_extruder':
        return (
          <>
            <Readout label="RPM del husillo para el caudal" value={`${f(rh.rpm, 0)} rpm`} warn={rh.rpm > b.rpmMax} />
            <Readout label="Tiempo de llenado por cavidad" value={`${f(rh.fillS, 0)} s`} />
          </>
        );
      case 'b_sprue':
        return (
          <>
            <Readout label="ΔP bebedero + cavidad" value={`${f(rh.dPsprueBar, 0)} + ${f(rh.dPcavityBar, 0)} = ${f(rh.dPtotalBar, 0)} bar`} warn={rh.dPtotalBar > b.pMaxBar} />
            <Readout label="Salida del bebedero" value={`Ø ${f(rh.sprueExitMm, 0)} mm`} />
          </>
        );
      case 'b_reinf':
        return (
          <>
            <div>
              <div className="mb-1 text-xs text-slate-300">Tipo de refuerzo</div>
              <Segmented
                value={b.reinforcement}
                onChange={(v) => patch({ reinforcement: v })}
                options={[
                  ['pure', 'Compuesto puro PE+FV'],
                  ['cage', 'Jaula de acero soldado'],
                  ['hybrid', 'Híbrido'],
                ]}
              />
            </div>
            {b.reinforcement !== 'pure' && (
              <Readout label="Acero de la jaula" value={`${f(r.mass.steelKg, 2)} kg · ${f(r.steelAreaPerRibMm2, 0)} mm²/nervio`} />
            )}
          </>
        );
      case 'b_kin':
        return (
          <>
            <div>
              <div className="mb-1 text-xs text-slate-300">Modalidad de enfriamiento</div>
              <Segmented
                value={b.coolMode}
                onChange={(v) => patch({ coolMode: v })}
                options={[
                  ['insitu', 'In-situ en el puesto'],
                  ['bath', 'Polipasto a batea de agua'],
                ]}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-300">Criterio de salida</div>
              <Segmented
                value={b.dwellMode}
                onChange={(v) => patch({ dwellMode: v })}
                options={[
                  ['fixed', 'Tiempo fijo (min)'],
                  ['temperature', 'Temperatura de núcleo (°C)'],
                ]}
              />
            </div>
            <Readout
              label={b.dwellMode === 'temperature' ? 'Refrigeración resultante' : `Necesaria para ≤ ${b.coolTargetC} °C`}
              value={isFinite(r.requiredMin) ? `${f(r.requiredMin)} min` : 'no alcanzable'}
              warn={!isFinite(r.requiredMin)}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-slate-800/60 px-3 py-2 text-[11px] leading-snug text-slate-400">
        La pieza (masa, área, huecos, espesor, clase EN 124) y las constantes del material base se toman de los paneles
        <b className="text-slate-300"> Pieza y normativa</b> y <b className="text-slate-300">Método A</b>; así ambos métodos se comparan sobre la misma pieza.
      </p>
      {B_GROUPS.map((g) => (
        <Accordion key={g.id} icon={ICONS[g.id] ?? <Hammer size={14} />} title={g.title} badge={`${g.fields.length}`} defaultOpen={OPEN.has(g.id)}>
          {extras(g.id)}
          <FieldList fields={g.fields} params={b} onSet={setNum} />
        </Accordion>
      ))}
    </div>
  );
}

export function ControlPanelCosts({ c, onChange }: { c: CostParams; onChange: (c: CostParams) => void }) {
  return (
    <div className="space-y-3">
      {COST_GROUPS.map((g) => (
        <Accordion key={g.id} title={g.title} badge={`${g.fields.length}`} defaultOpen>
          <FieldList fields={g.fields} params={c} onSet={(k, v) => onChange({ ...c, [k]: v })} />
        </Accordion>
      ))}
    </div>
  );
}
