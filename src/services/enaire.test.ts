import { describe, expect, it } from 'vitest';
import { ZONE_LAYER_BY_KEY, classifySeverity, esriToGeoJSON, featureToZone, htmlToText } from './enaire';

describe('enaire', () => {
  it('convierte anillos Esri (exterior horario + hueco antihorario) a GeoJSON', () => {
    const outer = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const hole = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
      [2, 2],
    ];
    const geom = esriToGeoJSON({ rings: [outer, hole] });
    expect(geom?.type).toBe('Polygon');
    expect((geom as { coordinates: unknown[] }).coordinates).toHaveLength(2);

    const second = outer.map(([x, y]) => [x + 20, y]);
    const multi = esriToGeoJSON({ rings: [outer, second] });
    expect(multi?.type).toBe('MultiPolygon');

    expect(esriToGeoJSON({ x: -3.7, y: 40.4 })).toEqual({ type: 'Point', coordinates: [-3.7, 40.4] });
  });

  it('limpia el HTML de los avisos', () => {
    expect(htmlToText('Zona <b>restringida</b><br/>Contactar &amp; coordinar')).toBe('Zona restringida\nContactar & coordinar');
    expect(htmlToText(null)).toBe('');
  });

  it('clasifica la severidad por identificador y texto', () => {
    const restricted = ZONE_LAYER_BY_KEY.restricted;
    expect(classifySeverity(restricted, { IDENT_TXT: 'LEP123' })).toBe('prohibited');
    expect(classifySeverity(restricted, { IDENT_TXT: 'LER71' })).toBe('authorization');
    expect(classifySeverity(restricted, { IDENT_TXT: 'LED45' })).toBe('caution');
    // Capa urbana de ENAIRE: aviso genérico, informativo.
    expect(classifySeverity(ZONE_LAYER_BY_KEY.urban, {})).toBe('info');
    expect(classifySeverity(ZONE_LAYER_BY_KEY.natural, { REMARKS_TXT: 'Requiere autorización del órgano gestor' })).toBe(
      'authorization',
    );
  });

  it('interpreta los mensajes de ENAIRE (todas las zonas vienen como REQ_AUTHORIZATION)', () => {
    const aero = ZONE_LAYER_BY_KEY.aerodromeZones;
    expect(classifySeverity(aero, { IDENT_TXT: 'LEMD0' })).toBe('authorization');
    expect(classifySeverity(aero, { IDENT_TXT: 'LEMD45' })).toBe('caution');
    expect(classifySeverity(aero, { message: 'NO permitido el vuelo a drones excepto coordinación' })).toBe('authorization');
    expect(classifySeverity(aero, { Message: 'Por debajo de 45 m medidos desde el ARP no es necesario coordinar' })).toBe(
      'caution',
    );
    const ctr = ZONE_LAYER_BY_KEY.controlled;
    expect(classifySeverity(ctr, { Message: 'Permitidas las operaciones VLOS a una altura máxima de 60 metros' })).toBe('caution');
    expect(classifySeverity(ZONE_LAYER_BY_KEY.notam, { DESCRIPTION: 'Vuelo PROHIBIDO para UAS' })).toBe('prohibited');
    expect(classifySeverity(ZONE_LAYER_BY_KEY.notam, { DESCRIPTION: 'NO permitido el vuelo salvo autorización' })).toBe('authorization');
    expect(classifySeverity(ZONE_LAYER_BY_KEY.restricted, { IDENT_TXT: 'LER71', REMARKS_TXT: 'NO permitido el vuelo a drones' })).toBe(
      'authorization',
    );
    expect(classifySeverity(ZONE_LAYER_BY_KEY.restricted, { Identifier: 'LEP151', Message: 'NO permitido el vuelo a drones' })).toBe(
      'prohibited',
    );
  });

  it('extrae los campos de una zona', () => {
    const zone = featureToZone(
      ZONE_LAYER_BY_KEY.aerodromeZones,
      {
        type: 'Feature',
        properties: {
          IDENT_TXT: 'LEMD',
          NAME_TXT: 'MADRID/BARAJAS',
          REMARKS_TXT: '<p>Coordinar con el aeropuerto</p>',
          DISTVERTLOWER_TXT: 'SFC',
          DISTVERTUPPER_TXT: '120 m AGL',
        },
        geometry: { type: 'Point', coordinates: [-3.56, 40.47] },
      },
      0,
    );
    expect(zone?.name).toBe('MADRID/BARAJAS');
    expect(zone?.message).toBe('Coordinar con el aeropuerto');
    expect(zone?.lower).toBe('SFC');
    expect(zone?.upper).toBe('120 m AGL');
    expect(zone?.severity).toBe('authorization');
  });

  it('lee también los campos ED-318 del servicio de datos de ENAIRE', () => {
    const zone = featureToZone(
      ZONE_LAYER_BY_KEY.controlled,
      {
        type: 'Feature',
        properties: {
          Identifier: 'LECT',
          Name: 'CTR MADRID',
          Message: '<p>Permitidas las operaciones VLOS a una altura máxima de 60 metros</p>',
          Lower: 60,
          UOM: 'M',
          LowerReference: 'AGL',
          Email: 'cop@enaire.es',
        },
        geometry: { type: 'Point', coordinates: [-3.7, 40.4] },
      },
      0,
    );
    expect(zone?.name).toBe('CTR MADRID');
    expect(zone?.lower).toBe('60 M AGL');
    expect(zone?.contact).toBe('cop@enaire.es');
    expect(zone?.severity).toBe('caution');
  });
});
