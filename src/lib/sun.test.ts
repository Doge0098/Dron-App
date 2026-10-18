import { describe, expect, it } from 'vitest';
import { isLegalNight, sunTimes } from './sun';

const MADRID = { lat: 40.4168, lon: -3.7038 };
const utc = (iso: string) => Date.parse(iso);
const minutesUTC = (ms: number) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes();

describe('sun', () => {
  it('calcula salida, puesta y crepúsculo civil en Madrid (21 de junio)', () => {
    const t = sunTimes(utc('2026-06-21T12:00:00Z'), MADRID.lat, MADRID.lon);
    // Valores de referencia: salida 04:44 UTC, puesta 19:48 UTC, fin del crepúsculo civil ~20:20 UTC.
    expect(Math.abs(minutesUTC(t.sunrise) - (4 * 60 + 44))).toBeLessThanOrEqual(3);
    expect(Math.abs(minutesUTC(t.sunset) - (19 * 60 + 48))).toBeLessThanOrEqual(3);
    expect(Math.abs(minutesUTC(t.civilDusk) - (20 * 60 + 20))).toBeLessThanOrEqual(4);
    expect(t.civilDawn).toBeLessThan(t.sunrise);
    expect(t.civilDusk).toBeGreaterThan(t.sunset);
  });

  it('distingue día y noche legal', () => {
    expect(isLegalNight(utc('2026-06-21T12:00:00Z') / 1000, MADRID.lat, MADRID.lon)).toBe(false);
    // 20:00 UTC: ya ha anochecido pero aún es crepúsculo civil → todavía no es "noche".
    expect(isLegalNight(utc('2026-06-21T20:00:00Z') / 1000, MADRID.lat, MADRID.lon)).toBe(false);
    expect(isLegalNight(utc('2026-06-21T21:30:00Z') / 1000, MADRID.lat, MADRID.lon)).toBe(true);
    expect(isLegalNight(utc('2026-12-21T05:30:00Z') / 1000, MADRID.lat, MADRID.lon)).toBe(true);
  });
});
