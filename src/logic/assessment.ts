// Evaluación de la idoneidad del vuelo: meteorología frente a los límites del dron y espacio aéreo.

import { formatDistance } from '../lib/geo';
import { weatherCodeInfo } from '../lib/weatherCodes';
import { msToKmh } from '../lib/wind';
import { CTR_FREE_HEIGHT_M } from '../data/regulations';
import { isLegalNight } from '../lib/sun';
import type { Surroundings } from '../map/surroundings';
import { AERODROME_TYPE_LABEL, type NearbyAerodrome } from '../services/aerodromes';
import { SEVERITY_ORDER, type UasZone } from '../services/enaire';
import { kpAt, type KpEntry } from '../services/kp';
import { WIND_HEIGHTS, type HourWeather, type PointForecast, type WindHeight, hourAt } from '../services/openMeteo';
import { isWaterResistant, openCategoryFor, windLimitFor, type DroneProfile } from './drone';

export type Level = 'ok' | 'caution' | 'no';
export type CheckLevel = Level | 'info';

export interface Check {
  id: string;
  label: string;
  level: CheckLevel;
  value: string;
  detail: string;
  /** Indicación concreta para la altura de vuelo elegida (p. ej. el límite de 60 m en CTR). */
  note?: string;
}

export const LEVEL_LABEL: Record<Level, string> = {
  ok: 'Apto',
  caution: 'Precaución',
  no: 'No recomendado',
};

const LEVEL_RANK: Record<CheckLevel, number> = { info: 0, ok: 0, caution: 1, no: 2 };

export function worstLevel(checks: { level: CheckLevel }[]): Level {
  let worst: Level = 'ok';
  for (const c of checks) {
    if (LEVEL_RANK[c.level] > LEVEL_RANK[worst]) worst = c.level as Level;
  }
  return worst;
}

const kmh = (ms: number) => `${Math.round(msToKmh(ms))} km/h`;
const ms1 = (ms: number) => `${ms.toFixed(1).replace('.', ',')} m/s`;

/** Viento máximo entre el suelo (10 m) y la altura de vuelo elegida. */
export function maxWindUpTo(hour: HourWeather, height: WindHeight): { speed: number; dir: number; at: WindHeight } {
  let best = { speed: NaN, dir: NaN, at: 10 as WindHeight };
  for (const h of WIND_HEIGHTS) {
    if (h > height) break;
    const w = hour.wind[h];
    if (Number.isFinite(w.speed) && !(w.speed <= best.speed)) best = { speed: w.speed, dir: w.dir, at: h };
  }
  return best;
}

export interface WeatherContext {
  height: WindHeight;
  kp?: number | null;
  /** Noche legal (crepúsculo civil). Si no se indica se usa el día/noche de Open-Meteo. */
  night?: boolean;
}

