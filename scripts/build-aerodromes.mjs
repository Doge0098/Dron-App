// Genera src/data/aerodromes-es.json a partir de OurAirports (dominio público).
// Uso: npm run data:aerodromes
// Fuente: https://ourairports.com/data/ — https://davidmegginson.github.io/ourairports-data/
import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const RUNWAYS = 'https://davidmegginson.github.io/ourairports-data/runways.csv';
const OUTPUT = new URL('../src/data/aerodromes-es.json', import.meta.url);

const TYPE_MAP = {
  large_airport: 'airport',
  medium_airport: 'airport',
  small_airport: 'airfield',
  heliport: 'heliport',
  seaplane_base: 'seaplane',
  balloonport: 'balloonport',
};

/** Parser CSV mínimo con soporte de comillas dobles y saltos de línea entrecomillados. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: HTTP ${res.status}`);
  const [header, ...records] = parseCsv(await res.text());
  return { col: Object.fromEntries(header.map((name, i) => [name, i])), records };
}

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
/** Punto a `dist` metros con rumbo `brg` (grados) desde [lon, lat]. */
function destination([lon, lat], dist, brg) {
  const δ = dist / R;
  const θ = rad(brg);
  const φ1 = rad(lat);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = rad(lon) + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [deg(λ2), deg(φ2)];
}
const round5 = (v) => Number(v.toFixed(5));

const { col, records } = await download(SOURCE);
const rw = await download(RUNWAYS);

/** Pistas por aeródromo como [lonA, latA, lonB, latB]; si faltan los extremos se estiman con rumbo y longitud. */
const runwaysByAirport = new Map();
for (const r of rw.records) {
  const get = (name) => r[rw.col[name]] ?? '';
  if (get('closed') === '1') continue;
  const ident = get('airport_ident');
  let ends = null;
  const [la1, lo1, la2, lo2] = ['le_latitude_deg', 'le_longitude_deg', 'he_latitude_deg', 'he_longitude_deg'].map((k) => Number(get(k)));
  if (get('le_latitude_deg') && get('he_latitude_deg') && [la1, lo1, la2, lo2].every(Number.isFinite)) {
    ends = [lo1, la1, lo2, la2];
  } else {
    const lengthM = Number(get('length_ft')) * 0.3048;
    const heading = get('le_heading_degT') ? Number(get('le_heading_degT')) : Number(get('le_ident').replace(/\D/g, '')) * 10;
    if (lengthM > 0 && Number.isFinite(heading) && heading > 0) ends = { lengthM, heading };
  }
  if (!ends) continue;
  if (!runwaysByAirport.has(ident)) runwaysByAirport.set(ident, []);
  runwaysByAirport.get(ident).push(ends);
}

const aerodromes = records
  .filter((r) => r[col.iso_country] === 'ES' && TYPE_MAP[r[col.type]])
  .map((r) => {
    const icao = r[col.icao_code] || r[col.gps_code] || '';
    return {
      id: r[col.ident],
      icao: /^[A-Z]{4}$/.test(icao) ? icao : '',
      name: r[col.name],
      type: TYPE_MAP[r[col.type]],
      major: r[col.type] === 'large_airport' || r[col.type] === 'medium_airport',
      lat: Number(Number(r[col.latitude_deg]).toFixed(5)),
      lon: Number(Number(r[col.longitude_deg]).toFixed(5)),
      elevationFt: r[col.elevation_ft] ? Number(r[col.elevation_ft]) : null,
      municipality: r[col.municipality] || '',
      scheduled: r[col.scheduled_service] === 'yes',
      runways: (runwaysByAirport.get(r[col.ident]) ?? []).map((e) => {
        if (Array.isArray(e)) return e.map(round5);
        // Pista centrada en el punto de referencia del aeródromo.
        const center = [Number(r[col.longitude_deg]), Number(r[col.latitude_deg])];
        const a = destination(center, e.lengthM / 2, e.heading + 180);
        const b = destination(center, e.lengthM / 2, e.heading);
        return [...a, ...b].map(round5);
      }),
    };
  })
  .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
  .sort((a, b) => a.id.localeCompare(b.id));

const payload = {
  source: 'OurAirports (https://ourairports.com/data/), dominio público. Pistas: runways.csv (extremos estimados si faltan).',
  generated: new Date().toISOString().slice(0, 10),
  aerodromes,
};
await writeFile(OUTPUT, JSON.stringify(payload) + '\n');
console.log(`Escritos ${aerodromes.length} aeródromos en ${OUTPUT.pathname}`);
