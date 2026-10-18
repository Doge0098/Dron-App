// Índice geomagnético Kp (NOAA SWPC). Con Kp ≥ 5 la precisión GNSS puede degradarse.

import { fetchJson } from './http';

export interface KpEntry {
  time: number;
  kp: number;
  kind: 'observed' | 'estimated' | 'predicted';
}

interface RawKp {
  time_tag: string;
  kp: number;
  observed: string;
}

let cache: { at: number; data: Promise<KpEntry[]> } | null = null;

export function fetchKpForecast(): Promise<KpEntry[]> {
  if (cache && Date.now() - cache.at < 60 * 60_000) return cache.data;
  const data = fetchJson<RawKp[]>('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json').then(
    (rows) =>
      rows
        .filter((r) => r && typeof r.kp === 'number' && r.time_tag)
        .map((r) => ({
          time: Date.parse(`${r.time_tag}Z`) / 1000,
          kp: r.kp,
          kind: (['observed', 'estimated', 'predicted'].includes(r.observed) ? r.observed : 'predicted') as KpEntry['kind'],
        })),
  );
  cache = { at: Date.now(), data };
  data.catch(() => {
    cache = null;
  });
  return data;
}

/** Kp del intervalo de 3 h que contiene `time` (segundos UNIX). */
export function kpAt(entries: KpEntry[], time: number): KpEntry | null {
  let found: KpEntry | null = null;
  for (const e of entries) {
    if (e.time <= time) found = e;
    else break;
  }
  if (found && time - found.time > 3 * 3600) return null;
  return found;
}
