// Capa animada sobre el mapa 3D: partículas de viento (indican hacia dónde sopla) y lluvia/nieve.
//
// Las partículas viven en coordenadas geográficas y se mueven con el viento interpolado de la malla
// de Open-Meteo. Para proyectarlas a pantalla sin llamar a `map.project` miles de veces por fotograma
// se proyecta una malla de control (MESH × MESH nodos) cada vez que cambia la cámara y se interpola
// bilinealmente dentro de cada celda. Así funciona con inclinación, rotación y relieve 3D.

import type { Map as MapLibreMap } from 'maplibre-gl';
import { windColor } from '../lib/wind';
import { fieldBBox, sampleField, type FieldSample, type WindField } from '../services/openMeteo';

const MESH = 26;
const RAD = Math.PI / 180;
const M_PER_DEG = 111_320;
/** Píxeles por fotograma (a 60 fps) por cada m/s de viento. */
const PX_PER_MS = 0.2;
const TRAIL_FADE = 0.93;
const SPEED_BUCKETS = [1, 2, 3, 4.5, 6, 7.5, 9, 10.5, 12, 14, 16, 19, 23];
const MAX_DROPS = 1400;
const FALL_PX = 56;

interface Mesh {
  w: number;
  s: number;
  e: number;
  n: number;
  x: Float32Array;
  y: Float32Array;
  ok: Uint8Array;
  cellArea: Float32Array;
  cdf: Float64Array;
  total: number;
  eastX: number;
  eastY: number;
  northX: number;
  northY: number;
  metersPerPixel: number;
}

interface Drop {
  lon: number;
  lat: number;
  t: number;
  speed: number;
  len: number;
  snow: boolean;
  splash: number;
  phase: number;
}

interface Flash {
  x: number;
  y: number;
  life: number;
  bolt: number[];
}

export interface OverlayOptions {
  wind: boolean;
  rain: boolean;
}

interface ScreenPoint {
  x: number;
  y: number;
}

export class WeatherOverlay {
  private readonly map: MapLibreMap;
  private readonly windCanvas: HTMLCanvasElement;
  private readonly rainCanvas: HTMLCanvasElement;
  private readonly windCtx: CanvasRenderingContext2D;
  private readonly rainCtx: CanvasRenderingContext2D;
  private readonly shadingCanvas = document.createElement('canvas');
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  private field: WindField | null = null;
  private mesh: Mesh | null = null;
  private meshDirty = true;
  private meshCamera = '';
  private meshComplete = false;
  private moving = false;
  private options: OverlayOptions = { wind: true, rain: true };
  private raf = 0;
  private lastFrame = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** Coste medio (ms) de dibujar un fotograma y número de partículas deseado para esta pantalla. */
  private costEma = 0;
  private frameCount = 0;
  private targetCount = 0;

  // Partículas (estructura de arrays para no generar basura por fotograma).
  private count = 0;
  private pLon = new Float32Array(0);
  private pLat = new Float32Array(0);
  private pAge = new Uint16Array(0);
  private pMax = new Uint16Array(0);
  private segments: Float32Array[] = SPEED_BUCKETS.map(() => new Float32Array(0));
  private segmentCount = new Uint32Array(SPEED_BUCKETS.length + 1);
  private readonly bucketColors = [...SPEED_BUCKETS.map((s) => windColor(s - 0.5)), windColor(25)];

  // Precipitación.
  private drops: Drop[] = [];
  private rainCdf: Float64Array = new Float64Array(0);
  private rainTotal = 0;
  private rainSnowRatio = 0;
  private stormCells: number[] = [];
  private flashes: Flash[] = [];

  private readonly tmpSample: FieldSample = { u: 0, v: 0, speed: 0, precip: 0, snow: 0 };
  private readonly tmpPoint: ScreenPoint = { x: 0, y: 0 };
  private readonly tmpPoint2: ScreenPoint = { x: 0, y: 0 };
  private readonly listeners: [string, () => void][] = [];

