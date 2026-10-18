// Radar de precipitación de RainViewer (https://www.rainviewer.com/api.html).
// La API pública gratuita ofrece ~2 h de imágenes pasadas cada 10 min y teselas hasta zoom 7.

import { fetchJson } from './http';

export interface RadarFrame {
  time: number;
  tileUrl: string;
}

interface RainViewerMaps {
  host: string;
  radar: { past: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] };
}

export const RADAR_MAX_ZOOM = 7;

export async function fetchRadarFrames(signal?: AbortSignal): Promise<RadarFrame[]> {
  const data = await fetchJson<RainViewerMaps>('https://api.rainviewer.com/public/weather-maps.json', { signal });
  const frames = [...data.radar.past, ...(data.radar.nowcast ?? [])];
  // Esquema de color 2 ("Universal Blue"), suavizado y nieve diferenciada.
  return frames.map((f) => ({ time: f.time, tileUrl: `${data.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png` }));
}
