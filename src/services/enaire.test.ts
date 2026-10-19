import { describe, expect, it } from 'vitest';
import { ZONE_LAYER_BY_KEY, classifySeverity, esriToGeoJSON, featureToZone, formatIsoDuration, htmlToText, zoneContacts } from './enaire';

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
    expect(zone?.contact?.emails).toEqual(['cop@enaire.es']);
    expect(zone?.severity).toBe('caution');
  });

  it('extrae el contacto del responsable con teléfono y correo', () => {
    const point = { type: 'Point' as const, coordinates: [-2.91, 43.3] };
    const ed318 = featureToZone(
      ZONE_LAYER_BY_KEY.aerodromeZones,
      {
        type: 'Feature',
        properties: {
          Identifier: 'LEBB0',
          Name: 'BILBAO',
          Service: 'Aeropuerto de Bilbao',
          ContactName: 'Oficina de operaciones',
          Phone: '944 86 96 63',
          Email: 'Operaciones.BIO@aena.es',
          SiteURL: 'www.aena.es',
          IntervalBefore: 'P15D',
        },
        geometry: point,
      },
      0,
    );
    expect(ed318?.contact).toEqual({
      name: 'Aeropuerto de Bilbao · Oficina de operaciones',
      phones: [{ number: '+34944869663' }],
      emails: ['operaciones.bio@aena.es'],
      web: 'https://www.aena.es',
      source: 'zone',
      note: 'Antelación mínima indicada: 15 días.',
    });
    expect(zoneContacts(ed318!)).toHaveLength(1);

    // Visor: contacto dentro del texto de la zona.
    const viewer = featureToZone(
      ZONE_LAYER_BY_KEY.infrastructure,
      {
        type: 'Feature',
        properties: {
          name: 'Central térmica',
          REMARKS_TXT: 'Solicitar permiso al titular: seguridad@central.es, tfno. 985 12 34 56',
          CONTACTO: 'Gestor de la central',
        },
        geometry: point,
      },
      0,
    );
    expect(viewer?.contact?.name).toBe('Gestor de la central');
    expect(viewer?.contact?.phones).toEqual([{ number: '+34985123456' }]);
    expect(viewer?.contact?.emails).toEqual(['seguridad@central.es']);
  });

  it('sin contacto propio (o incompleto) añade el contacto oficial del tipo de zona', () => {
    const bare = featureToZone(
      ZONE_LAYER_BY_KEY.controlled,
      { type: 'Feature', properties: { IDENT_TXT: 'LECM', NAME_TXT: 'CTR MADRID' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      0,
    )!;
    expect(bare.contact).toBeNull();
    const general = zoneContacts(bare);
    expect(general).toHaveLength(1);
    expect(general[0].source).toBe('general');
    expect(general[0].phones.length).toBeGreaterThan(0);
    expect(general[0].emails.length).toBeGreaterThan(0);

    const onlyEmail = { layer: 'controlled' as const, contact: { ...general[0], phones: [], source: 'zone' as const } };
    expect(zoneContacts(onlyEmail).map((c) => c.source)).toEqual(['zone', 'general']);
    // Capas sin contacto oficial genérico (p. ej. puntos de aeromodelismo).
    expect(zoneContacts({ layer: 'modelFields', contact: null })).toEqual([]);
  });

  it('traduce las duraciones ISO 8601', () => {
    expect(formatIsoDuration('P15D')).toBe('15 días');
    expect(formatIsoDuration('PT48H')).toBe('48 horas');
    expect(formatIsoDuration('P1DT2H')).toBe('1 día y 2 horas');
    expect(formatIsoDuration('5 días hábiles')).toBe('5 días hábiles');
  });
});
