import type { AppParams, CostParams, IntrusionParams } from '../types/intrusion';
import { COST_BY_KEY, B_BY_KEY } from './intrusionSchema';
import { DEFAULT_COSTS, DEFAULT_B } from './intrusionDefaults';
import { DEFAULT_PARAMS } from './parts';
import { importPreset } from './presets';

export const APP_PRESET_VERSION = 2;

export const DEFAULT_APP: AppParams = { a: DEFAULT_PARAMS, b: DEFAULT_B, c: DEFAULT_COSTS };

export function exportAppPreset(p: AppParams): string {
  return JSON.stringify(
    {
      app: 'planta-composite-sim',
      version: APP_PRESET_VERSION,
      exportedAt: new Date().toISOString(),
      methodA: p.a,
      methodB: p.b,
      costs: p.c,
    },
    null,
    2,
  );
}

export interface AppImportResult {
  params: AppParams;
  applied: number;
  clamped: number;
  ignored: number;
  missing: number;
  version: number;
}

const ENUMS_B: Record<string, readonly string[]> = {
  peType: ['PE100', 'PE80', 'RECYCLED', 'VIRGIN', 'CUSTOM'],
  fiberFeed: ['side', 'hopper'],
  reinforcement: ['pure', 'cage', 'hybrid'],
  coolMode: ['insitu', 'bath'],
  dwellMode: ['temperature', 'fixed'],
};

/** Valida un objeto plano contra los valores de fábrica y los límites duros del esquema */
function sanitize<T extends object>(
  raw: unknown,
  defaults: T,
  limits: (key: string) => { hard: [number, number]; int?: boolean } | undefined,
  enums: Record<string, readonly string[]> = {},
): { value: T; applied: number; clamped: number; ignored: number } {
  const dflt = defaults as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...dflt };
  let applied = 0;
  let clamped = 0;
  let ignored = 0;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!(k in dflt)) {
        ignored++;
        continue;
      }
      const def = dflt[k];
      if (typeof def === 'number') {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          ignored++;
          continue;
        }
        const lim = limits(k);
        let x = v;
        if (lim) {
          x = Math.min(lim.hard[1], Math.max(lim.hard[0], lim.int ? Math.round(v) : v));
          if (x !== v) clamped++;
        }
        out[k] = x;
      } else if (typeof def === 'boolean') {
        if (typeof v !== 'boolean') {
          ignored++;
          continue;
        }
        out[k] = v;
      } else if (enums[k] && enums[k].includes(v as string)) out[k] = v;
      else {
        ignored++;
        continue;
      }
      applied++;
    }
  }
  return { value: out as T, applied, clamped, ignored };
}

/**
 * Importa un preset v2 (métodos A y B + costos) o un preset v1 (solo Método A, formato plano o { params }).
 * Lo que falte toma el valor de fábrica.
 */
export function importAppPreset(text: string): AppImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('El JSON no contiene un preset.');
  const obj = raw as Record<string, unknown>;
  const total = Object.keys(DEFAULT_PARAMS).length + Object.keys(DEFAULT_B).length + Object.keys(DEFAULT_COSTS).length;

  if ('methodA' in obj || 'methodB' in obj || 'costs' in obj) {
    const ra = importPartial(obj.methodA);
    const rb = sanitize<IntrusionParams>(obj.methodB, DEFAULT_B, (k) => B_BY_KEY.get(k), ENUMS_B);
    const rc = sanitize<CostParams>(obj.costs, DEFAULT_COSTS, (k) => COST_BY_KEY.get(k));
    const applied = ra.applied + rb.applied + rc.applied;
    if (applied === 0) throw new Error('No se reconoció ningún parámetro válido en el archivo.');
    return {
      params: { a: ra.params, b: rb.value, c: rc.value },
      applied,
      clamped: ra.clamped + rb.clamped + rc.clamped,
      ignored: ra.ignored + rb.ignored + rc.ignored,
      missing: total - applied,
      version: typeof obj.version === 'number' ? obj.version : APP_PRESET_VERSION,
    };
  }
  // Formato v1: solo Método A
  const r1 = importPreset(text);
  return {
    params: { a: r1.params, b: DEFAULT_B, c: DEFAULT_COSTS },
    applied: r1.applied,
    clamped: r1.clamped.length,
    ignored: r1.ignored.length,
    missing: total - r1.applied,
    version: 1,
  };
}

function importPartial(raw: unknown) {
  if (raw === undefined) return { params: DEFAULT_PARAMS, applied: 0, clamped: 0, ignored: 0 };
  try {
    const r = importPreset(JSON.stringify(raw));
    return { params: r.params, applied: r.applied, clamped: r.clamped.length, ignored: r.ignored.length };
  } catch {
    return { params: DEFAULT_PARAMS, applied: 0, clamped: 0, ignored: 1 };
  }
}