  constructor(map: MapLibreMap) {
    this.map = map;
    const container = map.getCanvasContainer();
    this.windCanvas = this.createCanvas('weather-overlay weather-overlay--wind');
    this.rainCanvas = this.createCanvas('weather-overlay weather-overlay--rain');
    container.appendChild(this.rainCanvas);
    container.appendChild(this.windCanvas);
    this.windCtx = this.windCanvas.getContext('2d')!;
    this.rainCtx = this.rainCanvas.getContext('2d')!;

    const dirty = () => {
      this.meshDirty = true;
    };
    this.on('move', dirty);
    this.on('terrain', dirty);
    // Al terminar de cargar teselas (relieve incluido) se reproyecta una vez, pero no tras cada
    // repintado sin cambios de cámara (p. ej. mientras se dibuja una zona).
    this.on('idle', () => {
      if (!this.meshComplete || this.cameraKey() !== this.meshCamera) this.meshDirty = true;
    });
    this.on('movestart', () => {
      this.moving = true;
    });
    this.on('moveend', () => {
      this.moving = false;
      this.meshDirty = true;
    });
    this.on('resize', () => this.resize());
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.resize();
  }

  private on(type: string, fn: () => void) {
    // Los tipos de eventos de MapLibre v6 son genéricos; aquí basta con la firma sin argumentos.
    (this.map.on as (t: string, f: () => void) => void)(type, fn);
    this.listeners.push([type, fn]);
  }

  private createCanvas(className: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  }

  private handleVisibility = () => {
    if (document.hidden) this.stop();
    else this.ensureRunning();
  };

  destroy() {
    this.stop();
    for (const [type, fn] of this.listeners) (this.map.off as (t: string, f: () => void) => void)(type, fn);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.windCanvas.remove();
    this.rainCanvas.remove();
  }

  setField(field: WindField | null) {
    this.field = field;
    this.meshDirty = true;
    // Al cambiar de hora o de zona se reinician las partículas para no mezclar campos.
    this.pAge.fill(0xffff);
    this.drops = [];
    this.ensureRunning();
  }

  setOptions(options: Partial<OverlayOptions>) {
    this.options = { ...this.options, ...options };
    if (!this.options.wind) this.windCtx.clearRect(0, 0, this.width, this.height);
    if (!this.options.rain) {
      this.rainCtx.clearRect(0, 0, this.width, this.height);
      this.drops = [];
    }
    this.ensureRunning();
  }

