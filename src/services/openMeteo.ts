// Cliente de Open-Meteo (https://open-meteo.com): previsión horaria gratuita, sin clave y con CORS.
// Se usa para el punto consultado, las muestras de una zona dibujada y la malla de viento del mapa.

import type { BBox, LngLatTuple } from '../lib/geo';
import { windToUV } from '../lib/wind';
import { fetchJson } from './http';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

export const WIND_HEIGHTS = [10, 80, 120] as const;
export type WindHeight = (typeof WIND_HEIGHTS)[number];

export interface WindSeries {
  speed: number[];
  dir: number[];
}

export interface HourlySeries {
  time: number[];
  temperature: number[];
  humidity: number[];
  precipitation: number[];
  precipitationProbability: number[];
  weatherCode: number[];
  cloudCover: number[];
  visibility: number[];
  isDay: number[];
  gusts: number[];
  wind: Record<WindHeight, WindSeries>;
}

export interface PointForecast {
  lat: number;
  lon: number;
  elevation: number;
  hourly: HourlySeries;
  daily: { time: number[]; sunrise: number[]; sunset: number[] };
  fetchedAt: number;
}

/** Valores de una hora concreta. */
export interface HourWeather {
  time: number;
  temperature: number;
  humidity: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode: number;
  cloudCover: number;
  visibility: number;
  isDay: boolean;
  gusts: number;
  wind: Record<WindHeight, { speed: number; dir: number }>;
}

type RawSeries = Record<string, (number | null)[]>;
interface RawLocation {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: RawSeries & { time: number[] };
  daily?: RawSeries & { time: number[] };
}

const POINT_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'cloud_cover',
  'visibility',
  'is_day',
  'wind_gusts_10m',
  ...WIND_HEIGHTS.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
];

const GRID_VARIABLES = [
  ...WIND_HEIGHTS.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
  'wind_gusts_10m',
  'precipitation',
  'snowfall',
  'weather_code',
];

const num = (values: (number | null)[] | undefined, length: number): number[] =>
  Array.from({ length }, (_, i) => {
    const v = values?.[i];
    return v == null ? NaN : v;
  });

const coord = (v: number) => v.toFixed(4);

function buildUrl(points: LngLatTuple[], variables: string[], extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    latitude: points.map((p) => coord(p[1])).join(','),
    longitude: points.map((p) => coord(p[0])).join(','),
    hourly: variables.join(','),
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
    timezone: 'GMT',
    forecast_days: '3',
    ...extra,
  });
  return `${BASE_URL}?${params.toString()}`;
}

function parsePoint(raw: RawLocation): PointForecast {
  const h = raw.hourly;
  const n = h.time.length;
  const wind = Object.fromEntries(
    WIND_HEIGHTS.map((height) => [
      height,
      { speed: num(h[`wind_speed_${height}m`], n), dir: num(h[`wind_direction_${height}m`], n) },
    ]),
  ) as Record<WindHeight, WindSeries>;
  const d = raw.daily;
  return {
    lat: raw.latitude,
    lon: raw.longitude,
    elevation: raw.elevation,
    hourly: {
      time: h.time,
      temperature: num(h.temperature_2m, n),
      humidity: num(h.relative_humidity_2m, n),
      precipitation: num(h.precipitation, n),
      precipitationProbability: num(h.precipitation_probability, n),
      weatherCode: num(h.weather_code, n),
      cloudCover: num(h.cloud_cover, n),
      visibility: num(h.visibility, n),
      isDay: num(h.is_day, n),
      gusts: num(h.wind_gusts_10m, n),
      wind,
    },
    daily: {
      time: d?.time ?? [],
      sunrise: num(d?.sunrise, d?.time.length ?? 0),
      sunset: num(d?.sunset, d?.time.length ?? 0),
    },
    fetchedAt: Date.now(),
  };
}

const POINT_TTL_MS = 15 * 60_000;
const pointCache = new Map<string, Promise<PointForecast>>();
const pointCacheTime = new Map<string, number>();

/** Previsión horaria (3 días) para uno o varios puntos en una sola petición. */
export async function fetchPointForecasts(points: LngLatTuple[], signal?: AbortSignal): Promise<PointForecast[]> {
  const url = buildUrl(points, POINT_VARIABLES, { daily: 'sunrise,sunset' });
  const raw = await fetchJson<RawLocation | RawLocation[]>(url, { signal });
  return (Array.isArray(raw) ? raw : [raw]).map(parsePoint);
}

