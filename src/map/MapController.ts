// Controlador imperativo del mapa 3D (MapLibre GL). React le pasa el estado mediante métodos.

import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, FeatureCollection } from 'geojson';
import { padBBox, type BBox, type LngLatTuple } from '../lib/geo';
import { WIND_COLOR_STOPS, dirTowards, msToKmh } from '../lib/wind';
import { aerodromePoints, aerodromeZoneFeatures, AERODROME_TYPE_LABEL } from '../services/aerodromes';
import {
  SEVERITY_LABEL,
  ZONE_LAYERS,
  queryZones,
  type UasZone,
} from '../services/enaire';
import { isAbortError } from '../services/http';
import {
  WeatherGridService,
  buildField,
  sampleField,
  type WindField,
  type WindGrid,
  type WindHeight,
} from '../services/openMeteo';
import { RADAR_MAX_ZOOM, fetchRadarFrames, type RadarFrame } from '../services/rainviewer';
import type { Basemap, DrawnZone, LayerToggles, MapStatus } from '../types';
import { DRAFT_SOURCE, DrawController, type DrawMode, type DrawnShape } from './DrawController';
import { detectSurroundingsWhenIdle, type Surroundings } from './surroundings';
import { TERRAIN_ATTRIBUTION, TERRARIUM_TILES, firstSymbolLayerId, loadBaseStyles, type BaseStyles } from './styles';
import { WeatherOverlay } from './WeatherOverlay';

setWorkerUrl(workerUrl);

export interface MapControllerCallbacks {
  onMapClick(point: LngLatTuple): void;
  onStatus(status: Partial<MapStatus>): void;
  onShapeDrawn(shape: DrawnShape): void;
  onDrawCancel(): void;
  onDrawProgress(vertices: number): void;
  onViewChange(view: { center: LngLatTuple; zoom: number; bearing: number; pitch: number }): void;
  onRadarFrame(frame: { index: number; count: number; time: number } | null): void;
  onFieldChange(field: WindField | null): void;
}

export interface MapControllerInit {
  basemap: Basemap;
  layers: LayerToggles;
  windHeight: WindHeight;
  time: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  prohibited: '#ef4444',
  authorization: '#f97316',
  caution: '#eab308',
  info: '#38bdf8',
};

const LOCALE_ES: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Mostrar u ocultar atribución',
  'AttributionControl.MapFeedback': 'Sugerir mejoras del mapa',
  'FullscreenControl.Enter': 'Pantalla completa',
  'FullscreenControl.Exit': 'Salir de pantalla completa',
  'GeolocateControl.FindMyLocation': 'Mi ubicación',
  'GeolocateControl.LocationNotAvailable': 'Ubicación no disponible',
  'LogoControl.Title': 'Logotipo de MapLibre',
  'Map.Title': 'Mapa',
  'Marker.Title': 'Marcador',
  'NavigationControl.ResetBearing': 'Arrastra para girar; pulsa para orientar al norte',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'Popup.Close': 'Cerrar',
  'ScaleControl.Feet': 'ft',
  'ScaleControl.Meters': 'm',
  'ScaleControl.Kilometers': 'km',
  'ScaleControl.Miles': 'mi',
  'ScaleControl.NauticalMiles': 'NM',
  'TerrainControl.Enable': 'Activar relieve 3D',
  'TerrainControl.Disable': 'Desactivar relieve 3D',
};

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const SPAIN_VIEW = { center: [-3.7, 39.6] as LngLatTuple, zoom: 5.3, pitch: 30, bearing: 0 };

