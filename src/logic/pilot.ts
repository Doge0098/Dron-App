// Datos del piloto: se guardan solo en este dispositivo y sirven para rellenar las solicitudes a las
// entidades que gestionan cada restricción.

export interface PilotProfile {
  fullName: string;
  /** Nº de operador UAS de AESA o del certificado de piloto. */
  pilotId: string;
  /** Nº de serie (SN) del dron. */
  droneSerial: string;
}

export const EMPTY_PILOT: PilotProfile = { fullName: '', pilotId: '', droneSerial: '' };

// Nº de registro de operador UAS de la UE: 16 caracteres públicos (país, 12 caracteres y uno de control)
// y, tras el guion, 3 caracteres secretos que solo se cargan en la identificación a distancia del dron.
const OPERATOR_WITH_SECRET = /^([A-Z]{3}[A-Z0-9]{13})-([A-Z0-9]{3})$/i;

/** Separa la parte secreta de un nº de operador completo; `null` si el ID no la incluye. */
export function splitOperatorNumber(id: string): { publicPart: string; secret: string } | null {
  const m = id.trim().match(OPERATOR_WITH_SECRET);
  return m ? { publicPart: m[1], secret: m[2] } : null;
}

/** ID apto para compartir: sin la parte secreta del nº de operador. */
export function publicPilotId(id: string): string {
  return splitOperatorNumber(id)?.publicPart ?? id.trim();
}

export const hasPilotData = (p: PilotProfile) => Boolean(p.fullName.trim() || p.pilotId.trim() || p.droneSerial.trim());
