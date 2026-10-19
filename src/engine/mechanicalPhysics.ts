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

/** Armadura de acero (jaula soldada) expresada por nervio */
export interface CageSpec {
  /** Área de acero traccionado por paso de nervadura (mm²) */
  areaPerRibMm2: number;
  coverMm: number;
  EsMPa: number;
  fyMPa: number;
  /** Participación del compuesto en rigidez y resistencia (1 = compuesto íntegro) */
  compositeShare: number;
}

export interface EN124Model {
  at: (PkN: number) => { elasticMm: number; permanentMm: number; totalMm: number; stressRatio: number };
  failureLoadKN: number;
  result: MechanicalResult;
}

/**
 * Ensayo UNE-EN 124 simplificado: placa circular nervada, apoyo parcialmente empotrado en el asiento cónico,
 * carga repartida en almohadilla. La rigidez y la resistencia se reducen por el factor de huecos (rejillas).
 * Admite una armadura de acero (sección transformada, rotura por fluencia del acero + aporte del compuesto).
 *  - Flecha residual tras la carga de ensayo (% de la rotura) ≤ límite admisible
 *  - Carga de rotura ≥ carga de la clase
 */
export function buildEN124Model(o: {
  p: ProcessParams;
  part: PartSpec;
  E: number; // MPa, compuesto
  sigmaU: number; // MPa, compuesto (ya con factores de llenado/residuales)
  cage?: CageSpec;
}): EN124Model {
  const { p, part } = o;
  const nu = p.poisson;
  const share = o.cage ? o.cage.compositeShare : 1;
  const Ec = o.E * share;
  const sigmaU = o.sigmaU * share;
  const sigmaY = p.yieldFrac * sigmaU;
  const solid = Math.max(0.05, 1 - part.voidFrac); // fracción de material efectiva
  const sec = sectionProps(part, p.ribThkMm);
  const Irib = sec.I * p.gridFactor * solid; // mm⁴ por paso de nervadura
  const dist = o.cage ? Math.max(1, sec.cTension - o.cage.coverMm) : 0;
  const As = o.cage ? o.cage.areaPerRibMm2 : 0;
  const Es = o.cage ? o.cage.EsMPa : 0;
  const fy = o.cage ? o.cage.fyMPa : 0;
  const EI = Ec * Irib + Es * As * dist * dist; // N·mm² por paso
  const a = part.openingMm / 2 + 25; // radio efectivo hasta el asiento (mm)
  const D = EI / part.ribSpacingMm / (1 - nu * nu); // N·mm
  const padR = Math.min(p.padRadiusMm, a * 0.9);
  const Mdem = (P: number) => (P / (4 * Math.PI)) * ((1 + nu) * Math.log(a / padR) + 1) * part.ribSpacingMm * p.loadSpread; // N·mm por paso
  const deflection = (P: number) =>
    ((P * a * a) / (16 * Math.PI * D)) * ((3 + nu) / (1 + nu)) * p.supportClamp * p.padFactor;

  const at = (PkN: number) => {
    const P = PkN * 1000;
    const kappa = Mdem(P) / EI;
    const sc = Ec * kappa * sec.cTension;
    const ss = Es * kappa * dist;
    const ratio = Math.max(sc / sigmaY, o.cage ? ss / fy : 0);
    const w = deflection(P);
    const wp = w * (p.creepBase + p.creepGain * Math.pow(Math.min(ratio, 3), 3));
    return { elasticMm: w, permanentMm: wp, totalMm: w + wp, stressRatio: ratio };
  };

  const Pclass = part.breakLoadKN;
  const epsU = sigmaU / Ec;
  const steelAtFailure = o.cage ? Math.min(fy, Es * epsU * (dist / sec.cTension)) : 0;
  const Mcap = (sigmaU / sec.cTension) * Irib + steelAtFailure * As * dist;
  const failureKN = (Pclass * Mcap) / Mdem(Pclass * 1000);
  const test = at((p.proofLoadPct / 100) * Pclass);
  const kClass = Mdem(Pclass * 1000) / EI;

  const result: MechanicalResult = {
    glassVolFrac: volumeFraction(p),
    modulusMPa: o.E,
    tensileStrengthMPa: o.sigmaU,
    yieldStrengthMPa: sigmaY,
    equivThicknessMm: Math.cbrt((12 * EI) / Ec / part.ribSpacingMm),
    elasticDeflMm: test.elasticMm,
    permanentDeflMm: test.permanentMm,
    peakStressMPa: Ec * kClass * sec.cTension,
    failureLoadKN: failureKN,
    safetyFactor: failureKN / Pclass,
    passDeflection: test.permanentMm <= p.maxResidualMm,
    passBreak: failureKN >= Pclass,
  };
  return { at, failureLoadKN: failureKN, result };
}

/** Evaluación del Método A (compuesto puro) */
export function evaluateEN124({ p, part, fillFactor, residualFactor }: MechInputs): MechanicalResult {
  const { E } = compositeModulus(p);
  const sigmaU = compositeStrength(p) * fillFactor * residualFactor;
  return buildEN124Model({ p, part, E, sigmaU }).result;
}