function arrowImage(color: string): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(11, -5);
  ctx.lineTo(4, -5);
  ctx.lineTo(4, 18);
  ctx.lineTo(-4, 18);
  ctx.lineTo(-4, -5);
  ctx.lineTo(-11, -5);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function badgeImage(fill: string, glyph: string): ImageData {
  const size = 44;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, "Segoe UI Symbol", "Noto Sans Symbols", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, size / 2, size / 2 + 1);
  return ctx.getImageData(0, 0, size, size);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export class MapController {
  readonly map: MapLibreMap;
  private readonly styles: BaseStyles;
  private readonly callbacks: MapControllerCallbacks;
  private readonly overlay: WeatherOverlay;
  private readonly draw: DrawController;
  private readonly gridService = new WeatherGridService();
  private readonly popup = new Popup({ closeButton: true, maxWidth: '340px', className: 'map-popup' });

  private basemap: Basemap;
  private layers: LayerToggles;
  private windHeight: WindHeight;
  private time: number;
  private grid: WindGrid | null = null;
  private field: WindField | null = null;
  private gridAbort: AbortController | null = null;
  private gridTimer = 0;
  private zonesAbort: AbortController | null = null;
  private zonesTimer = 0;
  private zonesBackoffUntil = 0;
  /** Área ya consultada a ENAIRE (con margen): no se repite la consulta mientras la vista quede dentro. */
  private zonesFetched: { bbox: BBox; key: string } | null = null;
  private zonesData: FeatureCollection = EMPTY;
  /** Las zonas oficiales de ENAIRE se han cargado: las orientativas locales de aeródromos se ocultan. */
  private enaireZonesShown = false;
  private zoneIndex = new Map<string, UasZone>();
  private highlightData: FeatureCollection = EMPTY;
  private zoneData: FeatureCollection = EMPTY;
  private radarFrames: RadarFrame[] = [];
  private radarIndex = 0;
  private radarTimer = 0;
  private radarFetchedAt = 0;
  private queryMarker: Marker | null = null;
  private queryArrow: HTMLElement | null = null;
  private destroyed = false;

  static async create(container: HTMLElement, init: MapControllerInit, callbacks: MapControllerCallbacks) {
    const styles = await loadBaseStyles();
    return new MapController(container, styles, init, callbacks);
  }

  private constructor(container: HTMLElement, styles: BaseStyles, init: MapControllerInit, callbacks: MapControllerCallbacks) {
    this.styles = styles;
    this.callbacks = callbacks;
    this.basemap = init.basemap;
    this.layers = init.layers;
    this.windHeight = init.windHeight;
    this.time = init.time;

    this.map = new MapLibreMap({
      container,
      style: styles[init.basemap],
      center: SPAIN_VIEW.center,
      zoom: SPAIN_VIEW.zoom,
      pitch: SPAIN_VIEW.pitch,
      bearing: SPAIN_VIEW.bearing,
      maxPitch: 80,
      hash: 'mapa',
      locale: LOCALE_ES,
      attributionControl: { compact: true },
    });
    this.map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    this.map.addControl(new ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-right');

    this.map.on('style.load', () => this.setupStyle());
    // Primera carga: viento y zonas de la vista inicial (después solo al mover el mapa).
    this.map.once('load', () => this.onMoveEnd());
    // Este listener se registra antes que los del dibujo para ver el estado previo a cerrar una forma.
    this.map.on('click', this.onClick);
    this.map.on('moveend', this.onMoveEnd);
    this.map.on('mousemove', this.onHover);

    this.overlay = new WeatherOverlay(this.map);
    this.overlay.setOptions({ wind: init.layers.wind, rain: init.layers.rain });
    this.draw = new DrawController(this.map, {
      onComplete: (shape) => callbacks.onShapeDrawn(shape),
      onCancel: () => callbacks.onDrawCancel(),
      onProgress: ({ vertices }) => callbacks.onDrawProgress(vertices),
    });
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.gridTimer);
    window.clearTimeout(this.zonesTimer);
    window.clearInterval(this.radarTimer);
    this.gridAbort?.abort();
    this.zonesAbort?.abort();
    this.overlay.destroy();
    this.draw.destroy();
    this.map.remove();
  }

  // -------------------------------------------------------------------------
  // Estilo, fuentes y capas
  // -------------------------------------------------------------------------

  private setupStyle() {
    const map = this.map;
    const beforeLabels = firstSymbolLayerId(map.getStyle());

    WIND_COLOR_STOPS.forEach(([, color], i) => {
      if (!map.hasImage(`wind-arrow-${i}`)) map.addImage(`wind-arrow-${i}`, arrowImage(color), { pixelRatio: 2 });
    });
    const badges: [string, string, string][] = [
      ['aero-airport', '#7c3aed', '✈'],
      ['aero-airfield', '#2563eb', '✈'],
      ['aero-heliport', '#0d9488', 'H'],
      ['aero-other', '#64748b', '•'],
    ];
    for (const [id, fill, glyph] of badges) if (!map.hasImage(id)) map.addImage(id, badgeImage(fill, glyph), { pixelRatio: 2 });

    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: [TERRARIUM_TILES],
      tileSize: 256,
      maxzoom: 15,
      encoding: 'terrarium',
      attribution: TERRAIN_ATTRIBUTION,
    });
    map.addSource('hillshade-dem', { type: 'raster-dem', tiles: [TERRARIUM_TILES], tileSize: 256, maxzoom: 14, encoding: 'terrarium' });
    if (this.basemap === 'vector') {
      const firstLine = map.getStyle().layers.find((l) => l.type === 'line')?.id;
      map.addLayer(
        {
          id: 'hillshade',
          type: 'hillshade',
          source: 'hillshade-dem',
          paint: {
            'hillshade-exaggeration': 0.35,
            'hillshade-shadow-color': '#334155',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-accent-color': '#475569',
          },
        },
        firstLine,
      );
    }

    map.addSource('aero-zones', { type: 'geojson', data: aerodromeZoneFeatures() });
    map.addSource('aerodromes', { type: 'geojson', data: aerodromePoints() });
    map.addSource('uas-zones', { type: 'geojson', data: this.zonesData });
    map.addSource('zone-hits', { type: 'geojson', data: this.highlightData });
    map.addSource('zone', { type: 'geojson', data: this.zoneData });
    map.addSource(DRAFT_SOURCE, { type: 'geojson', data: EMPTY });
    map.addSource('wind-nodes', { type: 'geojson', data: EMPTY });

    const sev = (prop = 'severity') => ['match', ['get', prop], ...Object.entries(SEVERITY_COLORS).flat(), '#94a3b8'];
    map.addLayer(
      {
        id: 'aero-zones-fill',
        type: 'fill',
        source: 'aero-zones',
        minzoom: 7,
        paint: {
          'fill-color': ['match', ['get', 'part'], 'inner', '#a855f7', '#c084fc'],
          // Los helipuertos son muchos y pequeños: más discretos para no teñir las ciudades.
          'fill-opacity': ['case', ['==', ['get', 'type'], 'heliport'], 0.035, ['match', ['get', 'part'], 'inner', 0.1, 0.04]],
        },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'aero-zones-line',
        type: 'line',
        source: 'aero-zones',
        minzoom: 7,
        paint: {
          'line-color': '#c084fc',
          'line-width': ['match', ['get', 'part'], 'inner', 1.4, 0.8],
          'line-dasharray': [3, 2],
          'line-opacity': 0.85,
        },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'uas-fill',
        type: 'fill',
        source: 'uas-zones',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'severity'], 'info']],
        paint: {
          'fill-color': sev() as never,
          'fill-opacity': ['match', ['get', 'severity'], 'prohibited', 0.22, 'authorization', 0.16, 'caution', 0.12, 0.08],
        },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'uas-line',
        type: 'line',
        source: 'uas-zones',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'severity'], 'info']],
        paint: { 'line-color': sev() as never, 'line-width': 1.4, 'line-opacity': 0.9 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'zone-hits-line',
        type: 'line',
        source: 'zone-hits',
        paint: { 'line-color': sev() as never, 'line-width': 3.5, 'line-opacity': 0.95 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'zone-fill',
        type: 'fill',
        source: 'zone',
        paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.24 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'zone-casing',
        type: 'line',
        source: 'zone',
        paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': 0.9 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'zone-line',
        type: 'line',
        source: 'zone',
        paint: { 'line-color': '#7c3aed', 'line-width': 3, 'line-dasharray': [2, 1.2] },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'draft-fill',
        type: 'fill',
        source: DRAFT_SOURCE,
        filter: ['==', ['get', 'role'], 'fill'],
        paint: { 'fill-color': '#f0abfc', 'fill-opacity': 0.14 },
      },
      beforeLabels,
    );
    map.addLayer(
      {
        id: 'draft-line',
        type: 'line',
        source: DRAFT_SOURCE,
        filter: ['==', ['get', 'role'], 'line'],
        paint: { 'line-color': '#f5d0fe', 'line-width': 2.5, 'line-dasharray': [1.5, 1] },
      },
      beforeLabels,
    );
    // Capas puntuales y rótulos, por encima de todo.
    map.addLayer({
      id: 'uas-points',
      type: 'circle',
      source: 'uas-zones',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': ['match', ['get', 'layer'], 'modelFields', '#22c55e', '#e879f9'],
        'circle-stroke-color': '#0f172a',
        'circle-stroke-width': 1.5,
      },
    });
    map.addLayer({
      id: 'aero-points',
      type: 'symbol',
      source: 'aerodromes',
      layout: {
        'icon-image': [
          'match',
          ['get', 'type'],
          'airport',
          'aero-airport',
          'airfield',
          'aero-airfield',
          'heliport',
          'aero-heliport',
          'aero-other',
        ],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['get', 'major'], 0.55, 0.3], 11, ['case', ['get', 'major'], 0.9, 0.7]],
        'icon-allow-overlap': true,
        'symbol-sort-key': ['case', ['get', 'major'], 0, 1],
        'text-field': ['step', ['zoom'], ['case', ['get', 'major'], ['get', 'name'], ''], 9, ['get', 'name']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#f5f3ff', 'text-halo-color': 'rgba(30, 27, 75, 0.9)', 'text-halo-width': 1.3 },
    });
    map.addLayer({
      id: 'wind-arrows',
      type: 'symbol',
      source: 'wind-nodes',
      layout: {
        'icon-image': [
          'step',
          ['get', 'speed'],
          'wind-arrow-0',
          ...WIND_COLOR_STOPS.slice(1).flatMap(([speed], i) => [speed, `wind-arrow-${i + 1}`]),
        ],
        'icon-size': ['interpolate', ['linear'], ['get', 'speed'], 0, 0.55, 8, 0.85, 20, 1.15],
        'icon-rotate': ['get', 'rot'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['concat', ['to-string', ['get', 'kmh']], ' km/h'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 10,
        'text-offset': [0, 1.9],
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(2, 6, 23, 0.85)', 'text-halo-width': 1.4 },
    });
    map.addLayer({
      id: 'draft-points',
      type: 'circle',
      source: DRAFT_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['match', ['get', 'role'], 'first', 6, 4],
        'circle-color': ['match', ['get', 'role'], 'first', '#f0abfc', '#ffffff'],
        'circle-stroke-color': '#86198f',
        'circle-stroke-width': 2,
      },
    });

    map.setSky({
      'sky-color': '#5d9be0',
      'horizon-color': '#cfe3f6',
      'fog-color': '#e8eff7',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.75,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
    });

    if (this.radarFrames.length && this.layers.radar) this.addRadarLayers();
    this.applyLayerVisibility();
    this.updateWindArrows();
    this.draw.render();
  }

  private setVisibility(id: string, visible: boolean) {
    if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }

  private applyLayerVisibility() {
    const l = this.layers;
    this.setVisibility('building-3d', l.buildings);
    this.setVisibility('uas-fill', l.zones);
    this.setVisibility('uas-line', l.zones);
    this.setVisibility('uas-points', l.zones);
    this.setVisibility('aero-points', l.aerodromes);
    // Las zonas orientativas solo cuando no se ven las oficiales de ENAIRE.
    const localZones = l.aerodromes && !(l.zones && this.enaireZonesShown);
    this.setVisibility('aero-zones-fill', localZones);
    this.setVisibility('aero-zones-line', localZones);
    this.setVisibility('wind-arrows', l.arrows);
    const terrainOn = Boolean(this.map.getTerrain());
    if (l.terrain && !terrainOn && this.map.getSource('terrain-dem')) {
      this.map.setTerrain({ source: 'terrain-dem', exaggeration: 1.35 });
    } else if (!l.terrain && terrainOn) {
      this.map.setTerrain(null);
    }
    this.radarFrames.forEach((_, i) => this.setVisibility(`radar-${i}`, l.radar));
  }

  // -------------------------------------------------------------------------
  // API pública (llamada desde React)
  // -------------------------------------------------------------------------

  setBasemap(basemap: Basemap) {
    if (basemap === this.basemap) return;
    this.basemap = basemap;
    this.map.setStyle(this.styles[basemap], { diff: false });
  }

  setLayers(layers: LayerToggles) {
    const prev = this.layers;
    this.layers = layers;
    this.applyLayerVisibility();
    this.overlay.setOptions({ wind: layers.wind, rain: layers.rain });
    if (layers.zones !== prev.zones) this.scheduleZones(0);
    if (layers.radar && !prev.radar) void this.enableRadar();
    if (!layers.radar && prev.radar) {
      window.clearInterval(this.radarTimer);
      this.radarTimer = 0;
      this.callbacks.onRadarFrame(null);
    }
    const needsGrid = layers.wind || layers.arrows || layers.rain;
    if (needsGrid && !this.grid) this.scheduleGrid(0);
  }

  setTime(time: number) {
    if (time === this.time) return;
    this.time = time;
    this.applyField();
  }

  setWindHeight(height: WindHeight) {
    if (height === this.windHeight) return;
    this.windHeight = height;
    this.applyField();
  }

  setDrawMode(mode: DrawMode | null) {
    this.popup.remove();
    this.draw.setMode(mode);
  }

  finishDrawing() {
    this.draw.finish();
  }

  undoDrawing() {
    this.draw.undo();
  }

  setQueryPoint(point: LngLatTuple | null, wind?: { dirFrom: number; speed: number } | null) {
    if (!point) {
      this.queryMarker?.remove();
      this.queryMarker = null;
      return;
    }
    if (!this.queryMarker) {
      const root = el('div', 'query-marker');
      root.setAttribute('aria-label', 'Punto consultado');
      root.append(el('span', 'query-marker__pulse'));
      this.queryArrow = el('span', 'query-marker__arrow');
      root.append(this.queryArrow, el('span', 'query-marker__dot'));
      this.queryMarker = new Marker({ element: root, rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat(point)
        .addTo(this.map);
    } else {
      this.queryMarker.setLngLat(point);
    }
    if (this.queryArrow) {
      const ok = wind && Number.isFinite(wind.dirFrom) && Number.isFinite(wind.speed);
      this.queryArrow.style.display = ok ? '' : 'none';
      if (ok) {
        this.queryArrow.style.setProperty('--rot', `${dirTowards(wind!.dirFrom)}deg`);
        // Cuanto más viento, más rápida la animación de la flecha.
        this.queryArrow.style.setProperty('--dur', `${Math.max(0.6, 2.6 - wind!.speed / 6)}s`);
      }
    }
  }

  setZone(zone: DrawnZone | null) {
    this.zoneData = zone
      ? {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: { id: zone.id }, geometry: { type: 'Polygon', coordinates: [zone.ring] } }],
        }
      : EMPTY;
    (this.map.getSource('zone') as GeoJSONSource | undefined)?.setData(this.zoneData);
    if (!zone) this.setZoneHighlights([]);
  }

  setZoneHighlights(zones: UasZone[]) {
    this.highlightData = {
      type: 'FeatureCollection',
      features: zones
        .filter((z) => z.geometry.type === 'Polygon' || z.geometry.type === 'MultiPolygon')
        .map((z) => ({ type: 'Feature', properties: { severity: z.severity }, geometry: z.geometry })),
    };
    (this.map.getSource('zone-hits') as GeoJSONSource | undefined)?.setData(this.highlightData);
  }

  flyTo(point: LngLatTuple, zoom = 13) {
    this.map.flyTo({ center: point, zoom: Math.max(zoom, this.map.getZoom()), pitch: Math.max(50, this.map.getPitch()), essential: true });
  }

  fitBounds(bbox: BBox, maxZoom = 15) {
    this.map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 80, maxZoom, pitch: Math.max(45, this.map.getPitch()), essential: true },
    );
  }

  resetView() {
    this.map.flyTo({ ...SPAIN_VIEW, essential: true });
  }

  /** Edificios, suelo urbano, carreteras y espacios protegidos según los datos vectoriales del mapa. */
  detectSurroundings(target: LngLatTuple | LngLatTuple[]): Promise<Surroundings> {
    return detectSurroundingsWhenIdle(this.map, target);
  }

  /** Viento interpolado de la malla del mapa en un punto (para la brújula). */
  sampleWind(point: LngLatTuple) {
    return this.field ? sampleField(this.field, point[0], point[1]) : null;
  }

  // -------------------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------------------

  private onMoveEnd = () => {
    const c = this.map.getCenter();
    this.callbacks.onViewChange({
      center: [c.lng, c.lat],
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    });
    this.scheduleGrid();
    this.scheduleZones();
  };

  private interactiveLayers() {
    return ['uas-fill', 'uas-points', 'aero-points'].filter((id) => this.map.getLayer(id));
  }

  private onHover = (e: MapMouseEvent) => {
    if (this.draw.active) return;
    const hit = this.map.queryRenderedFeatures(e.point, { layers: ['uas-points', 'aero-points'].filter((id) => this.map.getLayer(id)) });
    this.map.getCanvas().style.cursor = hit.length ? 'pointer' : '';
  };

  private onClick = (e: MapMouseEvent) => {
    if (this.draw.active || this.draw.recentlyFinished) return;
    const features = this.map.queryRenderedFeatures(e.point, { layers: this.interactiveLayers() });
    if (features.length) this.showPopup(e.lngLat.toArray() as LngLatTuple, features);
    else this.popup.remove();
    this.callbacks.onMapClick([e.lngLat.lng, e.lngLat.lat]);
  };

  private showPopup(at: LngLatTuple, features: MapGeoJSONFeature[]) {
    const root = el('div', 'popup');
    const seen = new Set<string>();
    for (const f of features) {
      const props = f.properties ?? {};
      const key = String(props.uid ?? props.id ?? f.id ?? Math.random());
      if (seen.has(key) || seen.size >= 4) continue;
      seen.add(key);
      const item = el('section', 'popup__item');
      if (f.layer.id === 'aero-points') {
        item.append(
          el('p', 'popup__kicker', AERODROME_TYPE_LABEL[props.type as keyof typeof AERODROME_TYPE_LABEL] ?? 'Aeródromo'),
          el('h3', 'popup__title', String(props.name ?? '')),
        );
        if (props.icao) item.append(el('p', 'popup__meta', `OACI ${props.icao}`));
        item.append(el('p', 'popup__text', 'Antes de volar cerca, consulta la zona oficial en ENAIRE y coordina con el gestor si procede.'));
      } else {
        const zone = this.zoneIndex.get(String(props.uid));
        if (!zone) continue;
        const badge = el('span', `badge badge--${zone.severity}`, SEVERITY_LABEL[zone.severity]);
        item.append(el('p', 'popup__kicker', zone.layerLabel), el('h3', 'popup__title', zone.name), badge);
        const limits = [zone.lower && `Desde ${zone.lower}`, zone.upper && `hasta ${zone.upper}`].filter(Boolean).join(' ');
        if (limits) item.append(el('p', 'popup__meta', limits));
        if (zone.validity) item.append(el('p', 'popup__meta', `Vigencia: ${zone.validity}`));
        if (zone.message) {
          const text = zone.message.length > 420 ? `${zone.message.slice(0, 420)}…` : zone.message;
          item.append(el('p', 'popup__text', text));
        }
        if (zone.contact) item.append(el('p', 'popup__meta', `Contacto: ${zone.contact}`));
      }
      root.append(item);
    }
    if (!root.childElementCount) return;
    this.popup.setLngLat(at).setDOMContent(root).addTo(this.map);
  }

  // -------------------------------------------------------------------------
  // Malla meteorológica (viento y precipitación)
  // -------------------------------------------------------------------------

  private scheduleGrid(delay = 450) {
    window.clearTimeout(this.gridTimer);
    this.gridTimer = window.setTimeout(() => void this.loadGrid(), delay);
  }

  private async loadGrid() {
    if (this.destroyed) return;
    if (!(this.layers.wind || this.layers.arrows || this.layers.rain)) return;
    const b = this.map.getBounds();
    const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    this.gridAbort?.abort();
    const ctrl = new AbortController();
    this.gridAbort = ctrl;
    this.callbacks.onStatus({ weatherLoading: true, weatherError: null });
    try {
      const perAxis = this.map.getContainer().clientWidth < 700 ? 6 : 8;
      const grid = await this.gridService.load(bbox, ctrl.signal, perAxis);
      if (ctrl.signal.aborted || this.destroyed) return;
      this.grid = grid;
      this.applyField();
      this.callbacks.onStatus({ weatherLoading: false, weatherError: null });
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return;
      const status = (err as { status?: number }).status;
      const message =
        status === 429
          ? 'Se alcanzó el límite gratuito de Open-Meteo. Inténtalo más tarde.'
          : 'No se pudo cargar el viento del mapa (Open-Meteo).';
      this.callbacks.onStatus({ weatherLoading: false, weatherError: message });
    }
  }

  private applyField() {
    this.field = this.grid && this.grid.times.length ? buildField(this.grid, this.time, this.windHeight) : null;
    this.overlay.setField(this.field);
    this.updateWindArrows();
    this.callbacks.onFieldChange(this.field);
  }

  private updateWindArrows() {
    const source = this.map.getSource('wind-nodes') as GeoJSONSource | undefined;
    if (!source) return;
    const f = this.field;
    if (!f) {
      source.setData(EMPTY);
      return;
    }
    const features: Feature[] = [];
    for (let j = 0; j < f.rows; j++) {
      for (let i = 0; i < f.cols; i++) {
        const k = j * f.cols + i;
        if (!Number.isFinite(f.speed[k])) continue;
        features.push({
          type: 'Feature',
          properties: { speed: f.speed[k], rot: dirTowards(f.dir[k]), kmh: Math.round(msToKmh(f.speed[k])) },
          geometry: { type: 'Point', coordinates: [f.lon0 + i * f.step, f.lat0 + j * f.step] },
        });
      }
    }
    source.setData({ type: 'FeatureCollection', features });
  }

  // -------------------------------------------------------------------------
  // Zonas UAS de ENAIRE en la vista actual
  // -------------------------------------------------------------------------

  private scheduleZones(delay = 700) {
    window.clearTimeout(this.zonesTimer);
    this.zonesTimer = window.setTimeout(() => void this.loadZones(), delay);
  }

  private setZonesData(data: FeatureCollection) {
    this.zonesData = data;
    (this.map.getSource('uas-zones') as GeoJSONSource | undefined)?.setData(data);
  }

  private async loadZones() {
    if (this.destroyed) return;
    if (!this.layers.zones) {
      this.zonesAbort?.abort();
      this.setEnaireShown(false);
      this.callbacks.onStatus({ zones: 'idle', zoneCount: 0 });
      return;
    }
    const zoom = this.map.getZoom();
    const layers = ZONE_LAYERS.filter((l) => l.display !== false && zoom >= l.minZoom);
    if (!layers.length) {
      this.setZonesData(EMPTY);
      this.setEnaireShown(false);
      this.callbacks.onStatus({ zones: 'zoom', zoneCount: 0 });
      return;
    }
    if (Date.now() < this.zonesBackoffUntil) {
      this.setEnaireShown(false);
      this.callbacks.onStatus({ zones: 'unavailable', zoneCount: 0 });
      return;
    }
    const b = this.map.getBounds();
    const view: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const key = `${Math.floor(zoom)}|${layers.map((l) => l.key).join(',')}`;
    const done = this.zonesFetched;
    if (done && done.key === key && view[0] >= done.bbox[0] && view[1] >= done.bbox[1] && view[2] <= done.bbox[2] && view[3] <= done.bbox[3]) {
      this.setEnaireShown(true);
      this.callbacks.onStatus({ zones: 'ok', zoneCount: this.zoneIndex.size });
      return;
    }
    const bbox = padBBox(view, 0.35);
    this.zonesAbort?.abort();
    const ctrl = new AbortController();
    this.zonesAbort = ctrl;
    this.callbacks.onStatus({ zones: 'loading' });
    // Generalización acorde al zoom (≈ 1,5 px de pantalla), en grados.
    const metersPerPixel = (40_075_016.686 * Math.cos((b.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const simplifyDeg = Number(((metersPerPixel * 1.5) / 111_320).toPrecision(2));
    try {
      const res = await queryZones({ type: 'bbox', bbox }, layers, { simplifyDeg, signal: ctrl.signal });
      if (ctrl.signal.aborted || this.destroyed) return;
      if (res.unavailable) {
        this.zonesBackoffUntil = Date.now() + 2 * 60_000;
        this.setEnaireShown(false);
        this.callbacks.onStatus({ zones: 'unavailable', zoneCount: 0 });
        return;
      }
      this.zoneIndex = new Map(res.zones.map((z) => [z.uid, z]));
      this.setZonesData({
        type: 'FeatureCollection',
        features: res.zones.map((z) => ({
          type: 'Feature',
          properties: { uid: z.uid, severity: z.severity, layer: z.layer, name: z.name },
          geometry: z.geometry,
        })),
      });
      this.zonesFetched = res.failedLayers.length ? null : { bbox, key };
      this.setEnaireShown(true);
      this.callbacks.onStatus({ zones: res.failedLayers.length ? 'partial' : 'ok', zoneCount: res.zones.length });
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return;
      this.setEnaireShown(false);
      this.callbacks.onStatus({ zones: 'unavailable', zoneCount: 0 });
    }
  }

  private setEnaireShown(shown: boolean) {
    if (this.enaireZonesShown === shown) return;
    this.enaireZonesShown = shown;
    this.applyLayerVisibility();
  }

  // -------------------------------------------------------------------------
  // Radar de lluvia animado (RainViewer)
  // -------------------------------------------------------------------------

  private async enableRadar() {
    try {
      if (!this.radarFrames.length || Date.now() - this.radarFetchedAt > 10 * 60_000) {
        this.removeRadarLayers();
        this.radarFrames = await fetchRadarFrames();
        this.radarFetchedAt = Date.now();
      }
      if (!this.layers.radar || this.destroyed) return;
      this.addRadarLayers();
      this.applyLayerVisibility();
      this.radarIndex = this.radarFrames.length - 1;
      this.showRadarFrame(this.radarIndex);
      window.clearInterval(this.radarTimer);
      let hold = 0;
      this.radarTimer = window.setInterval(() => {
        // Pausa en el último fotograma (el más reciente) antes de repetir.
        if (this.radarIndex === this.radarFrames.length - 1 && hold++ < 3) return;
        hold = 0;
        this.showRadarFrame((this.radarIndex + 1) % this.radarFrames.length);
      }, 650);
    } catch {
      this.callbacks.onStatus({ weatherError: 'No se pudo cargar el radar de precipitación (RainViewer).' });
    }
  }

  private addRadarLayers() {
    const beforeLabels = firstSymbolLayerId(this.map.getStyle());
    this.radarFrames.forEach((frame, i) => {
      const id = `radar-${i}`;
      if (!this.map.getSource(id)) {
        this.map.addSource(id, {
          type: 'raster',
          tiles: [frame.tileUrl],
          tileSize: 256,
          maxzoom: RADAR_MAX_ZOOM,
          attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Radar © RainViewer</a>',
        });
      }
      if (!this.map.getLayer(id)) {
        this.map.addLayer(
          {
            id,
            type: 'raster',
            source: id,
            paint: { 'raster-opacity': i === this.radarIndex ? 0.7 : 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
          },
          beforeLabels,
        );
      }
    });
  }

  private removeRadarLayers() {
    this.radarFrames.forEach((_, i) => {
      if (this.map.getLayer(`radar-${i}`)) this.map.removeLayer(`radar-${i}`);
      if (this.map.getSource(`radar-${i}`)) this.map.removeSource(`radar-${i}`);
    });
  }

  private showRadarFrame(index: number) {
    const prev = `radar-${this.radarIndex}`;
    const next = `radar-${index}`;
    if (this.map.getLayer(prev)) this.map.setPaintProperty(prev, 'raster-opacity', 0);
    if (this.map.getLayer(next)) this.map.setPaintProperty(next, 'raster-opacity', 0.7);
    this.radarIndex = index;
    const frame = this.radarFrames[index];
    if (frame) this.callbacks.onRadarFrame({ index, count: this.radarFrames.length, time: frame.time });
  }
}