/** Previsión de un punto con caché de 15 min (redondeo a ~100 m). */
export function fetchPointForecast(point: LngLatTuple, signal?: AbortSignal): Promise<PointForecast> {
  const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
  const cachedAt = pointCacheTime.get(key);
  const cached = pointCache.get(key);
  if (cached && cachedAt && Date.now() - cachedAt < POINT_TTL_MS) return cached;
  const promise = fetchPointForecasts([point], signal).then((r) => r[0]);
  pointCache.set(key, promise);
  pointCacheTime.set(key, Date.now());
  promise.catch(() => {
    pointCache.delete(key);
    pointCacheTime.delete(key);
  });
  return promise;
}

/** Índice de la hora más cercana a `time` (segundos UNIX). */
export function nearestHourIndex(times: number[], time: number): number {
  if (times.length === 0) return -1;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i] - time);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export function hourAt(forecast: PointForecast, index: number): HourWeather | null {
  const h = forecast.hourly;
  if (index < 0 || index >= h.time.length) return null;
  const wind = Object.fromEntries(
    WIND_HEIGHTS.map((height) => [height, { speed: h.wind[height].speed[index], dir: h.wind[height].dir[index] }]),
  ) as HourWeather['wind'];
  return {
    time: h.time[index],
    temperature: h.temperature[index],
    humidity: h.humidity[index],
    precipitation: h.precipitation[index],
    precipitationProbability: h.precipitationProbability[index],
    weatherCode: h.weatherCode[index],
    cloudCover: h.cloudCover[index],
    visibility: h.visibility[index],
    isDay: h.isDay[index] === 1,
    gusts: h.gusts[index],
    wind,
  };
}

// ---------------------------------------------------------------------------
// Malla de viento/precipitación para la animación del mapa
// ---------------------------------------------------------------------------

const GRID_STEPS = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];

export interface GridPlan {
  step: number;
  i0: number;
  j0: number;
  cols: number;
  rows: number;
}

/** Elige el paso (en grados) para que la malla tenga como mucho `maxPerAxis` nodos por eje. */
export function planGrid(bounds: BBox, maxPerAxis = 8): GridPlan {
  let [w, s, e, n] = bounds;
  s = Math.max(s, -80);
  n = Math.min(n, 80);
  for (const step of GRID_STEPS) {
    const i0 = Math.floor(w / step);
    const i1 = Math.max(Math.ceil(e / step), i0 + 1);
    const j0 = Math.floor(s / step);
    const j1 = Math.max(Math.ceil(n / step), j0 + 1);
    if (i1 - i0 + 1 <= maxPerAxis && j1 - j0 + 1 <= maxPerAxis) {
      return { step, i0, j0, cols: i1 - i0 + 1, rows: j1 - j0 + 1 };
    }
  }
  // Vista muy amplia: malla del paso mayor centrada en la vista.
  const step = GRID_STEPS[GRID_STEPS.length - 1];
  const ci = Math.round((w + e) / 2 / step);
  const cj = Math.round((s + n) / 2 / step);
  const half = Math.floor(maxPerAxis / 2);
  return { step, i0: ci - half, j0: cj - half, cols: maxPerAxis, rows: maxPerAxis };
}

interface NodeSeries {
  time: number[];
  speed: Record<WindHeight, number[]>;
  dir: Record<WindHeight, number[]>;
  gust: number[];
  precip: number[];
  snow: number[];
  code: number[];
}

export interface WindGrid extends GridPlan {
  lon0: number;
  lat0: number;
  times: number[];
  /** Fila mayor: índice = j * cols + i (j hacia el norte). `null` si falta el nodo. */
  nodes: (NodeSeries | null)[];
}

/** Campo instantáneo (una hora y una altura) listo para interpolar. */
export interface WindField {
  lon0: number;
  lat0: number;
  step: number;
  cols: number;
  rows: number;
  time: number;
  height: WindHeight;
  u: Float32Array;
  v: Float32Array;
  speed: Float32Array;
  dir: Float32Array;
  gust: Float32Array;
  precip: Float32Array;
  snow: Float32Array;
  code: Int16Array;
}

const GRID_TTL_MS = 30 * 60_000;
const MAX_POINTS_PER_REQUEST = 64;

export class WeatherGridService {
  private cache = new Map<string, { at: number; data: NodeSeries }>();

  private key(step: number, i: number, j: number) {
    return `${step}:${i}:${j}`;
  }

