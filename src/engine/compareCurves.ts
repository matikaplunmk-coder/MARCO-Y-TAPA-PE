import type { IntrusionAnalysis, IntrusionParams } from '../types/intrusion';
import type { Analysis, ProcessParams } from '../types/simulation';
import { buildEN124Model } from './mechanicalPhysics';
import { cageSpec } from './intrusionMechanics';
import { getPart } from './parts';

export interface CurvePoint {
  loadKN: number;
  permanentMm: number;
  totalMm: number;
}

export interface LoadCurve {
  points: CurvePoint[];
  failureKN: number;
  /** Punto de la carga de ensayo (2/3 de la rotura exigida por defecto) */
  proof: CurvePoint;
}

function series(model: ReturnType<typeof buildEN124Model>, xMax: number, proofKN: number): LoadCurve {
  const n = 80;
  const points: CurvePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const P = (xMax * i) / n;
    if (P > model.failureLoadKN) break;
    const v = model.at(P);
    points.push({ loadKN: P, permanentMm: v.permanentMm, totalMm: v.totalMm });
  }
  const f = model.at(Math.min(model.failureLoadKN, model.failureLoadKN));
  points.push({ loadKN: model.failureLoadKN, permanentMm: f.permanentMm, totalMm: f.totalMm });
  const pr = model.at(proofKN);
  return { points, failureKN: model.failureLoadKN, proof: { loadKN: proofKN, permanentMm: pr.permanentMm, totalMm: pr.totalMm } };
}

/** Curvas carga–flecha de ambos métodos con el mismo modelo estructural */
export function loadDeflectionCurves(a: ProcessParams, b: IntrusionParams, ra: Analysis, rb: IntrusionAnalysis): { a: LoadCurve; b: LoadCurve; xMax: number } {
  const part = getPart(a);
  const modelA = buildEN124Model({ p: a, part, E: ra.mech.modulusMPa, sigmaU: ra.mech.tensileStrengthMPa });
  const modelB = buildEN124Model({ p: a, part, E: rb.mech.modulusMPa, sigmaU: rb.mech.tensileStrengthMPa, cage: cageSpec(part, b) });
  const proof = (a.proofLoadPct / 100) * a.breakLoadKN;
  const xMax = Math.max(450, a.breakLoadKN * 1.15, Math.min(1200, Math.max(modelA.failureLoadKN, modelB.failureLoadKN) * 1.05));
  return { a: series(modelA, xMax, proof), b: series(modelB, xMax, proof), xMax };
}
