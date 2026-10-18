// Formateo de fechas en la zona horaria del navegador (Europe/Madrid o Atlantic/Canary en España).

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', opts);

const HOUR = fmt({ hour: '2-digit', minute: '2-digit' });
const DAY_SHORT = fmt({ weekday: 'short', day: 'numeric' });
const DAY_LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const DATE_TIME = fmt({ weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatHour = (unix: number) => HOUR.format(unix * 1000);
export const formatDayShort = (unix: number) => DAY_SHORT.format(unix * 1000);
export const formatDayLong = (unix: number) => DAY_LONG.format(unix * 1000);
export const formatDateTime = (unix: number) => DATE_TIME.format(unix * 1000);

/** Hora en punto actual (segundos UNIX). */
export function currentHour(now = Date.now()): number {
  return Math.floor(now / 3_600_000) * 3600;
}

export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a * 1000);
  const db = new Date(b * 1000);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** "hoy", "mañana" o el día de la semana. */
export function relativeDay(unix: number, now = Date.now() / 1000): string {
  if (sameLocalDay(unix, now)) return 'hoy';
  if (sameLocalDay(unix, now + 86_400)) return 'mañana';
  return formatDayShort(unix);
}
