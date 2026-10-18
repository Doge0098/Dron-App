// Búsqueda de lugares con Photon (https://photon.komoot.io), basado en OpenStreetMap.

import type { BBox, LngLatTuple } from '../lib/geo';
import { fetchJson } from './http';

export interface PlaceResult {
  id: string;
  name: string;
  detail: string;
  center: LngLatTuple;
  bbox?: BBox;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    extent?: [number, number, number, number];
    osm_value?: string;
  };
}

// España peninsular, Baleares, Canarias, Ceuta y Melilla.
const SPAIN_BBOX = '-18.5,27.4,4.6,44.1';

/** Admite coordenadas escritas a mano: "40.4168, -3.7038" (lat, lon). */
export function parseCoordinates(text: string): LngLatTuple | null {
  const m = text.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lon = Number(m[2].replace(',', '.'));
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

/** Nombre aproximado del lugar (municipio, provincia) para un punto. */
export async function reversePlace(point: LngLatTuple, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ lon: point[0].toFixed(5), lat: point[1].toFixed(5), limit: '1' });
  const data = await fetchJson<{ features: PhotonFeature[] }>(`https://photon.komoot.io/reverse?${params}`, {
    signal,
    timeoutMs: 8000,
  });
  const p = data.features[0]?.properties;
  if (!p) return null;
  const parts = [p.name && p.name !== p.city ? p.name : null, p.city, p.state ?? p.county].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const coords = parseCoordinates(query);
  if (coords) {
    return [{ id: 'coords', name: `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`, detail: 'Coordenadas', center: coords }];
  }
  const params = new URLSearchParams({ q: query, limit: '7', bbox: SPAIN_BBOX });
  const data = await fetchJson<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?${params}`, {
    signal,
    timeoutMs: 8000,
  });
  return data.features.map((f, i) => {
    const p = f.properties;
    const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || 'Sin nombre';
    const detail = [p.city, p.county, p.state].filter((x, idx, arr) => x && x !== name && arr.indexOf(x) === idx).join(', ');
    // Photon devuelve extent como [oeste, norte, este, sur].
    const bbox: BBox | undefined = p.extent ? [p.extent[0], p.extent[3], p.extent[2], p.extent[1]] : undefined;
    return { id: `${p.osm_type ?? ''}${p.osm_id ?? i}`, name, detail, center: f.geometry.coordinates, bbox };
  });
}
