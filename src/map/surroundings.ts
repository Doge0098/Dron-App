// Detección aproximada del entorno a partir de las teselas vectoriales ya cargadas (OpenStreetMap vía
// OpenFreeMap): edificios y suelo urbano (art. 40 RD 517/2024), carreteras y vías férreas (art. 39) y
// espacios protegidos. Completa las capas de ENAIRE, que no delimitan los núcleos urbanos y aún no
// incluyen todas las infraestructuras.

import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJsonProperties, Geometry, Position } from 'geojson';

type VectorFeature = { geometry: Geometry; properties: GeoJsonProperties };
import { distanceToLineM, lineIntersectsRing, pointInRing, ringBBox, type LngLatTuple, type Ring } from '../lib/geo';

export interface Surroundings {
  /** Hay datos vectoriales y el zoom permite ver edificios. */
  available: boolean;
  zoom: number;
  buildings: number;
  urbanLanduse: string[];
  places: string[];
  roads: string[];
  railways: number;
  protectedAreas: { name: string; kind: 'national_park' | 'protected' }[];
}

const SOURCE = 'openmaptiles';
const URBAN_LANDUSE = new Set(['residential', 'commercial', 'industrial', 'retail']);
const URBAN_PLACES = new Set(['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood']);
const MAJOR_ROADS: Record<string, string> = {
  motorway: 'autopista/autovía',
  trunk: 'vía rápida',
  primary: 'carretera principal',
  secondary: 'carretera secundaria',
  tertiary: 'carretera local',
};
/** Distancias del art. 39 (+ margen) para el análisis de un punto. */
const NEAR_LINEAR_M = 30;
const NEAR_BUILDING_M = 60;

const ROAD_LABELS = new Set(Object.values(MAJOR_ROADS));

function rings(f: VectorFeature): Position[][] {
  const g = f.geometry;
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

function lines(f: VectorFeature): Position[][] {
  const g = f.geometry;
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}

export function detectSurroundings(map: MapLibreMap, target: LngLatTuple | Ring): Surroundings {
  const zoom = map.getZoom();
  const empty: Surroundings = {
    available: false,
    zoom,
    buildings: 0,
    urbanLanduse: [],
    places: [],
    roads: [],
    railways: 0,
    protectedAreas: [],
  };
  if (!map.getSource(SOURCE)) return empty;
  const isRing = Array.isArray(target[0]);
  const ring = isRing ? (target as Ring) : null;
  const point = isRing ? null : (target as LngLatTuple);
  const [w, s, e, n] = ring ? ringBBox(ring) : [point![0], point![1], point![0], point![1]];
  const pad = ring ? 0 : 0.002;
  const inBox = (p: Position) => p[0] >= w - pad && p[0] <= e + pad && p[1] >= s - pad && p[1] <= n + pad;

  const query = (sourceLayer: string): VectorFeature[] => {
    try {
      return map.querySourceFeatures(SOURCE, { sourceLayer }) as unknown as VectorFeature[];
    } catch {
      return [];
    }
  };

  const result: Surroundings = { ...empty, available: zoom >= 13 };

  // Edificios: dentro de la zona o a < 60 m del punto.
  let buildings = 0;
  for (const f of query('building')) {
    const outer = rings(f)[0];
    if (!outer?.length || !outer.some(inBox)) continue;
    const hit = ring
      ? outer.some((p) => pointInRing(p as LngLatTuple, ring))
      : pointInRing(point!, outer as Ring) || distanceToLineM(point!, outer as LngLatTuple[]) <= NEAR_BUILDING_M;
    if (hit && ++buildings >= 500) break;
  }
  result.buildings = buildings;

  const landuse = new Set<string>();
  for (const f of query('landuse')) {
    const cls = String(f.properties?.class ?? '');
    if (!URBAN_LANDUSE.has(cls)) continue;
    const outer = rings(f)[0] as Ring | undefined;
    if (!outer?.length) continue;
    const hit = ring ? outer.some((p) => pointInRing(p, ring)) || pointInRing(ring[0], outer) : pointInRing(point!, outer);
    if (hit) landuse.add(cls);
  }
  result.urbanLanduse = [...landuse];

  const places = new Set<string>();
  for (const f of query('place')) {
    if (!URBAN_PLACES.has(String(f.properties?.class ?? '')) || f.geometry.type !== 'Point') continue;
    const p = f.geometry.coordinates as LngLatTuple;
    if (ring ? pointInRing(p, ring) : false) places.add(String(f.properties?.['name:es'] ?? f.properties?.name ?? ''));
  }
  result.places = [...places].filter(Boolean).slice(0, 5);

  const roads = new Set<string>();
  let railways = 0;
  for (const f of query('transportation')) {
    const cls = String(f.properties?.class ?? '');
    const isRail = cls === 'rail' || cls === 'transit';
    if (!isRail && !MAJOR_ROADS[cls]) continue;
    for (const line of lines(f)) {
      if (!line.some(inBox) && !ring) continue;
      const hit = ring
        ? lineIntersectsRing(line as LngLatTuple[], ring)
        : distanceToLineM(point!, line as LngLatTuple[]) <= NEAR_LINEAR_M;
      if (!hit) continue;
      if (isRail) railways++;
      else roads.add(MAJOR_ROADS[cls]);
      break;
    }
  }
  result.roads = [...roads].filter((r) => ROAD_LABELS.has(r));
  result.railways = railways;

  const parks = new Map<string, 'national_park' | 'protected'>();
  for (const f of query('park')) {
    const cls = String(f.properties?.class ?? '');
    const outer = rings(f)[0] as Ring | undefined;
    if (!outer?.length) continue;
    const hit = ring ? ringsOverlap(ring, outer) : pointInRing(point!, outer);
    if (!hit) continue;
    const name = String(f.properties?.['name:es'] ?? f.properties?.name ?? 'Espacio protegido');
    const kind = cls === 'national_park' || /parque nacional/i.test(name) ? 'national_park' : 'protected';
    if (parks.get(name) !== 'national_park') parks.set(name, kind);
  }
  result.protectedAreas = [...parks].map(([name, kind]) => ({ name, kind })).slice(0, 4);
  return result;
}

function ringsOverlap(a: Ring, b: Ring): boolean {
  return a.some((p) => pointInRing(p, b)) || b.some((p) => pointInRing(p, a));
}

/** Espera a que el mapa termine de cargar teselas (p. ej. tras volar a un lugar) antes de detectar. */
export function detectSurroundingsWhenIdle(map: MapLibreMap, target: LngLatTuple | Ring): Promise<Surroundings> {
  return new Promise((resolve) => {
    const run = () => resolve(detectSurroundings(map, target));
    if (!map.isMoving() && map.areTilesLoaded()) run();
    else map.once('idle', run);
  });
}
