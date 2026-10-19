// Zonas geográficas UAS oficiales de ENAIRE (las mismas capas que usa https://drones.enaire.es).
// Son servicios ArcGIS REST públicos; se consultan desde el navegador del usuario.
// Si fallan (red, CORS, bloqueo regional) la app lo indica y enlaza al visor oficial.

import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { LAYER_CONTACTS } from '../data/contacts';
import { contactName, extractContacts, normalizeWeb, parsePhoneField, type ContactInfo } from '../lib/contacts';
import type { BBox, LngLatTuple, Ring } from '../lib/geo';
import { pointInRing } from '../lib/geo';
import { HttpError, fetchJson } from './http';

export type ZoneSeverity = 'prohibited' | 'authorization' | 'caution' | 'info';

export type ZoneLayerKey =
  | 'aerodromeZones'
  | 'controlled'
  | 'restricted'
  | 'notam'
  | 'infrastructure'
  | 'urban'
  | 'photo'
  | 'natural'
  | 'birds'
  | 'notices'
  | 'aerodromes'
  | 'modelFields';

export interface ZoneLayerDef {
  key: ZoneLayerKey;
  label: string;
  path: string;
  geometry: 'polygon' | 'point';
  defaultSeverity: ZoneSeverity;
  /** Qué implica para el piloto (texto orientativo). */
  meaning: string;
  /** Zoom mínimo para dibujarla en el mapa (las capas grandes solo con zoom suficiente). */
  minZoom: number;
  /** `false`: solo se usa en los análisis (p. ej. la capa urbana son polígonos genéricos del tamaño de una FIR). */
  display?: boolean;
}

