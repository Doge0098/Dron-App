// Posición del Sol y crepúsculo civil. Basado en las fórmulas astronómicas que usa SunCalc
// (V. Agafonkin, licencia BSD-2): precisión de ~1 minuto, suficiente para la "noche" legal.
// El RE 2019/947 (art. 2.34) define la noche como el periodo entre el fin del crepúsculo civil
// vespertino y el comienzo del crepúsculo civil matutino (Sol 6° bajo el horizonte).

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397;
const J0 = 0.0009;

const toJulian = (ms: number) => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;
const toDays = (ms: number) => toJulian(ms) - J2000;

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(m: number) {
  const c = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + c + RAD * 102.9372 + Math.PI;
}
const declination = (l: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (ht: number, lw: number, n: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, m: number, l: number) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

export interface SunTimes {
  /** Comienzo del crepúsculo civil matutino (ms UNIX). */
  civilDawn: number;
  sunrise: number;
  sunset: number;
  /** Fin del crepúsculo civil vespertino (ms UNIX): a partir de aquí es "de noche". */
  civilDusk: number;
}

/** Horas solares del día que contiene `ms` en la longitud dada (NaN en noche/día polar). */
export function sunTimes(ms: number, lat: number, lon: number): SunTimes {
  const lw = RAD * -lon;
  const φ = RAD * lat;
  // Mediodía solar aproximado del día local para que el ciclo juliano sea el correcto.
  const d = toDays(ms);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = solarTransitJ(ds, m, l);
  const setFor = (h: number) => {
    const w = Math.acos((Math.sin(h * RAD) - Math.sin(φ) * Math.sin(dec)) / (Math.cos(φ) * Math.cos(dec)));
    return solarTransitJ(approxTransit(w, lw, n), m, l);
  };
  const jSet = setFor(-0.833);
  const jDusk = setFor(-6);
  return {
    sunrise: fromJulian(jNoon - (jSet - jNoon)),
    sunset: fromJulian(jSet),
    civilDawn: fromJulian(jNoon - (jDusk - jNoon)),
    civilDusk: fromJulian(jDusk),
  };
}

/** ¿Es de noche (definición del RE 2019/947) en el instante `unix` (segundos)? */
export function isLegalNight(unix: number, lat: number, lon: number): boolean {
  const ms = unix * 1000;
  const t = sunTimes(ms, lat, lon);
  if (!Number.isFinite(t.civilDawn) || !Number.isFinite(t.civilDusk)) return false;
  return ms < t.civilDawn || ms > t.civilDusk;
}