  private resize() {
    const canvas = this.map.getCanvas();
    this.width = canvas.clientWidth;
    this.height = canvas.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.windCanvas, this.rainCanvas, this.shadingCanvas]) {
      c.width = Math.max(1, Math.round(this.width * this.dpr));
      c.height = Math.max(1, Math.round(this.height * this.dpr));
      c.style.width = `${this.width}px`;
      c.style.height = `${this.height}px`;
    }
    for (const ctx of [this.windCtx, this.rainCtx]) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const area = this.width * this.height;
    this.targetCount = Math.round(Math.min(3200, Math.max(400, area / 700)) * (this.reducedMotion ? 0.4 : 1));
    this.allocateParticles(this.targetCount);
    this.meshDirty = true;
  }

  private allocateParticles(count: number) {
    this.count = count;
    this.pLon = new Float32Array(count);
    this.pLat = new Float32Array(count);
    this.pAge = new Uint16Array(count).fill(0xffff);
    this.pMax = new Uint16Array(count);
    this.segments = [...SPEED_BUCKETS, Infinity].map(() => new Float32Array(count * 4));
    this.segmentCount = new Uint32Array(SPEED_BUCKETS.length + 1);
  }

  private ensureRunning() {
    const active = this.field && (this.options.wind || this.options.rain) && !document.hidden;
    if (active && !this.raf) {
      this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!active) {
      this.stop();
      this.windCtx.clearRect(0, 0, this.width, this.height);
      this.rainCtx.clearRect(0, 0, this.width, this.height);
    }
  }

  private cameraKey(): string {
    const c = this.map.getCenter();
    return [c.lng, c.lat, this.map.getZoom(), this.map.getBearing(), this.map.getPitch(), Boolean(this.map.getTerrain())]
      .map((v) => (typeof v === 'number' ? v.toFixed(6) : String(v)))
      .join('|');
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dtScale = Math.min(3, (now - this.lastFrame) / (1000 / 60)) * (this.reducedMotion ? 0.5 : 1);
    this.lastFrame = now;
    if (!this.field) return;
    if (this.meshDirty) {
      this.mesh = this.buildMesh();
      this.meshDirty = false;
      this.meshCamera = this.cameraKey();
      this.meshComplete = this.map.areTilesLoaded();
      this.buildRainWeights();
    }
    const t0 = performance.now();
    if (this.options.wind) this.drawWind(dtScale);
    if (this.options.rain) this.drawRain(dtScale);
    this.costEma = this.costEma * 0.92 + (performance.now() - t0) * 0.08;
    if (++this.frameCount % 120 === 0) this.adaptParticleCount();
  };

  /** En equipos lentos reduce las partículas para mantener el mapa fluido (y las recupera si sobra margen). */
  private adaptParticleCount() {
    if (this.costEma > 8 && this.count > 300) this.allocateParticles(Math.round(this.count * 0.7));
    else if (this.costEma < 3 && this.count < this.targetCount) {
      this.allocateParticles(Math.min(this.targetCount, Math.round(this.count * 1.2)));
    }
  }

  // -------------------------------------------------------------------------
  // Malla de proyección
  // -------------------------------------------------------------------------

  private buildMesh(): Mesh | null {
    const field = this.field;
    if (!field || this.width === 0) return null;
    const [fw, fs, fe, fn] = fieldBBox(field);
    const b = this.map.getBounds();
    const padX = (b.getEast() - b.getWest()) * 0.06;
    const padY = (b.getNorth() - b.getSouth()) * 0.06;
    const w = Math.max(fw, b.getWest() - padX);
    const e = Math.min(fe, b.getEast() + padX);
    const s = Math.max(fs, b.getSouth() - padY);
    const n = Math.min(fn, b.getNorth() + padY);
    if (!(w < e && s < n)) return null;

    const total = MESH * MESH;
    const x = new Float32Array(total);
    const y = new Float32Array(total);
    const ok = new Uint8Array(total);
    const W = this.width;
    const H = this.height;
    const lim = 3 * Math.max(W, H);
    for (let j = 0; j < MESH; j++) {
      const lat = s + ((n - s) * j) / (MESH - 1);
      for (let i = 0; i < MESH; i++) {
        const lon = w + ((e - w) * i) / (MESH - 1);
        const p = this.map.project([lon, lat]);
        const k = j * MESH + i;
        x[k] = p.x;
        y[k] = p.y;
        ok[k] = Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > -lim && p.x < W + lim && p.y > -lim && p.y < H + lim ? 1 : 0;
      }
    }

    const cells = (MESH - 1) * (MESH - 1);
    const cellArea = new Float32Array(cells);
    const cdf = new Float64Array(cells);
    let acc = 0;
    for (let j = 0; j < MESH - 1; j++) {
      for (let i = 0; i < MESH - 1; i++) {
        const c = j * (MESH - 1) + i;
        const k00 = j * MESH + i;
        const k10 = k00 + 1;
        const k01 = k00 + MESH;
        const k11 = k01 + 1;
        let area = 0;
        if (ok[k00] && ok[k10] && ok[k01] && ok[k11]) {
          const minX = Math.min(x[k00], x[k10], x[k01], x[k11]);
          const maxX = Math.max(x[k00], x[k10], x[k01], x[k11]);
          const minY = Math.min(y[k00], y[k10], y[k01], y[k11]);
          const maxY = Math.max(y[k00], y[k10], y[k01], y[k11]);
          if (maxX > 0 && minX < W && maxY > 0 && minY < H) {
            const quad =
              Math.abs(
                (x[k00] * y[k10] - x[k10] * y[k00]) +
                  (x[k10] * y[k11] - x[k11] * y[k10]) +
                  (x[k11] * y[k01] - x[k01] * y[k11]) +
                  (x[k01] * y[k00] - x[k00] * y[k01]),
              ) / 2;
            // Fracción visible aproximada por la caja envolvente.
            const visW = Math.min(maxX, W) - Math.max(minX, 0);
            const visH = Math.min(maxY, H) - Math.max(minY, 0);
            const boxArea = Math.max(1, (maxX - minX) * (maxY - minY));
            area = quad * Math.min(1, (visW * visH) / boxArea);
          }
        }
        cellArea[c] = area;
        acc += area;
        cdf[c] = acc;
      }
    }

    const center = this.map.getCenter();
    const p0 = this.map.project(center);
    const pe = this.map.project([center.lng + 0.01, center.lat]);
    const pn = this.map.project([center.lng, center.lat + 0.01]);
    const el = Math.hypot(pe.x - p0.x, pe.y - p0.y) || 1;
    const nl = Math.hypot(pn.x - p0.x, pn.y - p0.y) || 1;
    const metersPerPixel = (40_075_016.686 * Math.cos(center.lat * RAD)) / (512 * 2 ** this.map.getZoom());

    return {
      w,
      s,
      e,
      n,
      x,
      y,
      ok,
      cellArea,
      cdf,
      total: acc,
      eastX: (pe.x - p0.x) / el,
      eastY: (pe.y - p0.y) / el,
      northX: (pn.x - p0.x) / nl,
      northY: (pn.y - p0.y) / nl,
      metersPerPixel,
    };
  }

  /** Proyecta (lon, lat) a pantalla interpolando en la malla. */
  private project(mesh: Mesh, lon: number, lat: number, out: ScreenPoint): boolean {
    const fx = ((lon - mesh.w) / (mesh.e - mesh.w)) * (MESH - 1);
    const fy = ((lat - mesh.s) / (mesh.n - mesh.s)) * (MESH - 1);
    if (!(fx >= 0 && fy >= 0 && fx <= MESH - 1 && fy <= MESH - 1)) return false;
    const i = Math.min(fx | 0, MESH - 2);
    const j = Math.min(fy | 0, MESH - 2);
    const tx = fx - i;
    const ty = fy - j;
    const k00 = j * MESH + i;
    const k10 = k00 + 1;
    const k01 = k00 + MESH;
    const k11 = k01 + 1;
    const ok = mesh.ok;
    if (!(ok[k00] & ok[k10] & ok[k01] & ok[k11])) return false;
    const a = (1 - tx) * (1 - ty);
    const b = tx * (1 - ty);
    const c = (1 - tx) * ty;
    const d = tx * ty;
    out.x = mesh.x[k00] * a + mesh.x[k10] * b + mesh.x[k01] * c + mesh.x[k11] * d;
    out.y = mesh.y[k00] * a + mesh.y[k10] * b + mesh.y[k01] * c + mesh.y[k11] * d;
    return true;
  }

  /** Punto aleatorio uniformemente distribuido en pantalla (ponderado por área de celda). */
  private randomLocation(mesh: Mesh, cdf: Float64Array, total: number): [number, number] | null {
    if (total <= 0) return null;
    const r = Math.random() * total;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const i = lo % (MESH - 1);
    const j = (lo / (MESH - 1)) | 0;
    const lon = mesh.w + ((i + Math.random()) / (MESH - 1)) * (mesh.e - mesh.w);
    const lat = mesh.s + ((j + Math.random()) / (MESH - 1)) * (mesh.n - mesh.s);
    return [lon, lat];
  }

  // -------------------------------------------------------------------------
  // Viento
  // -------------------------------------------------------------------------

  private spawnParticle(mesh: Mesh, p: number, initial: boolean) {
    const loc = this.randomLocation(mesh, mesh.cdf, mesh.total);
    if (!loc) {
      this.pAge[p] = 0xffff;
      return;
    }
    this.pLon[p] = loc[0];
    this.pLat[p] = loc[1];
    const max = 50 + ((Math.random() * 70) | 0);
    this.pMax[p] = max;
    this.pAge[p] = initial ? (Math.random() * max) | 0 : 0;
  }

  private drawWind(dtScale: number) {
    const ctx = this.windCtx;
    const mesh = this.mesh;
    const field = this.field;
    const W = this.width;
    const H = this.height;
    if (this.moving) ctx.clearRect(0, 0, W, H);
    else {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!mesh || !field || mesh.total <= 0) return;

    const k = PX_PER_MS * mesh.metersPerPixel * dtScale;
    const counts = this.segmentCount;
    counts.fill(0);
    const sample = this.tmpSample;
    const from = this.tmpPoint;
    const to = this.tmpPoint2;
    for (let p = 0; p < this.count; p++) {
      if (this.pAge[p] === 0xffff) {
        this.spawnParticle(mesh, p, true);
        continue;
      }
      if (this.pAge[p] >= this.pMax[p]) {
        this.spawnParticle(mesh, p, false);
        continue;
      }
      const lon = this.pLon[p];
      const lat = this.pLat[p];
      if (!sampleField(field, lon, lat, sample) || !this.project(mesh, lon, lat, from)) {
        this.spawnParticle(mesh, p, false);
        continue;
      }
      const nLat = lat + (sample.v * k) / M_PER_DEG;
      const nLon = lon + (sample.u * k) / (M_PER_DEG * Math.cos(lat * RAD));
      // Ambos extremos se proyectan con la malla actual: el trazo sigue bien al mover la cámara.
      if (!this.project(mesh, nLon, nLat, to) || to.x < -20 || to.y < -20 || to.x > W + 20 || to.y > H + 20) {
        this.spawnParticle(mesh, p, false);
        continue;
      }
      let b = 0;
      while (b < SPEED_BUCKETS.length && sample.speed >= SPEED_BUCKETS[b]) b++;
      const buf = this.segments[b];
      const o = counts[b] * 4;
      buf[o] = from.x;
      buf[o + 1] = from.y;
      buf[o + 2] = to.x;
      buf[o + 3] = to.y;
      counts[b]++;
      this.pLon[p] = nLon;
      this.pLat[p] = nLat;
      this.pAge[p]++;
    }

    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let b = 0; b < counts.length; b++) {
      const c = counts[b];
      if (!c) continue;
      const buf = this.segments[b];
      ctx.strokeStyle = this.bucketColors[b];
      ctx.beginPath();
      for (let s = 0; s < c; s++) {
        const o = s * 4;
        ctx.moveTo(buf[o], buf[o + 1]);
        ctx.lineTo(buf[o + 2], buf[o + 3]);
      }
      ctx.stroke();
    }
  }

  // -------------------------------------------------------------------------
  // Lluvia, nieve y tormentas
  // -------------------------------------------------------------------------

  private buildRainWeights() {
    const mesh = this.mesh;
    const field = this.field;
    const shade = this.shadingCanvas.getContext('2d')!;
    shade.setTransform(1, 0, 0, 1, 0, 0);
    shade.clearRect(0, 0, this.shadingCanvas.width, this.shadingCanvas.height);
    this.rainTotal = 0;
    this.stormCells = [];
    if (!mesh || !field) return;
    const cells = (MESH - 1) * (MESH - 1);
    if (this.rainCdf.length !== cells) this.rainCdf = new Float64Array(cells);
    const sample = this.tmpSample;
    let acc = 0;
    let snowAcc = 0;
    shade.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // El desenfoque es caro: solo cuando la cámara está quieta.
    shade.filter = this.moving ? 'none' : 'blur(10px)';
    for (let c = 0; c < cells; c++) {
      const i = c % (MESH - 1);
      const j = (c / (MESH - 1)) | 0;
      const lon = mesh.w + ((i + 0.5) / (MESH - 1)) * (mesh.e - mesh.w);
      const lat = mesh.s + ((j + 0.5) / (MESH - 1)) * (mesh.n - mesh.s);
      let weight = 0;
      if (mesh.cellArea[c] > 0 && sampleField(field, lon, lat, sample)) {
        const precip = Math.max(sample.precip, sample.snow * 0.7);
        if (precip >= 0.05) {
          const intensity = Math.min(1.6, 0.25 + precip / 3);
          weight = mesh.cellArea[c] * intensity;
          if (sample.snow > 0.02) snowAcc += weight;
          this.fillCell(shade, mesh, i, j, `rgba(59, 130, 246, ${Math.min(0.32, 0.08 + precip * 0.05)})`);
        }
        const gi = Math.round((lon - field.lon0) / field.step);
        const gj = Math.round((lat - field.lat0) / field.step);
        const code = field.code[gj * field.cols + gi];
        if (code >= 95 && mesh.cellArea[c] > 0) this.stormCells.push(c);
      }
      acc += weight;
      this.rainCdf[c] = acc;
    }
    shade.filter = 'none';
    this.rainTotal = acc;
    this.rainSnowRatio = acc > 0 ? snowAcc / acc : 0;
  }

  private fillCell(ctx: CanvasRenderingContext2D, mesh: Mesh, i: number, j: number, color: string) {
    const k00 = j * MESH + i;
    const k10 = k00 + 1;
    const k01 = k00 + MESH;
    const k11 = k01 + 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mesh.x[k00], mesh.y[k00]);
    ctx.lineTo(mesh.x[k10], mesh.y[k10]);
    ctx.lineTo(mesh.x[k11], mesh.y[k11]);
    ctx.lineTo(mesh.x[k01], mesh.y[k01]);
    ctx.closePath();
    ctx.fill();
  }

  private newDrop(mesh: Mesh): Drop | null {
    const loc = this.randomLocation(mesh, this.rainCdf, this.rainTotal);
    if (!loc) return null;
    const snow = Math.random() < this.rainSnowRatio;
    return {
      lon: loc[0],
      lat: loc[1],
      t: Math.random(),
      speed: snow ? 0.006 + Math.random() * 0.006 : 0.045 + Math.random() * 0.035,
      len: 8 + Math.random() * 7,
      snow,
      splash: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private drawRain(dtScale: number) {
    const ctx = this.rainCtx;
    const W = this.width;
    const H = this.height;
    ctx.clearRect(0, 0, W, H);
    const mesh = this.mesh;
    const field = this.field;
    if (!mesh || !field || this.rainTotal <= 0) {
      this.drops.length = 0;
      return;
    }
    ctx.drawImage(this.shadingCanvas, 0, 0, W, H);

    const target = Math.min(MAX_DROPS, Math.round(this.rainTotal / 900));
    while (this.drops.length < target) {
      const d = this.newDrop(mesh);
      if (!d) break;
      this.drops.push(d);
    }
    if (this.drops.length > target) this.drops.length = target;

    const sample = this.tmpSample;
    const pt = this.tmpPoint;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(200, 222, 255, 0.78)';
    ctx.beginPath();
    const splashes: number[] = [];
    const flakes: number[] = [];
    for (let idx = 0; idx < this.drops.length; idx++) {
      const d = this.drops[idx];
      if (d.splash > 0) {
        d.splash -= dtScale;
        if (d.splash <= 0) {
          const nd = this.newDrop(mesh);
          if (nd) {
            nd.t = 0;
            this.drops[idx] = nd;
          }
        } else if (this.project(mesh, d.lon, d.lat, pt)) splashes.push(pt.x, pt.y, d.splash);
        continue;
      }
      d.t += d.speed * dtScale;
      if (d.t >= 1) {
        d.t = 1;
        d.splash = d.snow ? 0.1 : 7;
        continue;
      }
      if (!this.project(mesh, d.lon, d.lat, pt)) {
        d.t = 1;
        d.splash = 0.1;
        continue;
      }
      // Inclinación de la lluvia según el viento proyectado en pantalla.
      let slant = 0;
      if (sampleField(field, d.lon, d.lat, sample)) {
        const sx = sample.u * mesh.eastX + sample.v * mesh.northX;
        slant = Math.max(-0.9, Math.min(0.9, sx / 14));
      }
      const remaining = (1 - d.t) * FALL_PX;
      const x = pt.x - slant * remaining;
      const y = pt.y - remaining;
      if (x < -10 || x > W + 10 || y < -FALL_PX || y > H + 10) continue;
      if (d.snow) {
        flakes.push(x + Math.sin(d.phase + d.t * 12) * 3, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + slant * d.len, y + d.len);
      }
    }
    ctx.stroke();

    if (splashes.length) {
      ctx.strokeStyle = 'rgba(200, 222, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = 0; s < splashes.length; s += 3) {
        const r = 1 + (7 - splashes[s + 2]) * 0.6;
        ctx.moveTo(splashes[s] + r, splashes[s + 1]);
        ctx.ellipse(splashes[s], splashes[s + 1], r, r * 0.4, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    if (flakes.length) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      for (let s = 0; s < flakes.length; s += 2) {
        ctx.moveTo(flakes[s] + 1.8, flakes[s + 1]);
        ctx.arc(flakes[s], flakes[s + 1], 1.8, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    this.drawLightning(ctx, mesh, dtScale);
  }

  private drawLightning(ctx: CanvasRenderingContext2D, mesh: Mesh, dtScale: number) {
    if (this.reducedMotion) return;
    for (const c of this.stormCells) {
      if (Math.random() < 0.0012 * dtScale && this.flashes.length < 4) {
        const i = c % (MESH - 1);
        const j = (c / (MESH - 1)) | 0;
        const lon = mesh.w + ((i + Math.random()) / (MESH - 1)) * (mesh.e - mesh.w);
        const lat = mesh.s + ((j + Math.random()) / (MESH - 1)) * (mesh.n - mesh.s);
        const pt = { x: 0, y: 0 };
        if (!this.project(mesh, lon, lat, pt)) continue;
        const bolt: number[] = [];
        let bx = pt.x + (Math.random() - 0.5) * 40;
        for (let k = 0; k <= 6; k++) {
          bolt.push(bx, pt.y - 150 + k * 25);
          bx += (Math.random() - 0.5) * 18 + (pt.x - bx) * 0.25;
        }
        this.flashes.push({ x: pt.x, y: pt.y, life: 9, bolt });
      }
    }
    for (let f = this.flashes.length - 1; f >= 0; f--) {
      const flash = this.flashes[f];
      const alpha = flash.life / 9;
      const glow = ctx.createRadialGradient(flash.x, flash.y - 60, 0, flash.x, flash.y - 60, 140);
      glow.addColorStop(0, `rgba(255, 255, 240, ${0.35 * alpha})`);
      glow.addColorStop(1, 'rgba(255, 255, 240, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(flash.x - 140, flash.y - 200, 280, 280);
      ctx.strokeStyle = `rgba(255, 255, 220, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(flash.bolt[0], flash.bolt[1]);
      for (let k = 2; k < flash.bolt.length; k += 2) ctx.lineTo(flash.bolt[k], flash.bolt[k + 1]);
      ctx.stroke();
      flash.life -= dtScale;
      if (flash.life <= 0) this.flashes.splice(f, 1);
    }
  }
}
