// Estilos base del mapa. Todo sin claves de API:
//  - Vectorial: OpenFreeMap "Liberty" (datos OpenStreetMap), con edificios 3D.
//  - Satélite: ortofoto PNOA del Instituto Geográfico Nacional + rótulos de OpenFreeMap.
//  - Relieve 3D: Terrain Tiles de Mapzen en AWS Open Data (codificación Terrarium).

import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Basemap } from '../types';

const LIBERTY_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const TERRARIUM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_ATTRIBUTION =
  '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Relieve: Mapzen Terrain Tiles</a>';

const ign = (service: string, layer: string, format: string) =>
  `https://www.ign.es/wmts/${service}?request=GetTile&service=WMTS&VERSION=1.0.0&Layer=${layer}&Style=default&Format=${format}&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}`;

const PNOA_TILES = ign('pnoa-ma', 'OI.OrthoimageCoverage', 'image/jpeg');
const IGN_BASE_TILES = ign('ign-base', 'IGNBaseTodo', 'image/png');
const IGN_ATTRIBUTION = '<a href="https://www.scne.es/" target="_blank" rel="noopener">© Instituto Geográfico Nacional (CC BY 4.0)</a>';
/** España peninsular, Baleares, Canarias, Ceuta y Melilla: evita pedir teselas PNOA fuera de cobertura. */
const SPAIN_BOUNDS: [number, number, number, number] = [-18.6, 27.4, 4.7, 44.1];

export type BaseStyles = Record<Basemap, StyleSpecification>;

function satelliteFrom(liberty: StyleSpecification): StyleSpecification {
  const keep = new Set(['natural_earth', 'boundary_3', 'boundary_2', 'building-3d']);
  const labels = liberty.layers.filter(
    (l) => keep.has(l.id) || (l.type === 'symbol' && !l.id.startsWith('poi') && !l.id.startsWith('road_one_way')),
  );
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1220' } },
    ...labels.filter((l) => l.id === 'natural_earth'),
    { id: 'pnoa', type: 'raster', source: 'pnoa', paint: { 'raster-fade-duration': 150 } },
    ...labels
      .filter((l) => l.id !== 'natural_earth')
      .map((l): LayerSpecification => {
        if (l.type === 'symbol') {
          return {
            ...l,
            paint: { ...l.paint, 'text-color': '#f8fafc', 'text-halo-color': 'rgba(2, 6, 23, 0.85)', 'text-halo-width': 1.4 },
          };
        }
        if (l.id.startsWith('boundary')) return { ...l, paint: { ...l.paint, 'line-color': 'rgba(255,255,255,0.55)' } } as LayerSpecification;
        if (l.type === 'fill-extrusion') return { ...l, paint: { ...l.paint, 'fill-extrusion-opacity': 0.65 } };
        return l;
      }),
  ];
  return {
    ...liberty,
    name: 'Satélite PNOA',
    sources: {
      ...liberty.sources,
      pnoa: {
        type: 'raster',
        tiles: [PNOA_TILES],
        tileSize: 256,
        maxzoom: 19,
        bounds: SPAIN_BOUNDS,
        attribution: `PNOA ${IGN_ATTRIBUTION}`,
      },
    },
    layers,
  };
}

/** Estilo de reserva (solo teselas raster del IGN) por si OpenFreeMap no responde. */
function fallbackStyles(): BaseStyles {
  const base = (id: string, tiles: string): StyleSpecification => ({
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { [id]: { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom: 19, bounds: SPAIN_BOUNDS, attribution: IGN_ATTRIBUTION } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#dfe7ee' } },
      { id, type: 'raster', source: id },
    ],
  });
  return { vector: base('ign-base', IGN_BASE_TILES), satellite: base('pnoa', PNOA_TILES) };
}

/**
 * Ajustes al estilo Liberty para España: quita los escudos de carreteras de EE. UU. y evita los avisos
 * de MapLibre por comparar `ref_length` nulo en los filtros de los escudos.
 */
function adaptLiberty(style: StyleSpecification): StyleSpecification {
  const fixFilter = (node: unknown): unknown => {
    if (!Array.isArray(node)) return node;
    if (node[0] === '<=' && Array.isArray(node[1]) && node[1][0] === 'get' && node[1][1] === 'ref_length') {
      return ['<=', ['coalesce', ['get', 'ref_length'], 99], node[2]];
    }
    return node.map(fixFilter);
  };
  return {
    ...style,
    layers: style.layers
      .filter((l) => l.id !== 'highway-shield-us-interstate' && l.id !== 'road_shield_us')
      .map((l) => ('filter' in l && l.filter ? ({ ...l, filter: fixFilter(l.filter) } as LayerSpecification) : l)),
  };
}

export async function loadBaseStyles(): Promise<BaseStyles> {
  try {
    const res = await fetch(LIBERTY_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const liberty = adaptLiberty((await res.json()) as StyleSpecification);
    return { vector: { ...liberty, name: 'Mapa' }, satellite: satelliteFrom(liberty) };
  } catch (err) {
    console.warn('No se pudo cargar el estilo de OpenFreeMap; se usa el mapa del IGN.', err);
    return fallbackStyles();
  }
}

/** Primer layer de rótulos: las capas de área (zonas, radar…) se insertan por debajo. */
export function firstSymbolLayerId(style: { layers: { id: string; type: string }[] }): string | undefined {
  return style.layers.find((l) => l.type === 'symbol')?.id;
}
