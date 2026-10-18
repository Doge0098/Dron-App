import { describe, expect, it } from 'vitest';
import { DRONE_BY_ID } from '../data/drones';
import { CUSTOM_PROFILE, isWaterResistant, openCategoryFor, profileFromModel, requirementsFor, windLimitFor } from './drone';

const profile = (id: string) => profileFromModel(DRONE_BY_ID.get(id)!);
const req = (p: ReturnType<typeof profile>, id: string) => requirementsFor(p).find((r) => r.id === id)!;

describe('drone', () => {
  it('un C0 de menos de 250 g vuela en A1 y necesita registro si tiene cámara', () => {
    const p = profile('dji-mini-4-pro');
    expect(openCategoryFor(p).subcategories).toEqual(['A1', 'A3']);
    expect(req(p, 'operator-registration').status).toBe('required');
    expect(req(p, 'remote-id').status).toBe('not-required');
    expect(req(p, 'insurance').status).toBe('recommended');
  });

  it('un C1 exige Remote ID y certificado A1/A3', () => {
    const p = profile('dji-air-3');
    expect(openCategoryFor(p).primary).toBe('A1');
    expect(req(p, 'remote-id').status).toBe('required');
    expect(req(p, 'competency').status).toBe('required');
  });

  it('un C2 puede volar en A2 (con seguro obligatorio en A2)', () => {
    const p = profile('dji-mavic-3-pro');
    expect(openCategoryFor(p).subcategories).toEqual(['A2', 'A3']);
    expect(req(p, 'insurance').detail).toMatch(/A2/);
  });

  it('un dron sin marcado de 250 g o más solo puede volar en A3', () => {
    const p = profile('dji-mavic-air-2');
    const info = openCategoryFor(p);
    expect(info.subcategories).toEqual(['A3']);
    expect(info.warnings.length).toBeGreaterThan(0);
  });

  it('25 kg o más queda fuera de la categoría abierta', () => {
    const info = openCategoryFor({ ...CUSTOM_PROFILE, massG: 26_000, classLabel: 'legacy' });
    expect(info.open).toBe(false);
  });

  it('estima el límite de viento si el fabricante no lo publica', () => {
    expect(windLimitFor(profile('dji-mini-4-pro'))).toEqual({ limit: 10.7, estimated: false });
    expect(windLimitFor({ ...CUSTOM_PROFILE, maxWindMs: null, massG: 600 }).estimated).toBe(true);
  });

  it('reconoce la protección contra el agua', () => {
    expect(isWaterResistant(profile('dji-matrice-350-rtk'))).toBe(true);
    expect(isWaterResistant(profile('dji-mini-4-pro'))).toBe(false);
    expect(isWaterResistant({ ...CUSTOM_PROFILE, ipRating: 'IPX4' })).toBe(true);
  });
});