export function weatherChecks(drone: DroneProfile, hour: HourWeather, ctx: WeatherContext): Check[] {
  const checks: Check[] = [];
  const { limit, estimated } = windLimitFor(drone);
  const limitText = `${estimated ? 'límite estimado' : 'resistencia del fabricante'}: ${kmh(limit)}`;

  const wind = maxWindUpTo(hour, ctx.height);
  if (Number.isFinite(wind.speed)) {
    const ratio = wind.speed / limit;
    checks.push({
      id: 'wind',
      label: `Viento (hasta ${ctx.height} m)`,
      level: ratio >= 0.85 ? 'no' : ratio >= 0.6 ? 'caution' : 'ok',
      value: `${kmh(wind.speed)} · ${ms1(wind.speed)}`,
      detail:
        ratio >= 0.85
          ? `Demasiado cerca del límite del dron (${limitText}). Riesgo de deriva y de no poder volver.`
          : ratio >= 0.6
            ? `Viento apreciable para tu dron (${limitText}). Vigila la batería: volver contra el viento consume más.`
            : `Dentro de un margen cómodo (${limitText}).`,
    });
  }

  if (Number.isFinite(hour.gusts)) {
    const ratio = hour.gusts / limit;
    checks.push({
      id: 'gusts',
      label: 'Rachas (10 m)',
      level: ratio >= 1 ? 'no' : ratio >= 0.75 ? 'caution' : 'ok',
      value: kmh(hour.gusts),
      detail:
        ratio >= 1
          ? 'Las rachas superan lo que soporta el dron.'
          : ratio >= 0.75
            ? 'Rachas fuertes: pueden desestabilizar el dron, sobre todo en altura.'
            : 'Rachas moderadas o débiles.',
    });
  }

  const code = weatherCodeInfo(hour.weatherCode);
  const waterproof = isWaterResistant(drone);
  const precip = Number.isFinite(hour.precipitation) ? hour.precipitation : 0;
  const prob = hour.precipitationProbability;
  let precipLevel: CheckLevel = 'ok';
  let precipDetail = 'Sin precipitación prevista.';
  if (code.storm) {
    precipLevel = 'no';
    precipDetail = 'Tormenta: riesgo de rayos, granizo y rachas violentas. No vueles.';
  } else if (code.snow || precip >= 0.1 || code.wet) {
    precipLevel = waterproof && !code.snow ? 'caution' : 'no';
    precipDetail = waterproof
      ? `Precipitación prevista. Tu dron tiene protección ${drone.ipRating}, pero reduce visibilidad y autonomía.`
      : 'Precipitación prevista y el dron no está protegido contra el agua: puede averiarse.';
  } else if (Number.isFinite(prob) && prob >= 50) {
    precipLevel = 'caution';
    precipDetail = `Probabilidad de precipitación del ${Math.round(prob)} %.`;
  } else if (Number.isFinite(prob) && prob >= 25) {
    precipLevel = 'info';
    precipDetail = `Probabilidad de precipitación del ${Math.round(prob)} %.`;
  }
  checks.push({
    id: 'precip',
    label: 'Lluvia / nieve',
    level: precipLevel,
    value: `${code.icon} ${precip.toFixed(1).replace('.', ',')} mm/h${Number.isFinite(prob) ? ` · ${Math.round(prob)} %` : ''}`,
    detail: precipDetail,
  });

  if (Number.isFinite(hour.visibility)) {
    const v = hour.visibility;
    checks.push({
      id: 'visibility',
      label: 'Visibilidad',
      level: v < 1000 || code.fog ? (v < 1000 ? 'no' : 'caution') : v < 3000 ? 'caution' : 'ok',
      value: formatDistance(v),
      detail:
        v < 1000
          ? 'Niebla o visibilidad muy reducida: no podrás mantener el contacto visual (VLOS).'
          : v < 3000
            ? 'Visibilidad reducida: mantén el dron cerca.'
            : 'Buena visibilidad.',
    });
  }

  if (Number.isFinite(hour.temperature)) {
    const t = hour.temperature;
    const min = drone.minTempC ?? -10;
    const max = drone.maxTempC ?? 40;
    const level: CheckLevel = t < min || t > max ? 'no' : t < min + 3 || t > max - 3 ? 'caution' : t < 5 ? 'info' : 'ok';
    checks.push({
      id: 'temperature',
      label: 'Temperatura',
      level,
      value: `${Math.round(t)} °C`,
      detail:
        level === 'no'
          ? `Fuera del rango de funcionamiento (${min} °C a ${max} °C).`
          : level === 'caution'
            ? `Cerca del límite de funcionamiento (${min} °C a ${max} °C).`
            : t < 5
              ? 'Frío: las baterías rinden menos. Mantenlas templadas antes de despegar.'
              : `Dentro del rango de funcionamiento (${min} °C a ${max} °C).`,
    });
  }

  if (ctx.kp != null && Number.isFinite(ctx.kp)) {
    const kp = ctx.kp;
    checks.push({
      id: 'kp',
      label: 'Actividad geomagnética (Kp)',
      level: kp >= 7 ? 'no' : kp >= 5 ? 'caution' : 'ok',
      value: `Kp ${kp.toFixed(1).replace('.', ',')}`,
      detail: kp >= 5 ? 'Tormenta geomagnética: el GPS y la brújula pueden ser imprecisos.' : 'Sin efecto apreciable en el GPS.',
    });
  }

  const night = ctx.night ?? !hour.isDay;
  const hasGreenLight = ['C1', 'C2', 'C3'].includes(drone.classLabel);
  checks.push({
    id: 'daylight',
    label: 'Luz',
    level: night ? 'caution' : 'ok',
    value: night ? 'De noche' : 'De día',
    detail: night
      ? `Noche legal (tras el crepúsculo civil): es obligatorio llevar activada una luz verde intermitente. ${
          hasGreenLight ? 'Tu dron la lleva de serie: actívala.' : 'Tu dron no la lleva de serie: tendrías que instalarla.'
        } Mantén siempre el contacto visual.`
      : 'Vuelo diurno.',
  });

  return checks;
}

