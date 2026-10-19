// Contactos oficiales de las entidades que gestionan cada tipo de restricción, para cuando la zona de
// ENAIRE no publica uno propio. Fuentes (revisadas en octubre de 2026):
//  - AIC NTL 01/26 de ENAIRE: https://aip.enaire.es/AIP/contenido_AIC/N/LE_Circ_2026_N_01_es.html
//  - AESA, contacto: https://www.seguridadaerea.gob.es/es/quienes-somos/contactanos

import type { ContactInfo } from '../lib/contacts';
import type { ZoneLayerKey } from '../services/enaire';

const ENAIRE_AIS_PHONE = { number: '+34913213363', label: 'Información aeronáutica de ENAIRE (AIS)' };

export const AESA_DRONES: ContactInfo = {
  name: 'AESA · Buzón de drones',
  phones: [{ number: '+34913968450', label: 'Drones (lunes a viernes, 9:00 a 13:00)' }],
  emails: ['drones.aesa@seguridadaerea.es'],
  web: 'https://www.seguridadaerea.gob.es/es/ambitos/drones',
  source: 'general',
  note: 'Consultas sobre normativa, registro de operador y operaciones.',
};

export const ENAIRE_COORDINATION: ContactInfo = {
  name: 'ENAIRE · Coordinación Operativa (COOP)',
  phones: [ENAIRE_AIS_PHONE],
  emails: ['cop@enaire.es'],
  web: 'https://planea.enaire.es',
  source: 'general',
  note: 'Las solicitudes se tramitan en ENAIRE Planea; el correo es el canal de apoyo.',
};

const ENAIRE_AIS: ContactInfo = {
  name: 'ENAIRE · Información aeronáutica (AIS)',
  phones: [ENAIRE_AIS_PHONE],
  emails: ['ais@enaire.es'],
  web: 'https://notampib.enaire.es/icaro',
  source: 'general',
};

/** Zonas de aeródromo (también las orientativas calculadas con el dataset local). */
export const AERODROME_CONTACT: ContactInfo = {
  ...ENAIRE_COORDINATION,
  name: 'Gestor del aeródromo / ENAIRE',
  web: 'https://www.aena.es/es/corporativa/seguridad-operacional/tramites/coordinacion-actividades-uas-zonas-fuera-atz-ctr-fiz.html',
  note: 'Aeropuertos de Aena fuera de ATZ/CTR/FIZ: formulario de Aena (enlace). Dentro de ATZ/CTR/FIZ: ENAIRE Planea.',
};

/** Vuelos en entorno urbano (art. 40): comunicación previa al Ministerio del Interior. */
export const URBAN_CONTACT: ContactInfo = {
  name: 'Ministerio del Interior · Comunicación de vuelos UAS',
  phones: [],
  emails: [],
  web: 'https://www.interior.gob.es/opencms/es/servicios-al-ciudadano/comunicacion-operaciones-de-aeronaves-pilotadas-por-control-remoto-uas/',
  source: 'general',
  note: 'Se comunica con el formulario de la sede electrónica, al menos 5 días naturales antes.',
};

/** Contacto oficial según el tipo de zona, para cuando ENAIRE no publica uno propio. */
export const LAYER_CONTACTS: Partial<Record<ZoneLayerKey, ContactInfo>> = {
  controlled: {
    ...ENAIRE_COORDINATION,
    note: 'Por encima de 60 m se coordina en ENAIRE Planea con ≥ 10 días. Si el CTR lo presta SKYWAY (oficina.tecnica@skyway-ans.com) o SAERCO (operations@saerco.com), contacta con ellos.',
  },
  restricted: {
    ...ENAIRE_COORDINATION,
    name: 'Zona de Defensa · coordinación a través de ENAIRE',
    note: 'Solicítalo en ENAIRE Planea (sección UAS) con al menos 15 días naturales de antelación.',
  },
  aerodromeZones: AERODROME_CONTACT,
  notam: { ...ENAIRE_AIS, note: 'Consulta el NOTAM completo en ICARO XXI.' },
  notices: ENAIRE_AIS,
  photo: {
    name: 'CECAF · Ejército del Aire y del Espacio',
    phones: [],
    emails: ['cecaf@ea.mde.es'],
    web: null,
    source: 'general',
    note: 'Solicitud de Obtención de Imágenes Aéreas (OIA). No publica teléfono; responde en unos 15 días hábiles.',
  },
  urban: URBAN_CONTACT,
  infrastructure: {
    ...AESA_DRONES,
    name: 'Titular de la infraestructura (consulta AESA si no lo encuentras)',
    note: 'El permiso lo da el titular o gestor de la infraestructura; su contacto suele figurar en ENAIRE Drones.',
  },
  natural: {
    ...AESA_DRONES,
    name: 'Órgano gestor del espacio protegido',
    phones: [],
    emails: [],
    web: null,
    note: 'Lo gestiona la consejería de medio ambiente de la comunidad autónoma (o el organismo del parque nacional).',
  },
  birds: {
    ...AESA_DRONES,
    name: 'Órgano gestor del espacio protegido',
    phones: [],
    emails: [],
    web: null,
    note: 'Lo gestiona la consejería de medio ambiente de la comunidad autónoma.',
  },
};
