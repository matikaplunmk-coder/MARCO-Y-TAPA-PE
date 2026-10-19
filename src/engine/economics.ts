import type { Analysis, ProcessParams } from '../types/simulation';
import type { CostParams, IntrusionAnalysis, IntrusionParams } from '../types/intrusion';

export interface CostBreakdown {
  material: number;
  labor: number;
  energy: number;
  capex: number;
  total: number;
  piecesPerYear: number;
  goodPiecesPerYear: number;
  energyKWh: number;
}

export interface Economics {
  a: CostBreakdown;
  b: CostBreakdown;
}

function finish(
  c: CostParams,
  availability: number,
  pph: number,
  quality: number,
  capex: number,
  matPerPiece: number,
  laborPerHour: number,
  kWhPerPiece: number,
  kWhFixedPerHour: number,
): CostBreakdown {
  const piecesPerYear = pph * c.hoursPerYear * availability;
  const good = Math.max(1e-9, piecesPerYear * quality);
  const energyKWh = pph > 0 ? kWhPerPiece + kWhFixedPerHour / pph : Infinity;
  const perGood = (x: number) => (pph > 0 ? x / quality : Infinity);
  const material = perGood(matPerPiece);
  const labor = perGood(pph > 0 ? laborPerHour / pph : Infinity);
  const energy = perGood(energyKWh * c.energyRate);
  const capexPer = (capex / Math.max(0.1, c.amortYears)) / good;
  return {
    material,
    labor,
    energy,
    capex: capexPer,
    total: material + labor + energy + capexPer,
    piecesPerYear,
    goodPiecesPerYear: good,
    energyKWh,
  };
}

/** Costo unitario estimado por pieza BUENA, amortizando la inversión (años configurables). */
export function computeEconomics(
  a: ProcessParams,
  b: IntrusionParams,
  c: CostParams,
  ra: Analysis,
  rb: IntrusionAnalysis,
): Economics {
  const availability = a.availabilityPct / 100;

  // Método A: masa con sobrepeso; fibra + PE de scrap
  const shotA = a.massKg * (1 + a.overweightPct / 100);
  const fiberA = (a.glassPct / 100) * shotA;
  const matA = fiberA * c.costGlass + (shotA - fiberA) * c.costScrap;
  const pressKWhPerPiece = (c.pressKW * (ra.times.loadS + ra.times.pressS + ra.times.openS)) / 3600;
  const kWhA = c.kWhKgA * shotA + pressKWhPerPiece;
  const costA = finish(
    c,
    availability,
    ra.des.piecesPerHour,
    ra.oee.quality,
    c.capexA,
    matA,
    c.operatorsA * c.laborRate,
    kWhA,
    c.chillerKW,
  );

  // Método B: masa con rebaba/purga, PE-g-MA sobre la fracción de polímero y acero de la jaula
  const shotB = a.massKg * (1 + b.flashPct / 100);
  const fiberB = (b.glassPct / 100) * shotB;
  const coupling = (b.couplingPct / 100) * (shotB - fiberB);
  const matB = fiberB * c.costGlass + (shotB - fiberB - coupling) * c.costScrap + coupling * c.costCoupling + rb.mass.steelKg * c.costSteel;
  const hoistKWh = b.coolMode === 'bath' ? (c.hoistKW * 3 * b.hoistS) / 3600 : 0;
  const kWhB = c.kWhKgB * shotB + hoistKWh;
  const costB = finish(c, availability, rb.des.piecesPerHour, rb.oee.quality, c.capexB, matB, b.operators * c.laborRate, kWhB, c.coolKWB);

  return { a: costA, b: costB };
}
