import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  circleRing,
  compassName,
  compassPoint,
  destination,
  distanceToRingM,
  formatArea,
  formatDistance,
  haversineM,
  pointInRing,
  ringAreaM2,
  ringCentroid,
  ringPerimeterM,
  samplePointsInRing,
  simplifyRing,
  type Ring,
} from './geo';

const MADRID: [number, number] = [-3.7038, 40.4168];
const BARCELONA: [number, number] = [2.1734, 41.3851];

// Cuadrado de ~1 km de lado en Madrid.
const square: Ring = [
  [-3.71, 40.41],
  [-3.698198, 40.41],
  [-3.698198, 40.418993],
  [-3.71, 40.418993],
  [-3.71, 40.41],
];

describe('geo', () => {
  it('calcula distancias ortodrómicas', () => {
    expect(haversineM(MADRID, BARCELONA) / 1000).toBeCloseTo(505, 0);
    expect(haversineM(MADRID, MADRID)).toBe(0);
  });

  it('calcula rumbos y destinos coherentes', () => {
    const b = bearingDeg(MADRID, BARCELONA);
    expect(b).toBeGreaterThan(70);
    expect(b).toBeLessThan(80);
    const dest = destination(MADRID, haversineM(MADRID, BARCELONA), b);
    expect(haversineM(dest, BARCELONA)).toBeLessThan(50);
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 5);
  });

  it('calcula área y perímetro de un polígono', () => {
    expect(ringAreaM2(square) / 1e6).toBeCloseTo(1, 1);
    expect(ringPerimeterM(square) / 1000).toBeCloseTo(4, 1);
    const circle = circleRing(MADRID, 1000);
    expect(ringAreaM2(circle)).toBeCloseTo(Math.PI * 1e6, -4);
  });

  it('localiza el centroide y puntos interiores', () => {
    const c = ringCentroid(square);
    expect(c[0]).toBeCloseTo(-3.7041, 3);
    expect(c[1]).toBeCloseTo(40.4145, 3);
    expect(pointInRing(c, square)).toBe(true);
    expect(pointInRing(BARCELONA, square)).toBe(false);
  });

  it('mide la distancia de un punto a un polígono', () => {
    expect(distanceToRingM(ringCentroid(square), square)).toBe(0);
    const outside = destination([-3.698198, 40.4145], 500, 90);
    expect(distanceToRingM(outside, square)).toBeCloseTo(500, -1);
  });

  it('simplifica trazos a mano alzada sin romper el polígono', () => {
    const noisy = circleRing(MADRID, 2000, 400).map(([x, y], i) => [x + (i % 2 ? 1e-6 : -1e-6), y] as [number, number]);
    const simple = simplifyRing(noisy, 20);
    expect(simple.length).toBeLessThan(120);
    expect(simple.length).toBeGreaterThanOrEqual(4);
    expect(ringAreaM2(simple) / ringAreaM2(noisy)).toBeGreaterThan(0.98);
  });

  it('reparte muestras dentro del polígono', () => {
    const pts = samplePointsInRing(square, 5);
    expect(pts.length).toBe(5);
    for (const p of pts) expect(pointInRing(p, square)).toBe(true);
  });

  it('traduce rumbos a puntos cardinales en español', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(225)).toBe('SO');
    expect(compassPoint(292.5)).toBe('ONO');
    expect(compassName(315)).toBe('noroeste');
  });

  it('formatea distancias y áreas', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(8400)).toBe('8,4 km');
    expect(formatArea(5000)).toBe('5000 m²');
    expect(formatArea(2_500_000)).toBe('2,5 km²');
  });
});
