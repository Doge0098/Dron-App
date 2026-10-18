// Utilidades geodésicas ligeras (sin dependencias). Coordenadas siempre [lon, lat].

export type LngLatTuple = [number, number];
export type Ring = LngLatTuple[];
export type BBox = [west: number, south: number, east: number, north: number];

export const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export const toRad = (deg: number) => deg * RAD;
export const toDeg = (rad: number) => rad / RAD;

/** Normaliza un ángulo a [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Distancia ortodrómica en metros (fórmula del haversine). */
export function haversineM(a: LngLatTuple, b: LngLatTuple): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de `from` a `to`, en grados desde el norte geográfico [0, 360). */
export function bearingDeg(from: LngLatTuple, to: LngLatTuple): number {
  const φ1 = toRad(from[1]);
  const φ2 = toRad(to[1]);
  const Δλ = toRad(to[0] - from[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Punto de destino a `distanceM` metros con rumbo `bearing`. */
export function destination(from: LngLatTuple, distanceM: number, bearing: number): LngLatTuple {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearing);
  const φ1 = toRad(from[1]);
  const λ1 = toRad(from[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

/** Anillo cerrado que aproxima un círculo geodésico. */
export function circleRing(center: LngLatTuple, radiusM: number, steps = 72): Ring {
  const ring: Ring = [];
  for (let i = 0; i < steps; i++) ring.push(destination(center, radiusM, (i * 360) / steps));
  ring.push(ring[0]);
  return ring;
}

/** Devuelve el anillo cerrado (primer punto = último). */
export function closeRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/**
 * Área de un anillo en m² sobre la esfera (mismo método que turf/area:
 * Chamberlain & Duquette, "Some algorithms for polygons on a sphere").
 */
export function ringAreaM2(ring: Ring): number {
  const pts = closeRing(ring);
  const n = pts.length;
  if (n < 4) return 0;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % (n - 1)];
    const p3 = pts[(i + 2) % (n - 1)];
    total += (toRad(p3[0]) - toRad(p1[0])) * Math.sin(toRad(p2[1]));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function ringPerimeterM(ring: Ring): number {
  const pts = closeRing(ring);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += haversineM(pts[i], pts[i + 1]);
  return total;
}

export function ringBBox(ring: Ring): BBox {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Proyección equirectangular local (metros) alrededor de `origin`; suficiente para zonas de pocos km. */
function localProjector(origin: LngLatTuple) {
  const kx = EARTH_RADIUS_M * RAD * Math.cos(toRad(origin[1]));
  const ky = EARTH_RADIUS_M * RAD;
  return {
    forward: (p: LngLatTuple): [number, number] => [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * ky],
    inverse: (x: number, y: number): LngLatTuple => [origin[0] + x / kx, origin[1] + y / ky],
  };
}

/** Centroide (ponderado por área) de un anillo. */
export function ringCentroid(ring: Ring): LngLatTuple {
  const pts = closeRing(ring);
  if (pts.length === 0) return [0, 0];
  const proj = localProjector(pts[0]);
  const xy = pts.map(proj.forward);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const [x0, y0] = xy[i];
    const [x1, y1] = xy[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    // Anillo degenerado: media de vértices.
    const sx = xy.reduce((s, p) => s + p[0], 0) / xy.length;
    const sy = xy.reduce((s, p) => s + p[1], 0) / xy.length;
    return proj.inverse(sx, sy);
  }
  return proj.inverse(cx / (3 * a), cy / (3 * a));
}

/** Punto en polígono (ray casting). */
export function pointInRing(pt: LngLatTuple, ring: Ring): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointSegmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distancia mínima (m) de un punto a una polilínea. */
export function distanceToLineM(pt: LngLatTuple, line: LngLatTuple[]): number {
  if (line.length === 0) return Infinity;
  const proj = localProjector(pt);
  const pts = line.map(proj.forward);
  if (pts.length === 1) return Math.hypot(pts[0][0], pts[0][1]);
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) min = Math.min(min, pointSegmentDistance([0, 0], pts[i], pts[i + 1]));
  return min;
}

/** Distancia (m) de un punto al borde de un anillo; 0 si el punto está dentro. */
export function distanceToRingM(pt: LngLatTuple, ring: Ring): number {
  if (pointInRing(pt, ring)) return 0;
  const proj = localProjector(pt);
  const p: [number, number] = [0, 0];
  const pts = closeRing(ring).map(proj.forward);
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) min = Math.min(min, pointSegmentDistance(p, pts[i], pts[i + 1]));
  return min;
}

function segmentsCross(a: LngLatTuple, b: LngLatTuple, c: LngLatTuple, d: LngLatTuple): boolean {
  const orient = (p: LngLatTuple, q: LngLatTuple, r: LngLatTuple) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** ¿Se solapan dos polígonos? (vértice dentro del otro o aristas que se cruzan). */
export function ringsIntersect(a: Ring, b: Ring): boolean {
  const [aw, as, ae, an] = ringBBox(a);
  const [bw, bs, be, bn] = ringBBox(b);
  if (aw > be || ae < bw || as > bn || an < bs) return false;
  if (a.some((p) => pointInRing(p, b)) || b.some((p) => pointInRing(p, a))) return true;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) if (segmentsCross(a[i], a[i + 1], b[j], b[j + 1])) return true;
  }
  return false;
}

/** ¿Una polilínea entra en el polígono? */
export function lineIntersectsRing(line: LngLatTuple[], ring: Ring): boolean {
  if (line.some((p) => pointInRing(p, ring))) return true;
  for (let i = 0; i < line.length - 1; i++) {
    for (let j = 0; j < ring.length - 1; j++) if (segmentsCross(line[i], line[i + 1], ring[j], ring[j + 1])) return true;
  }
  return false;
}

/** Rectángulo alrededor del eje A→B, prolongado `beyondM` por cada extremo y `sideM` a cada lado. */
export function runwayRectangle(a: LngLatTuple, b: LngLatTuple, beyondM: number, sideM: number): Ring {
  const θ = bearingDeg(a, b);
  const a2 = destination(a, beyondM, θ + 180);
  const b2 = destination(b, beyondM, θ);
  return closeRing([destination(a2, sideM, θ - 90), destination(b2, sideM, θ - 90), destination(b2, sideM, θ + 90), destination(a2, sideM, θ + 90)]);
}

/** Simplificación Douglas-Peucker con tolerancia en metros (para el dibujo a mano alzada). */
export function simplifyRing(ring: Ring, toleranceM: number): Ring {
  const pts = closeRing(ring);
  if (pts.length <= 4) return pts;
  const proj = localProjector(pts[0]);
  const xy = pts.map(proj.forward);
  const keep = new Uint8Array(xy.length);
  keep[0] = 1;
  keep[xy.length - 1] = 1;
  const stack: [number, number][] = [[0, xy.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegmentDistance(xy[i], xy[s], xy[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  // Garantiza un polígono válido (≥ 3 vértices distintos).
  return out.length >= 4 ? out : pts;
}

/** Muestra puntos repartidos dentro del anillo (para consultar el tiempo en varias partes de una zona). */
export function samplePointsInRing(ring: Ring, maxPoints: number): LngLatTuple[] {
  const centroid = ringCentroid(ring);
  const points: LngLatTuple[] = pointInRing(centroid, ring) ? [centroid] : [];
  if (maxPoints <= 1) return points.length ? points : [closeRing(ring)[0]];
  const [w, s, e, n] = ringBBox(ring);
  const side = Math.ceil(Math.sqrt(maxPoints * 2));
  const candidates: LngLatTuple[] = [];
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const p: LngLatTuple = [w + ((i + 0.5) / side) * (e - w), s + ((j + 0.5) / side) * (n - s)];
      if (pointInRing(p, ring)) candidates.push(p);
    }
  }
  // Selección "farthest point" para cubrir bien la zona.
  while (points.length < maxPoints && candidates.length) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < candidates.length; i++) {
      const d = points.length ? Math.min(...points.map((p) => haversineM(p, candidates[i]))) : Infinity;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    points.push(candidates.splice(best, 1)[0]);
  }
  return points.length ? points : [centroid];
}

const COMPASS_ES = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const COMPASS_NAMES_ES: Record<string, string> = {
  N: 'norte',
  NE: 'nordeste',
  E: 'este',
  SE: 'sudeste',
  S: 'sur',
  SO: 'sudoeste',
  O: 'oeste',
  NO: 'noroeste',
};

/** Punto cardinal (rosa de 16 rumbos, en español: O = oeste). */
export function compassPoint(deg: number): string {
  return COMPASS_ES[Math.round(normalizeDeg(deg) / 22.5) % 16];
}

/** Nombre del punto cardinal (rosa de 8 rumbos). */
export function compassName(deg: number): string {
  const eight = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(normalizeDeg(deg) / 45) % 8];
  return COMPASS_NAMES_ES[eight];
}

const numberEs = (value: number, digits: number) =>
  value.toLocaleString('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function formatDistance(m: number): string {
  if (m < 1000) return `${numberEs(Math.round(m), 0)} m`;
  return `${numberEs(m / 1000, m < 10_000 ? 1 : 0)} km`;
}

export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${numberEs(Math.round(m2), 0)} m²`;
  if (m2 < 1_000_000) return `${numberEs(m2 / 10_000, 1)} ha`;
  return `${numberEs(m2 / 1_000_000, 2)} km²`;
}

/** Bounding box que contiene a `bbox` ampliado un `factor` relativo por cada lado. */
export function padBBox([w, s, e, n]: BBox, factor: number): BBox {
  const dx = (e - w) * factor;
  const dy = (n - s) * factor;
  return [w - dx, Math.max(-85, s - dy), e + dx, Math.min(85, n + dy)];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
