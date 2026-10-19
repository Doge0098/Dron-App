// Borrador de correo para pedir información o coordinación a la entidad responsable de una restricción,
// con los datos del vuelo, del dron y del piloto ya rellenos.

import type { LngLatTuple } from '../lib/geo';
import { CLASS_LABEL_TEXT, openCategoryFor, type DroneProfile } from './drone';
import { publicPilotId, type PilotProfile } from './pilot';

export interface MailDraft {
  subject: string;
  body: string;
}

export interface RequestTarget {
  /** Zona o restricción ("MADRID/BARAJAS · LEMD0"). */
  name: string;
  /** Tipo de zona ("Entorno de aeródromos y helipuertos"). */
  kind: string;
}

export interface RequestContext {
  /** Nombre del lugar o descripción de la zona dibujada. */
  placeName: string | null;
  /** Punto del vuelo o centro de la zona dibujada. */
  point: LngLatTuple;
  pointIsCenter?: boolean;
  /** Hora prevista (segundos UNIX). */
  time: number | null;
  heightM: number;
  /** `null` mientras el usuario no haya elegido su dron. */
  drone: DroneProfile | null;
  pilot: PilotProfile;
}

/** Hueco que el piloto debe rellenar antes de enviar. */
export const BLANK = '[completar]';

const WHEN = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

export function requestDraft(target: RequestTarget, ctx: RequestContext): MailDraft {
  const { drone, pilot } = ctx;
  const lat = ctx.point[1].toFixed(5);
  const lon = ctx.point[0].toFixed(5);
  const category = drone ? openCategoryFor(drone) : null;
  const droneText = drone
    ? [
        [drone.brand === 'Otro' ? '' : drone.brand, drone.model].filter(Boolean).join(' ') || BLANK,
        /^C\d$/.test(drone.classLabel) ? `clase ${drone.classLabel}` : CLASS_LABEL_TEXT[drone.classLabel].toLowerCase(),
        `${drone.massG} g`,
      ].join(', ')
    : BLANK;
  const name = pilot.fullName.trim();
  const body = [
    'Buenos días:',
    '',
    `Quiero volar un dron en una zona afectada por «${target.name}» (${target.kind}) y les escribo para solicitar información o la coordinación que corresponda.`,
    '',
    `- Lugar: ${ctx.placeName ? `${ctx.placeName} · ` : ''}${ctx.pointIsCenter ? 'centro' : 'coordenadas'} ${lat}, ${lon} (mapa: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon})`,
    `- Fecha y hora previstas: ${ctx.time != null ? WHEN.format(ctx.time * 1000) : BLANK}`,
    `- Altura máxima sobre el terreno: ${ctx.heightM} m`,
    `- Operación: ${category?.open ? `categoría abierta, subcategoría ${category.subcategories.join(' o ')}` : BLANK}, siempre con el dron a la vista (VLOS)`,
    `- Dron: ${droneText}`,
    `- Nº de serie del dron: ${pilot.droneSerial.trim() || BLANK}`,
    `- Piloto: ${name || BLANK}`,
    `- ID de piloto / nº de operador: ${publicPilotId(pilot.pilotId) || BLANK}`,
    `- Teléfono de contacto: ${BLANK}`,
    '',
    'Muchas gracias. Un saludo,',
    name || BLANK,
  ].join('\n');
  return { subject: `Consulta para vuelo de dron · ${target.name}`, body };
}

/** Texto completo para pegarlo en un correo web: destinatario, asunto y cuerpo. */
export function draftAsText(to: string, draft: MailDraft): string {
  return `Para: ${to}\nAsunto: ${draft.subject}\n\n${draft.body}`;
}