/** Nivel de cada hora para la línea temporal de "¿cuándo puedo volar?". */
export function hourlyLevels(
  drone: DroneProfile,
  forecast: PointForecast,
  height: WindHeight,
  kp: KpEntry[] | null,
  from: number,
  hours = 48,
): { time: number; level: Level }[] {
  const out: { time: number; level: Level }[] = [];
  forecast.hourly.time.forEach((t, i) => {
    if (t < from || t >= from + hours * 3600) return;
    const hour = hourAt(forecast, i);
    if (!hour) return;
    const ctx = { height, kp: kp ? kpAt(kp, t)?.kp : null, night: isLegalNight(t, forecast.lat, forecast.lon) };
    out.push({ time: t, level: worstLevel(weatherChecks(drone, hour, ctx)) });
  });
  return out;
}

export interface AirspaceSummary {
  level: Level;
  headline: string;
  checks: Check[];
}

export interface AirspaceContext {
  drone: DroneProfile;
  /** Altura de vuelo prevista sobre el terreno (m). */
  heightM: number;
  /** Elevación del terreno del punto o zona (m sobre el nivel del mar), si se conoce. */
  groundElevationM: number | null;
  surroundings: Surroundings | null;
}

function zoneCheck(z: UasZone, ctx: AirspaceContext): Check {
  let level: CheckLevel = z.severity === 'prohibited' || z.severity === 'authorization' ? 'no' : z.severity === 'caution' ? 'caution' : 'info';
  const detail = z.message || (z.severity === 'info' ? 'Zona informativa.' : 'Consulta las condiciones en ENAIRE Drones.');
  let note: string | undefined;
  if (z.layer === 'controlled' && z.severity === 'caution') {
    // Art. 42.3 RD 517/2024: VLOS hasta 60 m sin coordinación (fuera de zonas de aeródromo).
    if (ctx.heightM > CTR_FREE_HEIGHT_M) {
      level = 'no';
      note = `A ${ctx.heightM} m necesitas coordinar con el proveedor ATS (ENAIRE Planea, ≥ 10 días): sin coordinación, máximo ${CTR_FREE_HEIGHT_M} m en VLOS.`;
    } else {
      note = `Volando a ${ctx.heightM} m en VLOS no necesitas coordinación (límite: ${CTR_FREE_HEIGHT_M} m).`;
    }
  }
  return { id: z.uid, label: z.layerLabel, level, value: z.name, detail: note ? `${note} ${detail}` : detail, note };
}

function aerodromeCheck(n: NearbyAerodrome, ctx: AirspaceContext, enaireAvailable: boolean): Check | null {
  if (!n.relation) return null;
  const a = n.aerodrome;
  const spec = n.zones.spec;
  const name = `${a.name}${a.icao ? ` (${a.icao})` : ''}`;
  const label = `${AERODROME_TYPE_LABEL[a.type]} · zona orientativa del ${spec.article}`;
  // Con ENAIRE disponible su capa es la referencia: el cálculo local solo informa.
  if (enaireAvailable) {
    return {
      id: `aero-${a.id}`,
      label,
      level: 'info',
      value: name,
      detail: 'Según las pistas del dataset local estarías en su zona de protección. Comprueba la zona oficial de ENAIRE.',
    };
  }
  if (n.relation === 'inner') {
    return {
      id: `aero-${a.id}`,
      label,
      level: 'no',
      value: name,
      detail: `Dentro del volumen de protección de un ${spec.label.toLowerCase()}: prohibido volar a cualquier altura salvo coordinación con el gestor${
        a.type === 'airport' ? ' y el proveedor ATS' : ''
      } (art. 43: respuesta en ≤ 1 mes).${n.zones.approximate ? ' Zona aproximada: el dataset no tiene la geometría de las pistas.' : ''}`,
    };
  }
  // Volumen exterior: sin coordinación por debajo de 45/90 m sobre la elevación del aeródromo.
  const top = spec.innerTopM;
  let heightNote = `Puedes volar sin coordinar por debajo de ${top} m sobre la elevación del ${a.type === 'heliport' ? 'helipuerto' : 'aeródromo'}`;
  if (n.elevationM != null) heightNote += ` (${n.elevationM} m s. n. m.)`;
  let level: CheckLevel = 'caution';
  if (n.elevationM != null && ctx.groundElevationM != null) {
    const maxAgl = Math.floor(n.elevationM + top - ctx.groundElevationM);
    if (maxAgl <= 0) {
      level = 'no';
      heightNote = `Aquí el terreno ya está por encima de ${top} m sobre la elevación del aeródromo: cualquier vuelo necesita coordinación`;
    } else {
      heightNote += `: aquí, unos ${Math.min(maxAgl, 120)} m sobre el suelo como máximo`;
      if (ctx.heightM > maxAgl) level = 'no';
    }
  }
  return { id: `aero-${a.id}`, label, level, value: name, detail: `${heightNote}. Por encima, coordinación obligatoria.` };
}