export const ZONE_LAYERS: ZoneLayerDef[] = [
  {
    key: 'restricted',
    label: 'Zonas prohibidas, restringidas y peligrosas',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/10',
    geometry: 'polygon',
    defaultSeverity: 'authorization',
    meaning: 'Espacio aéreo prohibido (P), restringido (R) o peligroso (D). Solo se puede volar con autorización o en las condiciones publicadas.',
    minZoom: 5,
  },
  {
    key: 'aerodromeZones',
    label: 'Entorno de aeródromos y helipuertos',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/6',
    geometry: 'polygon',
    defaultSeverity: 'authorization',
    meaning: 'Zona de protección de un aeródromo o helipuerto: requiere coordinación/autorización del gestor o del proveedor ATS antes de volar.',
    minZoom: 6,
  },
  {
    key: 'controlled',
    label: 'Espacio aéreo controlado (CTR) y FIZ',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/1',
    geometry: 'polygon',
    defaultSeverity: 'caution',
    meaning: 'CTR o FIZ: en VLOS se puede volar sin coordinar hasta 60 m de altura (fuera de zonas de aeródromo); por encima hay que coordinar con el proveedor ATS.',
    minZoom: 5,
  },
  {
    key: 'notam',
    label: 'NOTAM para UAS',
    path: 'NOTAM/NOTAM_UAS_APP_V3/MapServer/1',
    geometry: 'polygon',
    defaultSeverity: 'authorization',
    meaning: 'Restricción temporal publicada por NOTAM. Revisa fechas, horario y altitudes afectadas.',
    minZoom: 6,
  },
  {
    key: 'infrastructure',
    label: 'Infraestructuras críticas e instalaciones sensibles',
    path: 'NSF/Drones_ZG_Infra_V0/MapServer/11',
    geometry: 'polygon',
    defaultSeverity: 'authorization',
    meaning: 'Infraestructuras de servicios esenciales (art. 39): sin permiso del titular no se puede volar a menos de 25 m de las lineales ni a 10 m de las demás, hasta 50 m por encima.',
    minZoom: 12,
  },
  {
    key: 'urban',
    label: 'Núcleos urbanos',
    path: 'NSF/Drones_ZG_Urbano_V0/MapServer/11',
    geometry: 'polygon',
    defaultSeverity: 'info',
    meaning: 'Aviso general de ENAIRE: comprueba si vuelas en entorno urbano (comunicación a Interior con 5 días, sin sobrevolar edificios).',
    minZoom: 11,
    display: false,
  },
  {
    key: 'photo',
    label: 'Restricción al vuelo fotográfico (RVF)',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/3',
    geometry: 'polygon',
    defaultSeverity: 'caution',
    meaning: 'Zona restringida al vuelo fotográfico: captar imágenes requiere autorización del CECAF (solicitud OIA).',
    minZoom: 8,
  },
  {
    key: 'natural',
    label: 'Espacios naturales protegidos',
    path: 'ENP/ENP_APP_Local_V4/MapServer/0',
    geometry: 'polygon',
    defaultSeverity: 'caution',
    meaning: 'Espacio natural protegido: puede haber limitaciones medioambientales (consulta al órgano gestor del espacio).',
    minZoom: 8,
  },
  {
    key: 'birds',
    label: 'Zonas de especial protección para las aves (ZEPA)',
    path: 'ENP/ENP_APP_Local_V4/MapServer/1',
    geometry: 'polygon',
    defaultSeverity: 'caution',
    meaning: 'ZEPA de la Red Natura 2000: evita molestar a la fauna, especialmente en época de cría.',
    minZoom: 8,
  },
  {
    key: 'notices',
    label: 'Avisos',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/2',
    geometry: 'polygon',
    defaultSeverity: 'info',
    meaning: 'Información adicional publicada por ENAIRE para la zona.',
    minZoom: 8,
  },
  {
    key: 'aerodromes',
    label: 'Aeródromos y helipuertos',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/0',
    geometry: 'point',
    defaultSeverity: 'info',
    meaning: 'Aeródromo o helipuerto publicado por ENAIRE.',
    minZoom: 7,
  },
  {
    key: 'modelFields',
    label: 'Zonas de aeromodelismo',
    path: 'NSF/Drones_ZG_Aero_V3/MapServer/4',
    geometry: 'point',
    defaultSeverity: 'info',
    meaning: 'Zona de vuelo de aeromodelismo: puede haber otras aeronaves no tripuladas en el aire.',
    minZoom: 9,
  },
];

export const ZONE_LAYER_BY_KEY = Object.fromEntries(ZONE_LAYERS.map((l) => [l.key, l])) as Record<
  ZoneLayerKey,
  ZoneLayerDef
>;

export const SEVERITY_ORDER: Record<ZoneSeverity, number> = { prohibited: 3, authorization: 2, caution: 1, info: 0 };

export const SEVERITY_LABEL: Record<ZoneSeverity, string> = {
  prohibited: 'Prohibido sin autorización expresa',
  authorization: 'Requiere coordinación o autorización',
  caution: 'Condiciones o limitaciones',
  info: 'Informativo',
};

export interface UasZone {
  uid: string;
  layer: ZoneLayerKey;
  layerLabel: string;
  name: string;
  identifier: string;
  message: string;
  lower: string;
  upper: string;
  schedule: string;
  /** Contacto publicado por ENAIRE para la zona (`null` si no publica ninguno). */
  contact: ContactInfo | null;
  validity: string;
  severity: ZoneSeverity;
  geometry: Geometry;
}

export type QueryGeometry =
  | { type: 'point'; point: LngLatTuple }
  | { type: 'bbox'; bbox: BBox }
  | { type: 'polygon'; ring: Ring };

export interface ZoneQueryResult {
  zones: UasZone[];
  failedLayers: ZoneLayerKey[];
  /** Todas las capas fallaron: ENAIRE no está disponible desde este navegador. */
  unavailable: boolean;
}

const DIRECT_BASE = 'https://servais.enaire.es/insignias/rest/services';
const DEV_PROXY_BASE = '/enaire-proxy/insignias/rest/services';
const CONFIGURED_BASE = (import.meta.env.VITE_ENAIRE_BASE_URL as string | undefined)?.replace(/\/$/, '');

