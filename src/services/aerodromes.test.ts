import { describe, expect, it } from 'vitest';
import { bearingDeg, destination, type LngLatTuple } from '../lib/geo';
import { AERODROMES, aerodromeZones, findNearbyAerodromes } from './aerodromes';

const lemd = AERODROMES.find((a) => a.icao === 'LEMD')!;

describe('aerodromes', () => {
  it('incluye los aeropuertos principales con sus pistas', () => {
    expect(AERODROMES.length).toBeGreaterThan(400);
    expect(lemd).toBeDefined();
    expect(lemd.runways.length).toBeGreaterThanOrEqual(2);
    expect(aerodromeZones(lemd).spec.key).toBe('publicAerodrome');
  });

  it('aplica los volúmenes del art. 41.1.a en la prolongación del eje de pista', () => {
    const [x1, y1, x2, y2] = lemd.runways[0];
    const a: LngLatTuple = [x1, y1];
    const b: LngLatTuple = [x2, y2];
    const axis = bearingDeg(a, b);
    // 4 km más allá del extremo B: volumen interior (hasta 6 km).
    expect(findNearbyAerodromes(destination(b, 4000, axis)).find((n) => n.aerodrome.id === lemd.id)?.relation).toBe('inner');
    // 8 km más allá: solo el volumen exterior (hasta 10 km).
    const outer = destination(b, 8000, axis);
    const hit = findNearbyAerodromes(outer, 20_000, 20).find((n) => n.aerodrome.id === lemd.id);
    expect(hit?.relation === 'outer' || hit?.relation === 'inner').toBe(true);
  });

  it('usa un círculo de 2,5 km para los helipuertos de uso restringido', () => {
    const heli = AERODROMES.find((h) => h.type === 'heliport' && !h.scheduled)!;
    const zones = aerodromeZones(heli);
    expect(zones.spec.key).toBe('restrictedHeliport');
    const near = findNearbyAerodromes(destination([heli.lon, heli.lat], 2000, 45), 15_000, 50).find((n) => n.aerodrome.id === heli.id);
    expect(near?.relation).toBe('inner');
    const mid = findNearbyAerodromes(destination([heli.lon, heli.lat], 2900, 45), 15_000, 50).find((n) => n.aerodrome.id === heli.id);
    expect(mid?.relation).toBe('outer');
  });

  it('ignora aeródromos lejanos', () => {
    // Centro de la meseta de Soria, lejos de aeródromos importantes.
    const far = findNearbyAerodromes([-2.3, 41.9], 2000);
    expect(far.every((n) => n.distanceM <= 2000)).toBe(true);
  });
});
