// Contactos de las entidades responsables de una restricción: extracción de teléfonos, correos y webs
// de los textos de ENAIRE y enlaces tel:/mailto: listos para usar.

export interface ContactPhone {
  /** Formato E.164 (+34…). */
  number: string;
  label?: string;
}

export interface ContactInfo {
  /** Entidad o persona de contacto. */
  name: string;
  phones: ContactPhone[];
  emails: string[];
  web: string | null;
  /** 'zone': publicado por ENAIRE para esa zona; 'general': contacto oficial según el tipo de zona. */
  source: 'zone' | 'general';
  note?: string;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// Teléfonos españoles (9 cifras que empiezan por 6, 7, 8 o 9) con prefijo +34/0034 opcional, seguidos o
// agrupados como se suelen escribir (913213363, 913 213 363, 913 21 33 63, 91 321 33 63). Exigir esas
// agrupaciones evita confundir listas de números (días, horas, NOTAM) con un teléfono.
// El grupo 1 evita empezar en mitad de otra cifra (sin lookbehind, que Safari < 16.4 no admite).
const PHONE_RE =
  /(^|[^\d+])((?:\(?(?:\+|00)\s?34\)?[\s.-]*)?(?:[6789]\d{8}|[6789]\d{2}(?:[\s.-]\d{3}){2}|[6789]\d{2}(?:[\s.-]\d{2}){3}|[89]\d[\s.-]\d{3}(?:[\s.-]\d{2}){2}))(?!\d)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+[^\s<>"'().,;:]/gi;
const DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i;

/** Normaliza un teléfono español a E.164; `null` si no lo parece. */
export function normalizeSpanishPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0034')) digits = digits.slice(4);
  else if (digits.length === 11 && digits.startsWith('34')) digits = digits.slice(2);
  return digits.length === 9 && /^[6789]/.test(digits) ? `+34${digits}` : null;
}

/** Teléfonos de un campo dedicado: admite también números extranjeros (+ y de 8 a 15 cifras). */
export function parsePhoneField(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[;,/|]|\s+[yo]\s+/i)) {
    const spanish = normalizeSpanishPhone(part);
    const digits = part.replace(/\D/g, '');
    const value = spanish ?? (/^\s*(\+|00)/.test(part) && digits.length >= 8 && digits.length <= 15 ? `+${digits.replace(/^00/, '')}` : null);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Web de un campo dedicado, con https:// si viene sin protocolo. */
export function normalizeWeb(raw: string): string | null {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return DOMAIN_RE.test(value) ? `https://${value}` : null;
}

/** "+34913213363" → "913 21 33 63". */
export function formatPhone(e164: string): string {
  const d = e164.replace(/^\+34/, '');
  return d.length === 9 && e164.startsWith('+34') ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : e164;
}

export interface ExtractedContacts {
  phones: string[];
  emails: string[];
  urls: string[];
}

/** Busca teléfonos, correos y webs en uno o varios textos (sin duplicados, en orden de aparición). */
export function extractContacts(...texts: (string | null | undefined)[]): ExtractedContacts {
  const phones: string[] = [];
  const emails: string[] = [];
  const urls: string[] = [];
  const add = (list: string[], value: string | null) => {
    if (value && !list.includes(value)) list.push(value);
  };
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(EMAIL_RE)) add(emails, m[0].toLowerCase());
    // Los correos se quitan antes de buscar teléfonos y webs (sus dígitos o dominios confundirían).
    const rest = text.replace(EMAIL_RE, ' ');
    for (const m of rest.matchAll(PHONE_RE)) add(phones, normalizeSpanishPhone(m[2]));
    for (const m of rest.matchAll(URL_RE)) add(urls, m[0].startsWith('www.') ? `https://${m[0]}` : m[0]);
  }
  return { phones, emails, urls };
}

/** Texto de contacto sin teléfonos, correos ni webs (lo que suele quedar es el nombre de la entidad). */
export function contactName(text: string): string {
  const rest = text
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, '$1 ')
    .replace(URL_RE, ' ')
    .replace(/(^|[^a-záéíóúñ])(contacto|tel[eé]fonos?|tfno|tlfno|tlf|tel|m[oó]vil|correo( electr[oó]nico)?|e-?mail|web)\b\.?:?/gi, '$1 ')
    .replace(/\(\s*[,;:/|·-]*\s*\)/g, ' ');
  // Se conservan las partes con texto, separadas con «·» (p. ej. «Aeropuerto de Bilbao · Oficina UAS»).
  return rest
    .split(/[,;/|·]/)
    .map((part) => part.replace(/\s+/g, ' ').replace(/^[\s:-]+|[\s:-]+$/g, ''))
    .filter(Boolean)
    .join(' · ');
}

export const telHref = (e164: string) => `tel:${e164}`;

/** Enlace mailto: con asunto y cuerpo (RFC 6068: saltos de línea como CRLF codificado). */
export function mailtoHref(email: string, subject?: string, body?: string): string {
  const params = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`,
  ]
    .filter(Boolean)
    .join('&');
  return `mailto:${email}${params ? `?${params}` : ''}`;
}

export const hasContactChannels = (c: ContactInfo) => c.phones.length > 0 || c.emails.length > 0 || Boolean(c.web);

/** "https://www.aena.es/es/…" → "aena.es". */
export function webLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