let preferProxy = false;

/** Enlace al visor oficial de ENAIRE centrado en un punto. */
export function enaireViewerUrl(point: LngLatTuple, level = 13): string {
  return `https://drones.enaire.es/?center=${point[0].toFixed(5)},${point[1].toFixed(5)}&level=${level}`;
}

function esriGeometry(geom: QueryGeometry): { geometry: string; geometryType: string } {
  const sr = { wkid: 4326 };
  switch (geom.type) {
    case 'point':
      return {
        geometry: JSON.stringify({ x: geom.point[0], y: geom.point[1], spatialReference: sr }),
        geometryType: 'esriGeometryPoint',
      };
    case 'bbox': {
      const [xmin, ymin, xmax, ymax] = geom.bbox;
      return {
        geometry: JSON.stringify({ xmin, ymin, xmax, ymax, spatialReference: sr }),
        geometryType: 'esriGeometryEnvelope',
      };
    }
    case 'polygon':
      return {
        geometry: JSON.stringify({
          rings: [geom.ring.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))])],
          spatialReference: sr,
        }),
        geometryType: 'esriGeometryPolygon',
      };
  }
}

interface EsriFeature {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number; rings?: number[][][] };
}

/** Suma de trapecios sobre las aristas: positiva para anillos en sentido horario. */
function signedArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);
  return a / 2;
}

/** Convierte una geometría Esri JSON (rings/x,y) a GeoJSON agrupando huecos en su anillo exterior. */
export function esriToGeoJSON(geometry: EsriFeature['geometry']): Geometry | null {
  if (!geometry) return null;
  if (typeof geometry.x === 'number' && typeof geometry.y === 'number') {
    return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  }
  const rings = geometry.rings?.filter((r) => r.length >= 4);
  if (!rings?.length) return null;
  // En Esri los anillos exteriores van en sentido horario y los huecos en antihorario.
  const outers: Position[][][] = [];
  const holes: Position[][] = [];
  for (const ring of rings) {
    if (signedArea(ring) >= 0) outers.push([ring]);
    else holes.push(ring);
  }
  if (outers.length === 0) return { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
  for (const hole of holes) {
    const owner = outers.find((poly) => pointInRing(hole[0] as LngLatTuple, poly[0] as Ring));
    (owner ?? outers[0]).push(hole);
  }
  return outers.length === 1
    ? { type: 'Polygon', coordinates: outers[0] }
    : { type: 'MultiPolygon', coordinates: outers };
}

/** Quita etiquetas HTML de los textos de ENAIRE (se muestran siempre como texto plano). */
export function htmlToText(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (!/[<&]/.test(s)) return s.trim();
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(s.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
    return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

type Props = Record<string, unknown>;

/** Claves en minúsculas: las capas del visor usan NAME_TXT, REMARKS_TXT…, y la API ED-318 Name, Message… */
function lowerKeys(props: Props | null | undefined): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props ?? {})) out[k.toLowerCase()] = v;
  return out;
}

const pick = (props: Props, ...keys: string[]): string => {
  for (const key of keys) {
    const text = htmlToText(props[key.toLowerCase()]);
    if (text && text.toLowerCase() !== 'null') return text;
  }
  return '';
};

