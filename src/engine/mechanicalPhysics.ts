import type { MechanicalResult, PartSpec } from '../types/simulation';

export const RHO_FIBER = 2.55; // g/cm³ vidrio E
export const RHO_MATRIX = 0.955; // g/cm³ PEAD

const E_MATRIX = 1100; // MPa PEAD alto peso molecular
const E_FIBER = 72000; // MPa vidrio E
const FIBER_ASPECT = 30; // l/d tras extrusión/compresión (fibra corta/larga)
const NU = 0.4;
const LOAD_SPREAD = 0.65; // reparto de carga por la almohadilla, el asiento cónico y la malla de nervios (calibrado)
const SIGMA_MATRIX = 26; // MPa

/** Fracción volumétrica de fibra a partir de la fracción en peso (%) */
export function volumeFraction(glassPct: number): number {
  const wf = glassPct / 100;
  const vf = wf / RHO_FIBER;
  const vm = (1 - wf) / RHO_MATRIX;
  return vf / (vf + vm);
}

/**
 * Módulo elástico del composite: Halpin-Tsai para fibra corta con orientación aleatoria
 * en el plano (Tsai-Pagano: E ≈ 3/8·E_L + 5/8·E_T). Con fibra continua se reduce a la regla de mezclas.
 */
export function compositeModulus(glassPct: number): { E: number; EL: number; ET: number; rule: number } {
  const vf = volumeFraction(glassPct);
  const ratio = E_FIBER / E_MATRIX;
  const xi = 2 * FIBER_ASPECT;
  const etaL = (ratio - 1) / (ratio + xi);
  const etaT = (ratio - 1) / (ratio + 2);
  const EL = (E_MATRIX * (1 + xi * etaL * vf)) / (1 - etaL * vf);
  const ET = (E_MATRIX * (1 + 2 * etaT * vf)) / (1 - etaT * vf);
  const E = 0.375 * EL + 0.625 * ET;
  const rule = vf * E_FIBER + (1 - vf) * E_MATRIX; // cota superior (Voigt)
  return { E, EL, ET, rule };
}

/** Resistencia a tracción/flexión última (MPa) con penalización por mojado deficiente de fibra y exceso de negro de humo */
export function compositeStrength(glassPct: number, carbonPct: number): number {
  let s = SIGMA_MATRIX + 1.4 * glassPct;
  if (glassPct > 35) s -= (glassPct - 35) * 1.1; // mal mojado / fibra rota
  if (carbonPct > 3) s *= 1 - 0.05 * (carbonPct - 3);
  return Math.max(15, s);
}

/** Propiedades de la sección equivalente (panel con nervaduras en T) */
function sectionProps(part: PartSpec, ribThkMm: number) {
  const s = part.ribSpacingMm;
  const tp = part.plateThkMm;
  const H = part.ribHeightMm;
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
  part: PartSpec;
  glassPct: number;
  carbonPct: number;
  ribThkMm: number;
  /** Factor 0..1 por llenado incompleto del molde */
  fillFactor: number;
  /** Factor 0..1 por tensiones residuales/alabeo */
  residualFactor: number;
}

/**
 * Ensayo UNE-EN 124 simplificado: placa circular nervada, apoyo parcialmente empotrado en el asiento cónico,
 * carga repartida en almohadilla de 300 × 300 mm.
 *  - Deformación permanente tras 2/3 de la carga de rotura (≈ 266,7 kN para D400) ≤ 2,0 mm
 *  - Carga de rotura ≥ carga de la clase
 */
export function evaluateEN124(inp: MechInputs): MechanicalResult {
  const { part } = inp;
  const { E } = compositeModulus(inp.glassPct);
  const sigmaU = compositeStrength(inp.glassPct, inp.carbonPct) * inp.fillFactor * inp.residualFactor;
  const sigmaY = 0.55 * sigmaU;
  const sec = sectionProps(part, inp.ribThkMm);
  const GRID = 1.4; // nervaduras en dos direcciones
  const Ieff = sec.perWidth * GRID; // mm⁴/mm
  const tEq = Math.cbrt(12 * Ieff); // mm
  const D = (E * Ieff) / (1 - NU * NU); // N·mm
  const a = part.openingMm / 2 + 25; // radio efectivo hasta el asiento (mm)
  const clamp = 0.6; // 1 = apoyo simple, 0,41 = empotrado
  const padFactor = 0.85;
  const deflation = (P: number) =>
    ((P * a * a) / (16 * Math.PI * D)) * ((3 + NU) / (1 + NU)) * clamp * padFactor;

  const Ptest = (2 / 3) * part.breakLoadKN * 1000; // N
  const Pclass = part.breakLoadKN * 1000;
  const wEl = deflation(Ptest);

  // Tensión máxima en la fibra traccionada: momento radial bajo la almohadilla (N·mm/mm),
  // absorbido por el nervio de cada paso y repartido entre las dos direcciones de la malla.
  const padR = 135;
  const stress = (P: number) => {
    const M = (P / (4 * Math.PI)) * ((1 + NU) * Math.log(a / padR) + 1);
    return (((M * part.ribSpacingMm * sec.cTension) / sec.I) / GRID) * LOAD_SPREAD;
  };
  const sTest = stress(Ptest);
  const sClass = stress(Pclass);
  const ratio = sTest / sigmaY;
  const permanent = wEl * (0.05 + 0.35 * Math.pow(Math.min(ratio, 3), 3));
  const failureLoad = (Pclass * sigmaU) / sClass / 1000; // kN

  return {
    glassVolFrac: volumeFraction(inp.glassPct),
    modulusMPa: E,
    tensileStrengthMPa: sigmaU,
    yieldStrengthMPa: sigmaY,
    equivThicknessMm: tEq,
    elasticDeflMm: wEl,
    permanentDeflMm: permanent,
    peakStressMPa: sClass,
    failureLoadKN: failureLoad,
    safetyFactor: failureLoad / part.breakLoadKN,
    passDeflection: permanent <= 2.0,
    passBreak: failureLoad >= part.breakLoadKN,
  };
}