function surroundingsChecks(s: Surroundings | null, drone: DroneProfile, scope: 'point' | 'zone'): Check[] {
  if (!s) return [];
  const checks: Check[] = [];
  const where = scope === 'zone' ? 'En la zona' : 'Junto al punto';
  if (!s.available && s.buildings === 0) {
    checks.push({
      id: 'surroundings-zoom',
      label: 'Edificios cercanos',
      level: 'info',
      value: 'Acerca el mapa',
      detail: 'A este zoom el mapa no incluye edificios: acércalo (zoom 13 o más) para detectarlos y comprobar si es entorno urbano.',
    });
  }
  const urban = s.buildings >= 3 || s.urbanLanduse.length > 0 || s.places.length > 0;
  if (urban) {
    const onlyA3 = openCategoryFor(drone).primary === 'A3';
    checks.push({
      id: 'urban',
      label: 'Posible entorno urbano (art. 40)',
      level: onlyA3 ? 'no' : 'caution',
      value: [s.places.join(', '), s.buildings ? `${s.buildings >= 500 ? '500+' : s.buildings} edificios` : ''].filter(Boolean).join(' · ') || 'Suelo urbano',
      detail: onlyA3
        ? 'Tu dron solo puede volar en A3, que no permite vuelos en entorno urbano.'
        : 'Comunica el vuelo al Ministerio del Interior con ≥ 5 días naturales de antelación, no sobrevueles edificios, casas ni patios y respeta la distancia a edificios (5 m con C1 de ≥ 250 g; 30 m con C2 en A2).',
    });
  }
  if (s.roads.length || s.railways) {
    checks.push({
      id: 'infrastructure',
      label: 'Infraestructuras lineales (art. 39)',
      level: 'caution',
      value: [...s.roads, s.railways ? 'vía férrea' : ''].filter(Boolean).join(', '),
      detail: `${where} hay carreteras o vías: sin permiso del titular no vueles a menos de 25 m de ellas (hasta 50 m por encima). Puedes pasar por encima de ese volumen.`,
    });
  }
  for (const p of s.protectedAreas) {
    checks.push({
      id: `park-${p.name}`,
      label: p.kind === 'national_park' ? 'Parque nacional' : 'Espacio natural protegido',
      level: p.kind === 'national_park' ? 'no' : 'caution',
      value: p.name,
      detail:
        p.kind === 'national_park'
          ? 'En los parques nacionales el sobrevuelo por debajo de 3.000 m es incompatible salvo autorización expresa del órgano gestor (Ley 30/2014).'
          : 'Puede haber prohibiciones de sobrevuelo (fauna, época de cría). Consulta al órgano gestor del espacio.',
    });
  }
  return checks;
}

export function airspaceChecks(
  zones: UasZone[] | null,
  nearby: NearbyAerodrome[],
  enaireAvailable: boolean,
  ctx: AirspaceContext,
  scope: 'point' | 'zone' = 'point',
): AirspaceSummary {
  const list = zones ?? [];
  const checks: Check[] = [
    ...list.map((z) => zoneCheck(z, ctx)),
    ...nearby.map((n) => aerodromeCheck(n, ctx, enaireAvailable)).filter((c): c is Check => c !== null),
    ...surroundingsChecks(ctx.surroundings, ctx.drone, scope),
  ];
  if (!enaireAvailable) {
    checks.push({
      id: 'enaire-unavailable',
      label: 'Zonas oficiales ENAIRE',
      level: 'caution',
      value: 'No disponibles',
      detail: 'No se pudo consultar el servicio de ENAIRE desde tu navegador. Comprueba la zona en drones.enaire.es antes de volar.',
    });
  }
  const level = worstLevel(checks);
  const worstZone = list.reduce((m, z) => Math.max(m, SEVERITY_ORDER[z.severity]), -1);
  const headline =
    worstZone === SEVERITY_ORDER.prohibited
      ? 'Zona prohibida o restringida'
      : level === 'no'
        ? 'Requiere coordinación o autorización'
        : level === 'caution'
          ? 'Se puede volar con condiciones'
          : 'Sin restricciones conocidas';
  return { level, headline: enaireAvailable ? headline : `${headline} (sin datos de ENAIRE)`, checks };
}
