// Conversión y clasificación del viento.
// Convención meteorológica: la dirección indica DE DÓNDE viene el viento (0° = viento del norte).

import { compassName, compassPoint, normalizeDeg, toRad, toDeg } from './geo';

/** Componentes del flujo en m/s: u hacia el este, v hacia el norte (hacia donde SOPLA). */
export function windToUV(speed: number, dirFromDeg: number): { u: number; v: number } {
  const θ = toRad(dirFromDeg);
  return { u: -speed * Math.sin(θ), v: -speed * Math.cos(θ) };
}

export function uvToWind(u: number, v: number): { speed: number; dirFrom: number } {
  const speed = Math.hypot(u, v);
  if (speed < 1e-6) return { speed: 0, dirFrom: 0 };
  return { speed, dirFrom: normalizeDeg(toDeg(Math.atan2(-u, -v))) };
}

/** Dirección hacia la que sopla el viento. */
export const dirTowards = (dirFromDeg: number) => normalizeDeg(dirFromDeg + 180);

export const msToKmh = (ms: number) => ms * 3.6;
export const msToKnots = (ms: number) => ms * 1.943844;

const BEAUFORT: { max: number; name: string }[] = [
  { max: 0.3, name: 'Calma' },
  { max: 1.6, name: 'Ventolina' },
  { max: 3.4, name: 'Flojito' },
  { max: 5.5, name: 'Flojo' },
  { max: 8.0, name: 'Bonancible' },
  { max: 10.8, name: 'Fresquito' },
  { max: 13.9, name: 'Fresco' },
  { max: 17.2, name: 'Frescachón' },
  { max: 20.8, name: 'Temporal' },
  { max: 24.5, name: 'Temporal fuerte' },
  { max: 28.5, name: 'Temporal duro' },
  { max: 32.7, name: 'Temporal muy duro' },
  { max: Infinity, name: 'Temporal huracanado' },
];

export function beaufort(speedMs: number): { force: number; name: string } {
  const force = BEAUFORT.findIndex((b) => speedMs < b.max);
  return { force, name: BEAUFORT[force].name };
}

/** Texto descriptivo: "del NO (315°) → sopla hacia el sudeste". */
export function describeDirection(dirFromDeg: number): string {
  const from = compassPoint(dirFromDeg);
  return `del ${from} (${Math.round(normalizeDeg(dirFromDeg))}°), sopla hacia el ${compassName(dirTowards(dirFromDeg))}`;
}

export interface WindLevel {
  heightM: number;
  speed: number;
  dirFrom: number;
}

/**
 * Viento a una altura dada interpolando entre niveles (10, 80, 120 m…).
 * Velocidad: interpolación en ln(z) (perfil logarítmico); dirección: por componentes u/v.
 */
export function windAtHeight(levels: WindLevel[], heightM: number): { speed: number; dirFrom: number } {
  const valid = levels
    .filter((l) => Number.isFinite(l.speed) && Number.isFinite(l.dirFrom))
    .sort((a, b) => a.heightM - b.heightM);
  if (valid.length === 0) return { speed: NaN, dirFrom: NaN };
  if (heightM <= valid[0].heightM) return { speed: valid[0].speed, dirFrom: valid[0].dirFrom };
  const top = valid[valid.length - 1];
  if (heightM >= top.heightM) return { speed: top.speed, dirFrom: top.dirFrom };
  const i = valid.findIndex((l) => l.heightM >= heightM);
  const lo = valid[i - 1];
  const hi = valid[i];
  const t = (Math.log(heightM) - Math.log(lo.heightM)) / (Math.log(hi.heightM) - Math.log(lo.heightM));
  const a = windToUV(1, lo.dirFrom);
  const b = windToUV(1, hi.dirFrom);
  const dir = uvToWind(a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t).dirFrom;
  return { speed: lo.speed + (hi.speed - lo.speed) * t, dirFrom: dir };
}

/** Rampa de color por velocidad del viento (m/s), compartida por partículas, flechas y leyenda. */
export const WIND_COLOR_STOPS: [number, string][] = [
  [0, '#7dd3fc'],
  [3, '#38bdf8'],
  [6, '#4ade80'],
  [9, '#facc15'],
  [12, '#fb923c'],
  [15, '#ef4444'],
  [20, '#c026d3'],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function windColor(speedMs: number): string {
  const stops = WIND_COLOR_STOPS;
  if (!(speedMs > stops[0][0])) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (speedMs <= stops[i][0]) {
      const [s0, c0] = stops[i - 1];
      const [s1, c1] = stops[i];
      const t = (speedMs - s0) / (s1 - s0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      const mix = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
    }
  }
  return stops[stops.length - 1][1];
}

/** Expresión de MapLibre equivalente a `windColor` para la propiedad `speed`. */
export function windColorExpression(property = 'speed'): unknown[] {
  return ['interpolate', ['linear'], ['get', property], ...WIND_COLOR_STOPS.flat()];
}