function formatDate(value: unknown): string {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  const date = Number.isFinite(n) ? new Date(n) : typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return htmlToText(value);
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function limitText(props: Props, which: 'LOWER' | 'UPPER'): string {
  const txt = pick(props, `DISTVERT${which}_TXT`);
  if (txt) return txt;
  // ED-318: Lower/Upper + UOM + LowerReference/UpperReference.
  const ed = pick(props, which);
  if (ed) {
    return [ed, pick(props, 'uom'), pick(props, `${which}Reference`)].filter(Boolean).join(' ');
  }
  const val = props[`distvert${which.toLowerCase()}_val`];
  if (val == null || val === '') return '';
  return [String(val), pick(props, `DISTVERT${which}_UOM`), pick(props, `DISTVERT${which}_CODE`)].filter(Boolean).join(' ');
}

/**
 * Severidad a partir de la capa, el identificador y el texto publicado. ENAIRE marca todas las zonas
 * como REQ_AUTHORIZATION: el significado real está en el mensaje (p. ej. «NO permitido el vuelo a drones
 * excepto coordinación» o «por debajo de 45 m… no es necesario coordinar»).
 */
export function classifySeverity(layer: ZoneLayerDef, rawProps: Props): ZoneSeverity {
  const props = lowerKeys(rawProps);
  const ident = pick(props, 'IDENT_TXT', 'identifier', 'name').toUpperCase();
  const type = pick(props, 'TYPE_CODE', 'extendedProperties').toUpperCase();
  const text = [
    pick(props, 'RESTRICCION_LOWER'),
    pick(props, 'RESTRICCION_UPPER'),
    pick(props, 'REMARKS_TXT_S', 'REMARKS_TXT', 'message'),
    pick(props, 'DESCRIPTION'),
  ]
    .join(' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (layer.key === 'restricted') {
    if (/^(LE|GC|GE)P/.test(ident) || type === 'P' || /P-PROHIBIDA/.test(type)) return 'prohibited';
    if (/^(LE|GC|GE)D/.test(ident) || type === 'D') return 'caution';
    if (/^(LE|GC|GE)R/.test(ident) || type === 'R') return 'authorization';
  }
  if (layer.key === 'aerodromeZones') {
    // XXXX0: hay que coordinar a cualquier altura; XXXX45 / XXXX90: solo por encima de 45/90 m.
    if (/^[A-Z]{4}(45|90)$/.test(ident)) return 'caution';
    if (/^[A-Z]{4}0$/.test(ident)) return 'authorization';
  }
  // Sin los "NO PERMITIDO…" para que no cuenten como permiso (sin lookbehind: Safari < 16.4 no lo admite).
  const affirmative = text.replace(/NO PERMITID[OA]S?/g, '');
  if (
    /NO ES NECESARIO COORDINAR|SIN NECESIDAD DE COORDINA/.test(text) ||
    /PERMITID[OA]S? (LAS )?OPERACIONES|PERMITIDO EL VUELO/.test(affirmative)
  ) {
    return 'caution';
  }
  if (/(EXCEPTO|SALVO|PREVIA|REQUIERE|SIN) (COORDINACION|AUTORIZACION)|COORDINAR CON|COORDINACION CON/.test(text)) {
    return 'authorization';
  }
  if (/NO PERMITIDO|PROHIBID/.test(text)) return 'prohibited';
  if (/AUTORIZ|PERMISO/.test(text) && SEVERITY_ORDER[layer.defaultSeverity] < SEVERITY_ORDER.authorization) return 'authorization';
  return layer.defaultSeverity;
}

/** "P15D" → "15 días", "PT48H" → "48 horas" (duraciones ISO 8601 de ED-318). */
export function formatIsoDuration(value: string): string {
  const m = value.trim().toUpperCase().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return value.trim();
  const part = (n: string | undefined, one: string, many: string) => (n ? `${Number(n)} ${Number(n) === 1 ? one : many}` : '');
  return [part(m[1], 'día', 'días'), part(m[2], 'hora', 'horas'), part(m[3], 'minuto', 'minutos')].filter(Boolean).join(' y ');
}

/**
 * Contacto de la entidad responsable: campos de autoridad (visor: CONTACTO, name_authority, contactName,
 * email, phone, siteURL; ED-318: Service, ContactName, Email, Phone, SiteURL, IntervalBefore) y los
 * teléfonos y correos que aparezcan en los textos publicados de la zona.
 */
function zoneContact(props: Props, texts: string[]): ContactInfo | null {
  const authority = pick(props, 'name_authority', 'nameAuthority', 'authority', 'service');
  const person = pick(props, 'CONTACTO', 'contactName');
  const emailField = pick(props, 'email');
  const phoneField = pick(props, 'phone');
  const webField = pick(props, 'siteURL', 'sireURL');
  // Las webs solo de los campos de contacto: en los mensajes suelen ser referencias normativas.
  const own = extractContacts(authority, person, emailField);
  const found = extractContacts(...texts);
  const phones = [...parsePhoneField(phoneField), ...own.phones, ...found.phones].filter((p, i, all) => all.indexOf(p) === i);
  const emails = [...own.emails, ...found.emails].filter((e, i, all) => all.indexOf(e) === i);
  const web = (webField && normalizeWeb(webField)) || own.urls[0] || null;
  const names = [contactName(authority), contactName(person)].filter((n, i, all) => n && all.indexOf(n) === i);
  const interval = pick(props, 'intervalBefore');
  if (!phones.length && !emails.length && !web && !names.length && !interval) return null;
  return {
    name: names.join(' · ') || 'Responsable de la zona',
    phones: phones.map((number) => ({ number })),
    emails,
    web,
    source: 'zone',
    note: interval ? `Antelación mínima indicada: ${formatIsoDuration(interval)}.` : undefined,
  };
}

/** "MADRID/BARAJAS · LEMD0" (sin repetir el identificador si coincide con el nombre). */
export const zoneTitle = (zone: Pick<UasZone, 'name' | 'identifier'>) =>
  zone.identifier && zone.identifier !== zone.name ? `${zone.name} · ${zone.identifier}` : zone.name;

/**
 * Contactos a mostrar en el aviso de una zona: el publicado para ella y, si le falta teléfono o correo,
 * también el contacto oficial según el tipo de zona.
 */
export function zoneContacts(zone: Pick<UasZone, 'layer' | 'contact'>): ContactInfo[] {
  const general = LAYER_CONTACTS[zone.layer];
  const own = zone.contact;
  if (!own) return general ? [general] : [];
  return own.phones.length && own.emails.length ? [own] : general ? [own, general] : [own];
}

export function featureToZone(layer: ZoneLayerDef, feature: Feature, index: number): UasZone | null {
  if (!feature.geometry) return null;
  const raw = (feature.properties ?? {}) as Props;
  const props = lowerKeys(raw);
  const identifier = pick(props, 'IDENT_TXT', 'identifier', 'GFID', 'ICAO_TXT');
  const name = pick(props, 'NAME_TXT', 'name', 'SITENAME', 'NOMBRE_50') || identifier || layer.label;
  const message =
    layer.key === 'notam'
      ? pick(props, 'DESCRIPTION')
      : pick(props, 'REMARKS_TXT', 'message', 'REMARKS_TXT_S', 'FIGURA_LP', 'otherReasonInfo', 'reasons');
  const validity =
    layer.key === 'notam' && (props.INITIAL_DATE || props.END_DATE)
      ? `${formatDate(props.INITIAL_DATE)} → ${formatDate(props.END_DATE)}`
      : '';
  return {
    uid: `${layer.key}:${pick(props, 'OBJECTID', 'GFID') || identifier || index}:${index}`,
    layer: layer.key,
    layerLabel: layer.label,
    name,
    identifier,
    message,
    lower: limitText(props, 'LOWER') || pick(props, 'NIVEL_INF', 'LOWER_VAL'),
    upper: limitText(props, 'UPPER') || pick(props, 'NIVEL_SUP', 'UPPER_VAL', 'FLYING_LEVELS_DESC'),
    schedule: pick(props, 'WORKHRRMK_TXT', 'WORKHR_CODE', 'day'),
    contact: zoneContact(props, [message, pick(props, 'REMARKS_TXT_S'), pick(props, 'DESCRIPTION')]),
    validity,
    severity: classifySeverity(layer, raw),
    geometry: feature.geometry,
  };
}

async function requestLayer(
  base: string,
  layer: ZoneLayerDef,
  geom: QueryGeometry,
  format: 'geojson' | 'json',
  simplifyDeg: number | undefined,
  signal?: AbortSignal,
): Promise<Feature[]> {
  const { geometry, geometryType } = esriGeometry(geom);
  const params = new URLSearchParams({
    where: '1=1',
    geometry,
    geometryType,
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '6',
    f: format,
  });
  if (simplifyDeg && layer.geometry === 'polygon') params.set('maxAllowableOffset', String(simplifyDeg));
  const url = `${base}/${layer.path}/query`;
  const query = params.toString();
  // Igual que el SDK de Esri: GET si la URL es corta y POST form-urlencoded (petición "simple",
  // sin preflight CORS) para geometrías largas.
  const usePost = url.length + query.length > 1800;
  const data = await fetchJson<FeatureCollection & { error?: { message?: string }; features: unknown[] }>(
    usePost ? url : `${url}?${query}`,
    {
      signal,
      timeoutMs: 20_000,
      init: usePost
        ? { method: 'POST', body: query, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        : undefined,
    },
  );
  if (data.error) throw new HttpError(data.error.message ?? 'Error de ArcGIS', 400, url);
  if (format === 'geojson') return data.features as Feature[];
  return (data.features as EsriFeature[]).map((f) => ({
    type: 'Feature',
    properties: f.attributes,
    geometry: esriToGeoJSON(f.geometry) as Geometry,
  }));
}

async function queryLayer(
  layer: ZoneLayerDef,
  geom: QueryGeometry,
  simplifyDeg: number | undefined,
  signal?: AbortSignal,
): Promise<UasZone[]> {
  const bases = CONFIGURED_BASE
    ? [CONFIGURED_BASE]
    : import.meta.env.DEV
      ? preferProxy
        ? [DEV_PROXY_BASE, DIRECT_BASE]
        : [DIRECT_BASE, DEV_PROXY_BASE]
      : [DIRECT_BASE];
  let lastError: unknown;
  for (const base of bases) {
    try {
      let features: Feature[];
      try {
        features = await requestLayer(base, layer, geom, 'geojson', simplifyDeg, signal);
      } catch (err) {
        // Servidores ArcGIS antiguos no admiten f=geojson: se reintenta con Esri JSON.
        if (err instanceof HttpError && err.status === 400) {
          features = await requestLayer(base, layer, geom, 'json', simplifyDeg, signal);
        } else throw err;
      }
      if (base === DEV_PROXY_BASE) preferProxy = true;
      return features.map((f, i) => featureToZone(layer, f, i)).filter((z): z is UasZone => z !== null);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/** Consulta varias capas en paralelo. Nunca lanza por fallos de capa: los devuelve en `failedLayers`. */
export async function queryZones(
  geom: QueryGeometry,
  layers: ZoneLayerDef[] = ZONE_LAYERS,
  options: { simplifyDeg?: number; signal?: AbortSignal } = {},
): Promise<ZoneQueryResult> {
  const results = await Promise.allSettled(layers.map((l) => queryLayer(l, geom, options.simplifyDeg, options.signal)));
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const zones: UasZone[] = [];
  const failedLayers: ZoneLayerKey[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') zones.push(...r.value);
    else failedLayers.push(layers[i].key);
  });
  zones.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  return { zones, failedLayers, unavailable: failedLayers.length === layers.length };
}

/** Geometrías poligonales de una zona para dibujarla (descarta puntos). */
export function zonePolygons(zone: UasZone): Polygon | MultiPolygon | null {
  return zone.geometry.type === 'Polygon' || zone.geometry.type === 'MultiPolygon' ? zone.geometry : null;
}
