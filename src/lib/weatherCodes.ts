// Códigos meteorológicos WMO que devuelve Open-Meteo (`weather_code`).

export interface WeatherCodeInfo {
  label: string;
  icon: string;
  /** Precipitación o fenómeno que impide volar a un dron sin protección IP. */
  wet: boolean;
  storm: boolean;
  snow: boolean;
  fog: boolean;
}

const info = (label: string, icon: string, flags: Partial<WeatherCodeInfo> = {}): WeatherCodeInfo => ({
  label,
  icon,
  wet: false,
  storm: false,
  snow: false,
  fog: false,
  ...flags,
});

const CODES: Record<number, WeatherCodeInfo> = {
  0: info('Despejado', '☀️'),
  1: info('Poco nuboso', '🌤️'),
  2: info('Intervalos nubosos', '⛅'),
  3: info('Cubierto', '☁️'),
  45: info('Niebla', '🌫️', { fog: true }),
  48: info('Niebla engelante', '🌫️', { fog: true }),
  51: info('Llovizna débil', '🌦️', { wet: true }),
  53: info('Llovizna', '🌦️', { wet: true }),
  55: info('Llovizna intensa', '🌧️', { wet: true }),
  56: info('Llovizna helada', '🌧️', { wet: true }),
  57: info('Llovizna helada intensa', '🌧️', { wet: true }),
  61: info('Lluvia débil', '🌦️', { wet: true }),
  63: info('Lluvia', '🌧️', { wet: true }),
  65: info('Lluvia fuerte', '🌧️', { wet: true }),
  66: info('Lluvia helada', '🌧️', { wet: true }),
  67: info('Lluvia helada fuerte', '🌧️', { wet: true }),
  71: info('Nieve débil', '🌨️', { wet: true, snow: true }),
  73: info('Nieve', '🌨️', { wet: true, snow: true }),
  75: info('Nieve fuerte', '❄️', { wet: true, snow: true }),
  77: info('Granos de nieve', '🌨️', { wet: true, snow: true }),
  80: info('Chubascos débiles', '🌦️', { wet: true }),
  81: info('Chubascos', '🌧️', { wet: true }),
  82: info('Chubascos muy fuertes', '⛈️', { wet: true }),
  85: info('Chubascos de nieve', '🌨️', { wet: true, snow: true }),
  86: info('Chubascos de nieve fuertes', '❄️', { wet: true, snow: true }),
  95: info('Tormenta', '⛈️', { wet: true, storm: true }),
  96: info('Tormenta con granizo', '⛈️', { wet: true, storm: true }),
  99: info('Tormenta con granizo fuerte', '⛈️', { wet: true, storm: true }),
};

export function weatherCodeInfo(code: number | null | undefined): WeatherCodeInfo {
  if (code == null || !Number.isFinite(code)) return info('Sin datos', '❔');
  return CODES[code] ?? info(`Código ${code}`, '❔');
}
