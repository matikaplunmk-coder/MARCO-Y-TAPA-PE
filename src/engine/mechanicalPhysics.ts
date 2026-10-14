import type { MechanicalResult, PartSpec, ProcessParams } from '../types/simulation';

/** Fracción volumétrica de fibra a partir de la fracción en peso (%) */
export function volumeFraction(p: Pick<ProcessParams, 'glassPct' | 'rhoFiber' | 'rhoMatrix'>): number {
  const wf = p.glassPct / 100;
  const vf = wf / p.rhoFiber;
  const vm = (1 - wf) / p.rhoMatrix;
  return vf / (vf + vm);
}

/**
 * Módulo elástico del composite: Halpin-Tsai para fibra corta con orientación aleatoria
 * en el plano (Tsai-Pagano: E ≈ 3/8·E_L + 5/8·E_T). Con fibra continua se reduce a la regla de mezclas.
 */
export function compositeModulus(p: ProcessParams): { E: number; EL: number; ET: number; rule: number } {
  const vf = volumeFraction(p);
  const Em = p.eMatrixMPa;
  const Ef = p.eFiberGPa * 1000;
  const ratio = Ef / Em;
  const xi = 2 * p.fiberAspect;
  const etaL = (ratio - 1) / (ratio + xi);
  const etaT = (ratio - 1) / (ratio + 2);
  const EL = (Em * (1 + xi * etaL * vf)) / (1 - etaL * vf);
  const ET = (Em * (1 + 2 * etaT * vf)) / (1 - etaT * vf);
  const E = 0.375 * EL + 0.625 * ET;
  const rule = vf * Ef + (1 - vf) * Em; // cota superior (Voigt)
  return { E, EL, ET, rule };
}

/** Resistencia última (MPa) con penalización por mojado deficiente de fibra y exceso de negro de humo */
export function compositeStrength(p: ProcessParams): number {
  let s = p.sigmaMatrixMPa + p.strengthPerGlass * p.glassPct;
  if (p.glassPct > p.glassOverloadPct) s -= (p.glassPct - p.glassOverloadPct) * p.glassOverloadSlope;
  if (p.carbonPct > p.carbonMax) s *= 1 - 0.05 * (p.carbonPct - p.carbonMax);
  return Math.max(15, s);
}

/** Propiedades de la sección equivalente (panel con nervaduras en T) */
function sectionProps(part: PartSpec, ribThkMm: number) {
  const s = part.ribSpacingMm;
  const tp = part.plateThkMm;
  const H = Math.max(part.ribHeightMm, tp + 1);
  const hr = H - tp;
  const Ap = s * tp;
  const Ar = ribThkMm * hr;
  const yp = tp / 2;
  const yr = tp + hr / 2;
  const yNA = (Ap * yp + Ar * yr) / (Ap + Ar);
  const I =
    (s * tp ** 3) / 12 +
    Ap * (yNA - yp) ** 2 +
    (ribThkMm * hr ** 3) / 12 +
    Ar * (yr - yNA) ** 2;
  return { I, yNA, cTension: H - yNA, cComp: yNA, perWidth: I / s };
}

export interface MechInputs {
  p: ProcessParams;
  part: PartSpec;
  /** Factor 0..1 por llenado incompleto del molde */
  fillFactor: number;
  /** Factor 0..1 por tensiones residuales/alabeo */
  residualFactor: number;
}

/**
 * Ensayo UNE-EN 124 simplificado: placa circular nervada, apoyo parcialmente empotrado en el asiento cónico,
 * carga repartida en almohadilla. La rigidez y la resistencia se reducen por el factor de huecos (rejillas).
 *  - Flecha residual tras la carga de ensayo (% de la rotura) ≤ límite admisible
 *  - Carga de rotura ≥ carga de la clase
 */
export function evaluateEN124({ p, part, fillFactor, residualFactor }: MechInputs): MechanicalResult {
  const { E } = compositeModulus(p);
  const nu = p.poisson;
  const sigmaU = compositeStrength(p) * fillFactor * residualFactor;
  const sigmaY = p.yieldFrac * sigmaU;
  const solid = Math.max(0.05, 1 - part.voidFrac); // fracción de material efectiva
  const sec = sectionProps(part, p.ribThkMm);
  const Ieff = sec.perWidth * p.gridFactor * solid; // mm⁴/mm
  const tEq = Math.cbrt(12 * Ieff); // mm
  const D = (E * Ieff) / (1 - nu * nu); // N·mm
  const a = part.openingMm / 2 + 25; // radio efectivo hasta el asiento (mm)
  const deflection = (P: number) =>
    ((P * a * a) / (16 * Math.PI * D)) * ((3 + nu) / (1 + nu)) * p.supportClamp * p.padFactor;

  const Pclass = part.breakLoadKN * 1000;
  const Ptest = (p.proofLoadPct / 100) * Pclass; // N
  const wEl = deflection(Ptest);

  // Tensión máxima en la fibra traccionada: momento radial bajo la almohadilla (N·mm/mm),
  // absorbido por el nervio de cada paso y repartido entre las dos direcciones de la malla.
  const padR = Math.min(p.padRadiusMm, a * 0.9);
  const stress = (P: number) => {
    const M = (P / (4 * Math.PI)) * ((1 + nu) * Math.log(a / padR) + 1);
    return (((M * part.ribSpacingMm * sec.cTension) / sec.I) / p.gridFactor / solid) * p.loadSpread;
  };
  const sTest = stress(Ptest);
  const sClass = stress(Pclass);
  const ratio = sTest / sigmaY;
  const permanent = wEl * (p.creepBase + p.creepGain * Math.pow(Math.min(ratio, 3), 3));
  const failureLoad = (Pclass * sigmaU) / sClass / 1000; // kN

  return {
    glassVolFrac: volumeFraction(p),
    modulusMPa: E,
    tensileStrengthMPa: sigmaU,
    yieldStrengthMPa: sigmaY,
    equivThicknessMm: tEq,
    elasticDeflMm: wEl,
    permanentDeflMm: permanent,
    peakStressMPa: sClass,
    failureLoadKN: failureLoad,
    safetyFactor: failureLoad / part.breakLoadKN,
    passDeflection: permanent <= p.maxResidualMm,
    passBreak: failureLoad >= part.breakLoadKN,
  };
}
