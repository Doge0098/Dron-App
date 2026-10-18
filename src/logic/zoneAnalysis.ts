// Análisis de una zona dibujada: tiempo en varios puntos de la zona, zonas UAS de ENAIRE que la
// intersecan y aeródromos cercanos.

import { compassPoint, ringAreaM2, samplePointsInRing, simplifyRing, type LngLatTuple } from '../lib/geo';
import { uvToWind, windToUV } from '../lib/wind';
import { findNearbyAerodromes, type NearbyAerodrome } from '../services/aerodromes';
import { queryZones, type ZoneQueryResult } from '../services/enaire';
import { WIND_HEIGHTS, fetchPointForecasts, type PointForecast } from '../services/openMeteo';
import type { DrawnZone } from '../types';

export interface ZoneAnalysis {
  samples: LngLatTuple[];
  /** Serie combinada "peor caso" de todas las muestras (viento máx., visibilidad mín., etc.). */
  forecast: PointForecast | null;
  forecastError: string | null;
  zones: ZoneQueryResult | null;
  zonesError: string | null;
  aerodromes: NearbyAerodrome[];
}

export function sampleCountForArea(areaM2: number): number {
  if (areaM2 < 1e6) return 1;
  if (areaM2 < 25e6) return 4;
  return 7;
}

/** Combina previsiones: peores valores y dirección media vectorial. */
export function combineForecasts(list: PointForecast[]): PointForecast | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const base = list[0];
  const n = base.hourly.time.length;
  const max = (pick: (f: PointForecast) => number[]) =>
    Array.from({ length: n }, (_, i) => Math.max(...list.map((f) => pick(f)[i]).filter(Number.isFinite)));
  const min = (pick: (f: PointForecast) => number[]) =>
    Array.from({ length: n }, (_, i) => Math.min(...list.map((f) => pick(f)[i]).filter(Number.isFinite)));
  const clean = (arr: number[]) => arr.map((v) => (Number.isFinite(v) ? v : NaN));
  const weatherSeverity = (code: number) => (code >= 95 ? 6 : code >= 71 && code <= 86 ? 5 : code >= 51 ? 4 : code >= 45 && code <= 48 ? 3 : code);
  const wind = Object.fromEntries(
    WIND_HEIGHTS.map((h) => {
      const speed = clean(max((f) => f.hourly.wind[h].speed));
      const dir = Array.from({ length: n }, (_, i) => {
        let u = 0;
        let v = 0;
        for (const f of list) {
          const s = f.hourly.wind[h].speed[i];
          const d = f.hourly.wind[h].dir[i];
          if (!Number.isFinite(s) || !Number.isFinite(d)) continue;
          const c = windToUV(s, d);
          u += c.u;
          v += c.v;
        }
        return u === 0 && v === 0 ? NaN : uvToWind(u, v).dirFrom;
      });
      return [h, { speed, dir }];
    }),
  ) as PointForecast['hourly']['wind'];
  return {
    ...base,
    hourly: {
      time: base.hourly.time,
      temperature: clean(min((f) => f.hourly.temperature)),
      humidity: clean(max((f) => f.hourly.humidity)),
      precipitation: clean(max((f) => f.hourly.precipitation)),
      precipitationProbability: clean(max((f) => f.hourly.precipitationProbability)),
      weatherCode: Array.from({ length: n }, (_, i) =>
        list.map((f) => f.hourly.weatherCode[i]).reduce((a, b) => (weatherSeverity(b) > weatherSeverity(a) ? b : a)),
      ),
      cloudCover: clean(max((f) => f.hourly.cloudCover)),
      visibility: clean(min((f) => f.hourly.visibility)),
      isDay: base.hourly.isDay,
      gusts: clean(max((f) => f.hourly.gusts)),
      wind,
    },
  };
}

/** Diferencia máxima de dirección del viento entre muestras (grados) a una hora dada. */
export function directionSpread(list: PointForecast[], index: number, height: (typeof WIND_HEIGHTS)[number]): number {
  const dirs = list.map((f) => f.hourly.wind[height].dir[index]).filter(Number.isFinite);
  let spread = 0;
  for (let a = 0; a < dirs.length; a++) {
    for (let b = a + 1; b < dirs.length; b++) {
      const d = Math.abs(dirs[a] - dirs[b]) % 360;
      spread = Math.max(spread, d > 180 ? 360 - d : d);
    }
  }
  return spread;
}

export async function analyzeZone(zone: DrawnZone, signal: AbortSignal): Promise<ZoneAnalysis & { raw: PointForecast[] }> {
  const samples = samplePointsInRing(zone.ring, sampleCountForArea(zone.areaM2));
  // Geometría ligera para la consulta a ENAIRE (≤ ~150 vértices).
  const sizeM = Math.sqrt(Math.max(ringAreaM2(zone.ring), 1));
  const queryRing = zone.ring.length > 150 ? simplifyRing(zone.ring, sizeM / 200) : zone.ring;

  const [forecastRes, zonesRes] = await Promise.allSettled([
    fetchPointForecasts(samples, signal),
    queryZones({ type: 'polygon', ring: queryRing }, undefined, { signal }),
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const raw = forecastRes.status === 'fulfilled' ? forecastRes.value : [];
  const forecastError =
    forecastRes.status === 'rejected'
      ? (forecastRes.reason as { status?: number }).status === 429
        ? 'Límite gratuito de Open-Meteo alcanzado. Inténtalo más tarde.'
        : 'No se pudo obtener la previsión de la zona.'
      : null;
  return {
    samples,
    raw,
    forecast: combineForecasts(raw),
    forecastError,
    zones: zonesRes.status === 'fulfilled' ? zonesRes.value : null,
    zonesError: zonesRes.status === 'rejected' ? 'No se pudieron consultar las zonas de ENAIRE.' : null,
    aerodromes: findNearbyAerodromes(zone.ring, 15_000, 8),
  };
}

export const describeWindFrom = (dir: number) => (Number.isFinite(dir) ? compassPoint(dir) : '—');
