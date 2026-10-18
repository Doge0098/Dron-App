// Aeródromos y helipuertos de España (dataset local de OurAirports) y sus zonas de protección
// según el art. 41 del Real Decreto 517/2024. Sirven de respaldo cuando las zonas oficiales de
// ENAIRE no están disponibles y para avisar de aeródromos cercanos.

import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import dataset from '../data/aerodromes-es.json';
import { AERODROME_ZONE_SPECS, type AerodromeZoneSpec } from '../data/regulations';
import {
  bearingDeg,
  circleRing,
  distanceToRingM,
  haversineM,
  pointInRing,
  ringsIntersect,
  runwayRectangle,
  type LngLatTuple,
  type Ring,
} from '../lib/geo';

export type AerodromeType = 'airport' | 'airfield' | 'heliport' | 'seaplane' | 'balloonport';

export interface Aerodrome {
  id: string;
  icao: string;
  name: string;
  type: AerodromeType;
  major: boolean;
  lat: number;
  lon: number;
  elevationFt: number | null;
  municipality: string;
  scheduled: boolean;
  /** Pistas como [lonA, latA, lonB, latB]. */
  runways: number[][];
}

export const AERODROMES = dataset.aerodromes as Aerodrome[];
export const AERODROMES_SOURCE = dataset.source;

export const AERODROME_TYPE_LABEL: Record<AerodromeType, string> = {
  airport: 'Aeropuerto',
  airfield: 'Aeródromo',
  heliport: 'Helipuerto',
  seaplane: 'Base de hidroaviones',
  balloonport: 'Base de globos',
};

/** Tipo de zona del art. 41 que corresponde (aproximación: el dataset no indica el uso público o restringido). */
export function zoneSpecFor(a: Aerodrome): AerodromeZoneSpec {
  if (a.type === 'heliport') return a.scheduled ? AERODROME_ZONE_SPECS.publicHeliport : AERODROME_ZONE_SPECS.restrictedHeliport;
  if (a.type === 'airport' || a.major) return AERODROME_ZONE_SPECS.publicAerodrome;
  return AERODROME_ZONE_SPECS.restrictedAerodrome;
}

export interface AerodromeZones {
  spec: AerodromeZoneSpec;
  inner: Ring[];
  outer: Ring[];
  /** Las pistas no constan en el dataset: zona aproximada con un círculo. */
  approximate: boolean;
}

const zoneCache = new Map<string, AerodromeZones>();

export function aerodromeZones(a: Aerodrome): AerodromeZones {
  const cached = zoneCache.get(a.id);
  if (cached) return cached;
  const spec = zoneSpecFor(a);
  const center: LngLatTuple = [a.lon, a.lat];
  let zones: AerodromeZones;
  if (spec.shape === 'circle') {
    zones = { spec, inner: [circleRing(center, spec.inner.beyondM, 48)], outer: [circleRing(center, spec.outer.beyondM, 48)], approximate: false };
  } else if (a.runways.length) {
    const rect = (v: { beyondM: number; sideM: number }) =>
      a.runways.map(([x1, y1, x2, y2]) => runwayRectangle([x1, y1], [x2, y2], v.beyondM, v.sideM));
    zones = { spec, inner: rect(spec.inner), outer: rect(spec.outer), approximate: false };
  } else {
    // Sin orientación de pista: círculo que cubre la prolongación del eje en cualquier dirección.
    zones = {
      spec,
      inner: [circleRing(center, spec.inner.beyondM + spec.assumedHalfRunwayM, 48)],
      outer: [circleRing(center, spec.outer.beyondM + spec.assumedHalfRunwayM, 48)],
      approximate: true,
    };
  }
  zoneCache.set(a.id, zones);
  return zones;
}

export type AerodromeRelation = 'inner' | 'outer' | null;

export interface NearbyAerodrome {
  aerodrome: Aerodrome;
  distanceM: number;
  bearing: number;
  relation: AerodromeRelation;
  zones: AerodromeZones;
  elevationM: number | null;
}

function relationTo(target: LngLatTuple | Ring, zones: AerodromeZones): AerodromeRelation {
  const isRing = Array.isArray(target[0]);
  const hits = (rings: Ring[]) =>
    rings.some((r) => (isRing ? ringsIntersect(target as Ring, r) : pointInRing(target as LngLatTuple, r)));
  if (hits(zones.inner)) return 'inner';
  if (hits(zones.outer)) return 'outer';
  return null;
}

/** Aeródromos a menos de `maxDistanceM` de un punto o del borde de una zona dibujada. */
export function findNearbyAerodromes(target: LngLatTuple | Ring, maxDistanceM = 15_000, limit = 8): NearbyAerodrome[] {
  const isRing = Array.isArray(target[0]);
  const ring = isRing ? (target as Ring) : null;
  const point = isRing ? null : (target as LngLatTuple);
  const results: NearbyAerodrome[] = [];
  for (const a of AERODROMES) {
    const pos: LngLatTuple = [a.lon, a.lat];
    const distanceM = ring ? distanceToRingM(pos, ring) : haversineM(point!, pos);
    if (distanceM > maxDistanceM) continue;
    const zones = aerodromeZones(a);
    results.push({
      aerodrome: a,
      distanceM,
      bearing: bearingDeg(point ?? ring![0], pos),
      relation: relationTo(target, zones),
      zones,
      elevationM: a.elevationFt != null ? Math.round(a.elevationFt * 0.3048) : null,
    });
  }
  const rank = (r: AerodromeRelation) => (r === 'inner' ? 2 : r === 'outer' ? 1 : 0);
  results.sort((x, y) => rank(y.relation) - rank(x.relation) || x.distanceM - y.distanceM);
  return results.slice(0, limit);
}

export function aerodromePoints(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: AERODROMES.map(
      (a): Feature<Point> => ({
        type: 'Feature',
        properties: { id: a.id, name: a.name, icao: a.icao, type: a.type, major: a.major },
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      }),
    ),
  };
}

/** Zonas de protección orientativas (volumen interior y exterior) para dibujarlas en el mapa. */
export function aerodromeZoneFeatures(): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  for (const a of AERODROMES) {
    const z = aerodromeZones(a);
    for (const [part, rings] of [
      ['outer', z.outer],
      ['inner', z.inner],
    ] as const) {
      for (const ring of rings) {
        features.push({
          type: 'Feature',
          properties: { id: a.id, part, type: a.type, major: a.major },
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
