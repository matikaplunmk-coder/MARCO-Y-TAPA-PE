export function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtMinSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const STOPS: [number, [number, number, number]][] = [
  [30, [59, 130, 246]],
  [50, [34, 197, 94]],
  [80, [132, 204, 22]],
  [110, [234, 179, 8]],
  [150, [249, 115, 22]],
  [195, [239, 68, 68]],
];

/** Escala de color por temperatura: azul (<30 °C) → verde (50 °C) → amarillo → naranja → rojo (≥195 °C) */
export function tempColor(tC: number): string {
  if (tC <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`;
  for (let i = 1; i < STOPS.length; i++) {
    if (tC <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (tC - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * f)).join(',')})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`;
}

export const STAGE_LABEL: Record<string, string> = {
  WAIT_PRESS: 'En cola para prensa',
  LOADING: 'Carga de masa (mesa lanzadera)',
  PRESSING: 'Prensado + enroscado de pasadores',
  OPENING: 'Apertura de prensa',
  WAIT_CRANE_IN: 'Esperando grúa (prensa retenida)',
  CRANE_IN: 'Grúa → batea',
  COOLING: 'Enfriando en batea',
  WAIT_CRANE_OUT: 'Enfriado, esperando grúa',
  CRANE_OUT: 'Grúa → desmoldeo',
  WAIT_DEMOLD: 'Esperando estación de desmoldeo',
  DEMOLD: 'Desenroscado y desmoldeo',
  RETURN: 'Retorno de molde vacío',
};
