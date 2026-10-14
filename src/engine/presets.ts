import type { DwellMode, LoadClass, PartId, ProcessParams } from '../types/simulation';
import { FIELD_BY_KEY, type NumKey } from './paramSchema';
import { DEFAULT_PARAMS } from './parts';

export const PRESET_VERSION = 1;

const PART_IDS: PartId[] = ['brocal_d400', 'tapa_c250', 'rejilla', 'registro', 'custom'];
const CLASSES: LoadClass[] = ['D400', 'C250', 'B125', 'MANUAL'];
const MODES: DwellMode[] = ['temperature', 'fixed'];

export function exportPreset(params: ProcessParams): string {
  return JSON.stringify(
    { app: 'planta-composite-sim', version: PRESET_VERSION, exportedAt: new Date().toISOString(), params },
    null,
    2,
  );
}

export interface ImportResult {
  params: ProcessParams;
  applied: number;
  clamped: string[];
  ignored: string[];
  missing: number;
}

/**
 * Valida un preset importado: solo acepta claves conocidas con el tipo correcto, limita los números
 * a sus rangos duros y completa lo que falte con los valores de fábrica. Lanza Error si no es un preset.
 */
export function importPreset(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('El JSON no contiene un preset.');
  const obj = raw as Record<string, unknown>;
  const src = (typeof obj.params === 'object' && obj.params !== null ? obj.params : obj) as Record<string, unknown>;

  const out: Record<string, unknown> = { ...DEFAULT_PARAMS };
  const clamped: string[] = [];
  const ignored: string[] = [];
  let applied = 0;

  for (const [key, val] of Object.entries(src)) {
    if (!(key in DEFAULT_PARAMS)) {
      ignored.push(key);
      continue;
    }
    const def = (DEFAULT_PARAMS as unknown as Record<string, unknown>)[key];
    if (typeof def === 'number') {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        ignored.push(key);
        continue;
      }
      const f = FIELD_BY_KEY.get(key as NumKey);
      let v = val;
      if (f) {
        v = Math.min(f.hard[1], Math.max(f.hard[0], f.int ? Math.round(val) : val));
        if (v !== val) clamped.push(key);
      }
      out[key] = v;
    } else if (typeof def === 'boolean') {
      if (typeof val !== 'boolean') {
        ignored.push(key);
        continue;
      }
      out[key] = val;
    } else if (key === 'partId' && PART_IDS.includes(val as PartId)) out[key] = val;
    else if (key === 'loadClass' && CLASSES.includes(val as LoadClass)) out[key] = val;
    else if (key === 'dwellMode' && MODES.includes(val as DwellMode)) out[key] = val;
    else {
      ignored.push(key);
      continue;
    }
    applied++;
  }
  if (applied === 0) throw new Error('No se reconoció ningún parámetro válido en el archivo.');
  return {
    params: out as unknown as ProcessParams,
    applied,
    clamped,
    ignored,
    missing: Object.keys(DEFAULT_PARAMS).length - applied,
  };
}