  async load(bounds: BBox, signal?: AbortSignal, maxPerAxis = 8): Promise<WindGrid> {
    const plan = planGrid(bounds, maxPerAxis);
    const { step, i0, j0, cols, rows } = plan;
    const missing: { key: string; point: LngLatTuple }[] = [];
    const now = Date.now();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const key = this.key(step, i0 + i, j0 + j);
        const hit = this.cache.get(key);
        if (!hit || now - hit.at > GRID_TTL_MS) {
          missing.push({ key, point: [(i0 + i) * step, (j0 + j) * step] });
        }
      }
    }
    for (let k = 0; k < missing.length; k += MAX_POINTS_PER_REQUEST) {
      const chunk = missing.slice(k, k + MAX_POINTS_PER_REQUEST);
      const url = buildUrl(
        chunk.map((c) => c.point),
        GRID_VARIABLES,
      );
      const raw = await fetchJson<RawLocation | RawLocation[]>(url, { signal, timeoutMs: 20_000 });
      const list = Array.isArray(raw) ? raw : [raw];
      list.forEach((loc, idx) => {
        const h = loc.hourly;
        const n = h.time.length;
        const data: NodeSeries = {
          time: h.time,
          speed: Object.fromEntries(WIND_HEIGHTS.map((ht) => [ht, num(h[`wind_speed_${ht}m`], n)])) as NodeSeries['speed'],
          dir: Object.fromEntries(WIND_HEIGHTS.map((ht) => [ht, num(h[`wind_direction_${ht}m`], n)])) as NodeSeries['dir'],
          gust: num(h.wind_gusts_10m, n),
          precip: num(h.precipitation, n),
          snow: num(h.snowfall, n),
          code: num(h.weather_code, n),
        };
        this.cache.set(chunk[idx].key, { at: Date.now(), data });
      });
    }
    const nodes: (NodeSeries | null)[] = [];
    let times: number[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const data = this.cache.get(this.key(step, i0 + i, j0 + j))?.data ?? null;
        if (data && data.time.length > times.length) times = data.time;
        nodes.push(data);
      }
    }
    return { ...plan, lon0: i0 * step, lat0: j0 * step, times, nodes };
  }
}

/** Extrae el campo de viento para una hora y altura concretas. */
export function buildField(grid: WindGrid, time: number, height: WindHeight): WindField {
  const n = grid.cols * grid.rows;
  const field: WindField = {
    lon0: grid.lon0,
    lat0: grid.lat0,
    step: grid.step,
    cols: grid.cols,
    rows: grid.rows,
    time,
    height,
    u: new Float32Array(n),
    v: new Float32Array(n),
    speed: new Float32Array(n),
    dir: new Float32Array(n),
    gust: new Float32Array(n),
    precip: new Float32Array(n),
    snow: new Float32Array(n),
    code: new Int16Array(n),
  };
  for (let k = 0; k < n; k++) {
    const node = grid.nodes[k];
    if (!node) {
      field.speed[k] = NaN;
      continue;
    }
    const idx = nearestHourIndex(node.time, time);
    const speed = node.speed[height][idx];
    const dir = node.dir[height][idx];
    const ok = Number.isFinite(speed) && Number.isFinite(dir);
    const { u, v } = ok ? windToUV(speed, dir) : { u: 0, v: 0 };
    field.u[k] = u;
    field.v[k] = v;
    field.speed[k] = ok ? speed : NaN;
    field.dir[k] = ok ? dir : NaN;
    field.gust[k] = node.gust[idx];
    field.precip[k] = Number.isFinite(node.precip[idx]) ? node.precip[idx] : 0;
    field.snow[k] = Number.isFinite(node.snow[idx]) ? node.snow[idx] : 0;
    field.code[k] = Number.isFinite(node.code[idx]) ? node.code[idx] : -1;
  }
  return field;
}

export interface FieldSample {
  u: number;
  v: number;
  speed: number;
  precip: number;
  snow: number;
}

/** Interpolación bilineal del campo; `null` fuera de la malla. */
export function sampleField(field: WindField, lon: number, lat: number, out?: FieldSample): FieldSample | null {
  const x = (lon - field.lon0) / field.step;
  const y = (lat - field.lat0) / field.step;
  if (x < 0 || y < 0 || x > field.cols - 1 || y > field.rows - 1) return null;
  const i = Math.min(Math.floor(x), field.cols - 2);
  const j = Math.min(Math.floor(y), field.rows - 2);
  const fx = x - i;
  const fy = y - j;
  const k00 = j * field.cols + i;
  const k10 = k00 + 1;
  const k01 = k00 + field.cols;
  const k11 = k01 + 1;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const lerp = (a: Float32Array) => a[k00] * w00 + a[k10] * w10 + a[k01] * w01 + a[k11] * w11;
  const res = out ?? { u: 0, v: 0, speed: 0, precip: 0, snow: 0 };
  res.u = lerp(field.u);
  res.v = lerp(field.v);
  res.speed = Math.hypot(res.u, res.v);
  res.precip = lerp(field.precip);
  res.snow = lerp(field.snow);
  return res;
}

export function fieldBBox(field: Pick<WindField, 'lon0' | 'lat0' | 'step' | 'cols' | 'rows'>): BBox {
  return [
    field.lon0,
    field.lat0,
    field.lon0 + (field.cols - 1) * field.step,
    field.lat0 + (field.rows - 1) * field.step,
  ];
}
