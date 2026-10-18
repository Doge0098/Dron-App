// Herramientas de dibujo sobre el mapa: mano alzada, polígono, rectángulo y círculo.
// Funcionan con ratón, táctil y lápiz (Pointer Events) y con el mapa inclinado o girado.

import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import { circleRing, closeRing, haversineM, ringAreaM2, simplifyRing, type LngLatTuple, type Ring } from '../lib/geo';

export type DrawMode = 'freehand' | 'polygon' | 'rectangle' | 'circle';

export interface DrawnShape {
  kind: DrawMode;
  ring: Ring;
  center?: LngLatTuple;
  radiusM?: number;
}

export interface DrawCallbacks {
  onComplete(shape: DrawnShape): void;
  onCancel(): void;
  onProgress?(info: { mode: DrawMode; vertices: number }): void;
}

export const DRAFT_SOURCE = 'draw-draft';
const MIN_AREA_M2 = 50;
const CLOSE_PX = 14;

const emptyCollection = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export class DrawController {
  private readonly map: MapLibreMap;
  private readonly callbacks: DrawCallbacks;
  private mode: DrawMode | null = null;
  private points: LngLatTuple[] = [];
  private hover: LngLatTuple | null = null;
  private dragStart: { x: number; y: number; lngLat: LngLatTuple } | null = null;
  private dragCurrent: { x: number; y: number } | null = null;
  private pointerId: number | null = null;
  private lastScreen: { x: number; y: number } | null = null;
  private finishedAt = 0;

  constructor(map: MapLibreMap, callbacks: DrawCallbacks) {
    this.map = map;
    this.callbacks = callbacks;
    const container = map.getCanvasContainer();
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointercancel', this.onPointerCancel);
    map.on('click', this.onClick);
    map.on('dblclick', this.onDblClick);
    map.on('mousemove', this.onMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
  }

  destroy() {
    const container = this.map.getCanvasContainer();
    container.removeEventListener('pointerdown', this.onPointerDown);
    container.removeEventListener('pointermove', this.onPointerMove);
    container.removeEventListener('pointerup', this.onPointerUp);
    container.removeEventListener('pointercancel', this.onPointerCancel);
    this.map.off('click', this.onClick);
    this.map.off('dblclick', this.onDblClick);
    this.map.off('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  get active(): boolean {
    return this.mode !== null;
  }

  get currentMode(): DrawMode | null {
    return this.mode;
  }

  get vertexCount(): number {
    return this.points.length;
  }

  /** Se acaba de cerrar una forma: el "click" que MapLibre emite al soltar no debe consultar un punto. */
  get recentlyFinished(): boolean {
    return performance.now() - this.finishedAt < 400;
  }

  setMode(mode: DrawMode | null) {
    if (mode === this.mode) return;
    this.reset();
    this.mode = mode;
    const dragShape = mode === 'freehand' || mode === 'rectangle' || mode === 'circle';
    const handlers = [this.map.dragPan, this.map.dragRotate, this.map.touchZoomRotate, this.map.touchPitch];
    for (const h of handlers) {
      if (dragShape) h.disable();
      else h.enable();
    }
    if (mode) this.map.doubleClickZoom.disable();
    else this.map.doubleClickZoom.enable();
    // Evita que el navegador desplace la página al arrastrar el dedo mientras se dibuja.
    this.map.getCanvasContainer().style.touchAction = dragShape ? 'none' : '';
    this.map.getCanvas().style.cursor = mode ? 'crosshair' : '';
    this.render();
    if (mode) this.callbacks.onProgress?.({ mode, vertices: 0 });
  }

  /** Cierra el polígono en curso (botón "Terminar" en móvil o tecla Intro). */
  finish() {
    if (this.mode === 'polygon') this.completeRing(this.points, 'polygon');
  }

  undo() {
    if (this.mode !== 'polygon' || this.points.length === 0) return;
    this.points.pop();
    this.render();
    this.callbacks.onProgress?.({ mode: 'polygon', vertices: this.points.length });
  }

  cancel() {
    const wasActive = this.mode !== null;
    this.setMode(null);
    if (wasActive) this.callbacks.onCancel();
  }

  private reset() {
    this.points = [];
    this.hover = null;
    this.dragStart = null;
    this.dragCurrent = null;
    this.pointerId = null;
    this.lastScreen = null;
  }

  private toLngLat(x: number, y: number): LngLatTuple {
    const ll = this.map.unproject([x, y]);
    return [ll.lng, ll.lat];
  }

  private localPoint(ev: PointerEvent): { x: number; y: number } {
    const rect = this.map.getCanvasContainer().getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  // --- Polígono (clic a clic) ------------------------------------------------

  private onClick = (e: MapMouseEvent) => {
    if (this.mode !== 'polygon') return;
    const ll: LngLatTuple = [e.lngLat.lng, e.lngLat.lat];
    if (this.points.length >= 3) {
      const first = this.map.project(this.points[0]);
      if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < CLOSE_PX) {
        this.completeRing(this.points, 'polygon');
        return;
      }
    }
    this.points.push(ll);
    this.render();
    this.callbacks.onProgress?.({ mode: 'polygon', vertices: this.points.length });
  };

  private onDblClick = (e: MapMouseEvent) => {
    if (this.mode !== 'polygon') return;
    e.preventDefault();
    // El doble clic ya añadió un vértice duplicado con el segundo clic.
    this.completeRing(this.points, 'polygon');
  };

  private onMouseMove = (e: MapMouseEvent) => {
    if (this.mode !== 'polygon') return;
    this.hover = [e.lngLat.lng, e.lngLat.lat];
    this.render();
  };

  // --- Formas por arrastre ---------------------------------------------------

  private onPointerDown = (ev: PointerEvent) => {
    if (!this.mode || this.mode === 'polygon' || ev.button > 0) return;
    ev.preventDefault();
    const p = this.localPoint(ev);
    this.pointerId = ev.pointerId;
    this.map.getCanvasContainer().setPointerCapture?.(ev.pointerId);
    this.dragStart = { ...p, lngLat: this.toLngLat(p.x, p.y) };
    this.dragCurrent = p;
    this.lastScreen = p;
    this.points = this.mode === 'freehand' ? [this.dragStart.lngLat] : [];
    this.render();
  };

  private onPointerMove = (ev: PointerEvent) => {
    if (!this.dragStart || ev.pointerId !== this.pointerId) return;
    const p = this.localPoint(ev);
    this.dragCurrent = p;
    if (this.mode === 'freehand' && this.lastScreen && Math.hypot(p.x - this.lastScreen.x, p.y - this.lastScreen.y) >= 3) {
      this.points.push(this.toLngLat(p.x, p.y));
      this.lastScreen = p;
    }
    this.render();
  };

  private onPointerUp = (ev: PointerEvent) => {
    if (!this.dragStart || ev.pointerId !== this.pointerId) return;
    this.map.getCanvasContainer().releasePointerCapture?.(ev.pointerId);
    const start = this.dragStart;
    const end = this.localPoint(ev);
    const mode = this.mode;
    this.dragStart = null;
    this.pointerId = null;
    if (mode === 'freehand') {
      this.completeRing(this.points, 'freehand');
    } else if (mode === 'rectangle') {
      // Rectángulo en pantalla: con el mapa inclinado se convierte en el trapecio que ve el usuario.
      const ring = [
        this.toLngLat(start.x, start.y),
        this.toLngLat(end.x, start.y),
        this.toLngLat(end.x, end.y),
        this.toLngLat(start.x, end.y),
      ];
      this.completeRing(ring, 'rectangle');
    } else if (mode === 'circle') {
      const radiusM = haversineM(start.lngLat, this.toLngLat(end.x, end.y));
      this.completeRing(circleRing(start.lngLat, radiusM, 72), 'circle', { center: start.lngLat, radiusM });
    }
  };

  private onPointerCancel = () => {
    if (!this.dragStart) return;
    this.dragStart = null;
    this.pointerId = null;
    this.points = [];
    this.render();
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    if (!this.mode) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (ev.key === 'Escape') this.cancel();
    else if (ev.key === 'Enter') this.finish();
    else if (ev.key === 'Backspace' && this.mode === 'polygon') {
      ev.preventDefault();
      this.undo();
    }
  };

  // --- Finalización y renderizado -------------------------------------------

  private completeRing(points: LngLatTuple[], kind: DrawMode, extra: Partial<DrawnShape> = {}) {
    // Elimina vértices consecutivos repetidos (p. ej. el del doble clic).
    const unique = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
    if (unique.length < 3) {
      if (kind !== 'polygon') {
        this.points = [];
        this.render();
      }
      return;
    }
    let ring = closeRing(unique);
    if (kind === 'freehand') {
      const sizeM = Math.sqrt(ringAreaM2(ring));
      ring = simplifyRing(ring, Math.max(2, sizeM / 300));
    }
    if (ringAreaM2(ring) < MIN_AREA_M2) {
      this.points = [];
      this.render();
      return;
    }
    const shape: DrawnShape = { kind, ring, ...extra };
    this.finishedAt = performance.now();
    this.setMode(null);
    this.callbacks.onComplete(shape);
  }

  private draftFeatures(): Feature[] {
    const features: Feature[] = [];
    const mode = this.mode;
    if (!mode) return features;
    let ring: LngLatTuple[] | null = null;
    let line: LngLatTuple[] | null = null;
    if (mode === 'polygon') {
      line = this.hover ? [...this.points, this.hover] : [...this.points];
      if (this.points.length >= 2) ring = closeRing(line);
    } else if (mode === 'freehand') {
      line = this.points;
      if (this.points.length >= 3) ring = closeRing(this.points);
    } else if (this.dragStart && this.dragCurrent) {
      const s = this.dragStart;
      const c = this.dragCurrent;
      if (mode === 'rectangle') {
        ring = closeRing([
          s.lngLat,
          this.toLngLat(c.x, s.y),
          this.toLngLat(c.x, c.y),
          this.toLngLat(s.x, c.y),
        ]);
      } else {
        ring = circleRing(s.lngLat, haversineM(s.lngLat, this.toLngLat(c.x, c.y)), 72);
        features.push({ type: 'Feature', properties: { role: 'vertex' }, geometry: { type: 'Point', coordinates: s.lngLat } });
      }
      line = ring;
    }
    if (ring && ring.length >= 4) {
      features.push({ type: 'Feature', properties: { role: 'fill' }, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
    if (line && line.length >= 2) {
      features.push({ type: 'Feature', properties: { role: 'line' }, geometry: { type: 'LineString', coordinates: line } });
    }
    if (mode === 'polygon') {
      this.points.forEach((p, i) =>
        features.push({
          type: 'Feature',
          properties: { role: i === 0 ? 'first' : 'vertex' },
          geometry: { type: 'Point', coordinates: p },
        }),
      );
    }
    return features;
  }

  render() {
    const source = this.map.getSource(DRAFT_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    const data = emptyCollection();
    data.features = this.draftFeatures();
    source.setData(data);
  }
}
