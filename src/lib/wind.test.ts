import { describe, expect, it } from 'vitest';
import { beaufort, describeDirection, dirTowards, uvToWind, windAtHeight, windColor, windToUV } from './wind';

describe('wind', () => {
  it('convierte dirección meteorológica a componentes del flujo', () => {
    // Viento del norte: el aire se mueve hacia el sur (v negativo).
    const north = windToUV(10, 0);
    expect(north.u).toBeCloseTo(0, 6);
    expect(north.v).toBeCloseTo(-10, 6);
    // Viento del oeste (poniente): sopla hacia el este (u positivo).
    const west = windToUV(5, 270);
    expect(west.u).toBeCloseTo(5, 6);
    expect(west.v).toBeCloseTo(0, 6);
  });

  it('es reversible', () => {
    for (const dir of [0, 45, 135, 200, 315]) {
      const { u, v } = windToUV(7, dir);
      const back = uvToWind(u, v);
      expect(back.speed).toBeCloseTo(7, 6);
      expect(back.dirFrom).toBeCloseTo(dir, 6);
    }
  });

  it('indica hacia dónde sopla', () => {
    expect(dirTowards(315)).toBe(135);
    expect(describeDirection(315)).toBe('del NO (315°), sopla hacia el sudeste');
  });

  it('clasifica en la escala Beaufort', () => {
    expect(beaufort(0.1).force).toBe(0);
    expect(beaufort(6).name).toBe('Bonancible');
    expect(beaufort(12).force).toBe(6);
  });

  it('interpola el viento entre alturas', () => {
    const levels = [
      { heightM: 10, speed: 4, dirFrom: 350 },
      { heightM: 80, speed: 8, dirFrom: 10 },
      { heightM: 120, speed: 9, dirFrom: 20 },
    ];
    expect(windAtHeight(levels, 5).speed).toBe(4);
    expect(windAtHeight(levels, 150).speed).toBe(9);
    const mid = windAtHeight(levels, 40);
    expect(mid.speed).toBeGreaterThan(4);
    expect(mid.speed).toBeLessThan(8);
    // La dirección cruza el norte sin saltar a 180°.
    expect(mid.dirFrom > 340 || mid.dirFrom < 20).toBe(true);
  });

  it('asigna colores por intensidad', () => {
    expect(windColor(0)).toBe('#7dd3fc');
    expect(windColor(30)).toBe('#c026d3');
    expect(windColor(7.5)).toMatch(/^rgb\(/);
  });
});
