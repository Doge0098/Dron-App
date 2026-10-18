import type { LngLatTuple } from './lib/geo';
import type { DrawnShape } from './map/DrawController';

export type Basemap = 'vector' | 'satellite';

export interface LayerToggles {
  wind: boolean;
  arrows: boolean;
  rain: boolean;
  radar: boolean;
  zones: boolean;
  aerodromes: boolean;
  terrain: boolean;
  buildings: boolean;
}

export const DEFAULT_LAYERS: LayerToggles = {
  wind: true,
  arrows: true,
  rain: true,
  radar: false,
  zones: true,
  aerodromes: true,
  terrain: true,
  buildings: true,
};

export interface DrawnZone extends DrawnShape {
  id: string;
  centroid: LngLatTuple;
  areaM2: number;
  perimeterM: number;
}

export type ZonesStatus = 'idle' | 'loading' | 'ok' | 'partial' | 'unavailable' | 'zoom';

export interface MapStatus {
  weatherLoading: boolean;
  weatherError: string | null;
  zones: ZonesStatus;
  zoneCount: number;
}
