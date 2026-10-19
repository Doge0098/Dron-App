import { describe, expect, it } from 'vitest';
import { DRONE_BY_ID } from '../data/drones';
import { BLANK, draftAsText, requestDraft } from './contactRequest';
import { profileFromModel } from './drone';
import { EMPTY_PILOT } from './pilot';

const mini = profileFromModel(DRONE_BY_ID.get('dji-mini-4-pro')!);
const target = { name: 'MADRID/BARAJAS · LEMD0', kind: 'Entorno de aeródromos y helipuertos' };
const base = { placeName: 'Getafe', point: [-3.73211, 40.30512] as [number, number], time: 1_792_400_400, heightM: 80 };

describe('contactRequest', () => {
  it('rellena la solicitud con los datos del vuelo, del dron y del piloto', () => {
    const draft = requestDraft(target, {
      ...base,
      drone: mini,
      pilot: { fullName: 'Lucía García Pérez', pilotId: 'ESPd4aus1z7k8w9q-x1z', droneSerial: '1581F5BKD225' },
    });
    expect(draft.subject).toBe('Consulta para vuelo de dron · MADRID/BARAJAS · LEMD0');
    expect(draft.body).toContain('«MADRID/BARAJAS · LEMD0» (Entorno de aeródromos y helipuertos)');
    expect(draft.body).toContain('- Lugar: Getafe · coordenadas 40.30512, -3.73211');
    expect(draft.body).toContain('- Altura máxima sobre el terreno: 80 m');
    expect(draft.body).toContain('- Dron: DJI Mini 4 Pro, clase C0, 249 g\n');
    expect(draft.body).toContain('- Nº de serie del dron: 1581F5BKD225');
    expect(draft.body).toContain('- Piloto: Lucía García Pérez');
    // La parte secreta del nº de operador nunca se envía.
    expect(draft.body).toContain('- ID de piloto / nº de operador: ESPd4aus1z7k8w9q\n');
    expect(draft.body).not.toContain('x1z');
    expect(draftAsText('cop@enaire.es', draft).startsWith('Para: cop@enaire.es\nAsunto: Consulta para vuelo')).toBe(true);
  });

  it('marca los huecos que faltan por completar', () => {
    const draft = requestDraft(target, { ...base, placeName: null, time: null, drone: null, pilot: EMPTY_PILOT });
    expect(draft.body).toContain('- Lugar: coordenadas 40.30512, -3.73211');
    expect(draft.body).toContain(`- Fecha y hora previstas: ${BLANK}`);
    expect(draft.body).toContain(`- Dron: ${BLANK}`);
    expect(draft.body).toContain(`- Nº de serie del dron: ${BLANK}`);
    expect(draft.body).toContain(`- Piloto: ${BLANK}`);
    expect(draft.body).toContain(`- ID de piloto / nº de operador: ${BLANK}`);
  });
});
