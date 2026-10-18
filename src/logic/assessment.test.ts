import { describe, expect, it } from 'vitest';
import { DRONE_BY_ID } from '../data/drones';
import type { UasZone } from '../services/enaire';
import type { HourWeather } from '../services/openMeteo';
import { airspaceChecks, weatherChecks, worstLevel } from './assessment';
import { profileFromModel } from './drone';

const mini = profileFromModel(DRONE_BY_ID.get('dji-mini-4-pro')!);
const m350 = profileFromModel(DRONE_BY_ID.get('dji-matrice-350-rtk')!);

function hour(overrides: Partial<HourWeather> = {}, wind = 3): HourWeather {
  return {
    time: 0,
    temperature: 18,
    humidity: 50,
    precipitation: 0,
    precipitationProbability: 0,
    weatherCode: 1,
    cloudCover: 20,
    visibility: 20_000,
    isDay: true,
    gusts: wind * 1.4,
    wind: { 10: { speed: wind, dir: 270 }, 80: { speed: wind * 1.2, dir: 275 }, 120: { speed: wind * 1.3, dir: 280 } },
    ...overrides,
  };
}

const level = (checks: ReturnType<typeof weatherChecks>, id: string) => checks.find((c) => c.id === id)?.level;

describe('assessment', () => {
  it('buen tiempo: apto', () => {
    expect(worstLevel(weatherChecks(mini, hour(), { height: 120, night: false }))).toBe('ok');
  });

  it('viento cerca del límite del dron: no recomendado', () => {
    const checks = weatherChecks(mini, hour({}, 8), { height: 120, night: false });
    expect(level(checks, 'wind')).toBe('no');
    // A 10 m el viento es menor.
    expect(level(weatherChecks(mini, hour({}, 7), { height: 10, night: false }), 'wind')).toBe('caution');
  });

  it('lluvia: no recomendado salvo drones con protección IP', () => {
    const wet = hour({ precipitation: 1.2, weatherCode: 63 });
    expect(level(weatherChecks(mini, wet, { height: 120 }), 'precip')).toBe('no');
    expect(level(weatherChecks(m350, wet, { height: 120 }), 'precip')).toBe('caution');
    expect(level(weatherChecks(m350, hour({ weatherCode: 95 }), { height: 120 }), 'precip')).toBe('no');
  });

  it('de noche exige precaución (luz verde intermitente)', () => {
    const checks = weatherChecks(mini, hour(), { height: 120, night: true });
    expect(level(checks, 'daylight')).toBe('caution');
    expect(checks.find((c) => c.id === 'daylight')?.detail).toMatch(/no la lleva de serie/);
  });

  it('CTR: libre hasta 60 m, coordinación por encima', () => {
    const ctr: UasZone = {
      uid: 'controlled:1:0',
      layer: 'controlled',
      layerLabel: 'CTR',
      name: 'CTR MADRID',
      identifier: 'LECT',
      message: '',
      lower: '',
      upper: '',
      schedule: '',
      contact: '',
      validity: '',
      severity: 'caution',
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    const ctx = { drone: mini, groundElevationM: 600, surroundings: null };
    expect(airspaceChecks([ctr], [], true, { ...ctx, heightM: 120 }).level).toBe('no');
    expect(airspaceChecks([ctr], [], true, { ...ctx, heightM: 10 }).level).toBe('caution');
    expect(airspaceChecks([], [], true, { ...ctx, heightM: 120 }).level).toBe('ok');
    expect(airspaceChecks([], [], false, { ...ctx, heightM: 120 }).level).toBe('caution');
  });

  it('entorno urbano: aviso de comunicación previa y bloqueo para drones solo A3', () => {
    const urban = {
      available: true,
      zoom: 15,
      buildings: 40,
      urbanLanduse: ['residential'],
      places: ['Toledo'],
      roads: [],
      railways: 0,
      protectedAreas: [],
    };
    const base = { groundElevationM: null, heightM: 50, surroundings: urban };
    expect(airspaceChecks([], [], true, { ...base, drone: mini }).level).toBe('caution');
    const legacyHeavy = profileFromModel(DRONE_BY_ID.get('dji-mavic-air-2')!);
    expect(airspaceChecks([], [], true, { ...base, drone: legacyHeavy }).level).toBe('no');
  });
});
