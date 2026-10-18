import { describe, expect, it } from 'vitest';
import { buildField, nearestHourIndex, planGrid, sampleField, type WindGrid } from './openMeteo';

function makeGrid(dirFrom: number, speed: number): WindGrid {
  const times = [0, 3600, 7200];
  const node = () => ({
    time: times,
    speed: { 10: [speed, speed, speed], 80: [speed + 2, speed + 2, speed + 2], 120: [speed + 3, speed + 3, speed + 3] },
    dir: { 10: [dirFrom, dirFrom, dirFrom], 80: [dirFrom, dirFrom, dirFrom], 120: [dirFrom, dirFrom, dirFrom] },
    gust: [speed * 1.5, speed * 1.5, speed * 1.5],
    precip: [0, 1, 2],
    snow: [0, 0, 0],
    code: [0, 61, 63],
  });
  return { step: 1, i0: 0, j0: 40, cols: 2, rows: 2, lon0: 0, lat0: 40, times, nodes: [node(), node(), node(), node()] };
}

describe('openMeteo', () => {
  it('elige una malla con pocos nodos por eje', () => {
    const plan = planGrid([-4, 40, -3.4, 40.5], 8);
    expect(plan.step).toBe(0.1);
    expect(plan.cols).toBeLessThanOrEqual(8);
    expect(plan.rows).toBeLessThanOrEqual(8);
    const wide = planGrid([-10, 35, 5, 44], 8);
    expect(wide.step).toBe(2);
    const tiny = planGrid([-3.7001, 40.4, -3.7, 40.4001], 8);
    expect(tiny.cols).toBeGreaterThanOrEqual(2);
    expect(tiny.rows).toBeGreaterThanOrEqual(2);
  });

  it('busca la hora más próxima', () => {
    expect(nearestHourIndex([0, 3600, 7200], 4000)).toBe(1);
    expect(nearestHourIndex([0, 3600, 7200], 99999)).toBe(2);
    expect(nearestHourIndex([], 0)).toBe(-1);
  });

  it('construye e interpola el campo de viento', () => {
    const field = buildField(makeGrid(270, 6), 3600, 120);
    expect(field.height).toBe(120);
    const s = sampleField(field, 0.5, 40.5);
    expect(s).not.toBeNull();
    expect(s!.speed).toBeCloseTo(9, 4);
    expect(s!.u).toBeCloseTo(9, 4); // viento del oeste → hacia el este
    expect(s!.precip).toBeCloseTo(1, 4);
    expect(sampleField(field, 2, 40.5)).toBeNull();
  });
});
