import { describe, expect, it } from 'vitest';
import { EMPTY_PILOT, hasPilotData, publicPilotId, splitOperatorNumber } from './pilot';

describe('pilot', () => {
  it('separa la parte secreta del nº de operador', () => {
    expect(splitOperatorNumber(' ESPd4aus1z7k8w9q-x1z ')).toEqual({ publicPart: 'ESPd4aus1z7k8w9q', secret: 'x1z' });
    expect(splitOperatorNumber('ESPd4aus1z7k8w9q')).toBeNull();
    expect(splitOperatorNumber('ESP-RP-0001234')).toBeNull();
  });

  it('el ID que se comparte nunca lleva la parte secreta', () => {
    expect(publicPilotId('ESPd4aus1z7k8w9q-x1z')).toBe('ESPd4aus1z7k8w9q');
    expect(publicPilotId('  ESP-RP-0001234 ')).toBe('ESP-RP-0001234');
    expect(publicPilotId('')).toBe('');
  });

  it('detecta si hay datos del piloto', () => {
    expect(hasPilotData(EMPTY_PILOT)).toBe(false);
    expect(hasPilotData({ ...EMPTY_PILOT, droneSerial: '1581F5BKD225' })).toBe(true);
  });
});
