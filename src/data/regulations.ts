// Resumen divulgativo de la normativa UAS aplicable en España (revisado en octubre de 2026).
// Fuentes principales: Reglamento de Ejecución (UE) 2019/947 (RE), Reglamento Delegado (UE) 2019/945,
// Real Decreto 517/2024 (RD), Ley 21/2003 de Seguridad Aérea modificada por la Ley 8/2025, AESA y ENAIRE.

export interface Source {
  label: string;
  url: string;
}

export interface RuleItem {
  title: string;
  text: string;
  source?: Source;
}

export const SOURCES = {
  re947: { label: 'Reglamento (UE) 2019/947', url: 'https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32019R0947' },
  rd945: { label: 'Reglamento Delegado (UE) 2019/945', url: 'https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32019R0945' },
  rd517: { label: 'Real Decreto 517/2024 (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2024-11377' },
  lsa: { label: 'Ley 21/2003 de Seguridad Aérea (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2003-13616' },
  ley8_2025: { label: 'Ley 8/2025 (BOE)', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-19339' },
  rd1180: { label: 'Real Decreto 1180/2018 (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2018-15406' },
  parques: { label: 'Ley 30/2014 de Parques Nacionales (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2014-12588' },
  aesaOpen: {
    label: 'AESA · Categoría abierta',
    url: 'https://www.seguridadaerea.gob.es/es/ambitos/drones/operaciones-uas-drones/operaciones-con-uas-drones---categoria-abierta-subcategorias-a1-a2-y-a3',
  },
  aesaRegistro: { label: 'AESA · Registro de operador', url: 'https://www.seguridadaerea.gob.es/es/ambitos/drones/registro-de-operador-de-drones-uas' },
  aesaFormacion: {
    label: 'AESA · Formación A1/A3 y A2',
    url: 'https://www.seguridadaerea.gob.es/es/ambitos/drones/formacion-de-pilotos-a-distancia-de-uas-drones/formacion-de-pilotos-uas-drones-en-categoria-rabiertar',
  },
  aesaZonas: { label: 'AESA · Zonas geográficas UAS', url: 'https://www.seguridadaerea.gob.es/es/ambitos/drones/zonas-geograficas-de-uas' },
  interior: {
    label: 'Ministerio del Interior · Comunicación de vuelos UAS',
    url: 'https://www.interior.gob.es/opencms/es/servicios-al-ciudadano/comunicacion-operaciones-de-aeronaves-pilotadas-por-control-remoto-uas/',
  },
  enaire: { label: 'ENAIRE Drones', url: 'https://drones.enaire.es/' },
  planea: { label: 'ENAIRE Planea', url: 'https://planea.enaire.es' },
  aena: {
    label: 'Aena · Coordinación de vuelos UAS',
    url: 'https://www.aena.es/es/corporativa/seguridad-operacional/tramites/coordinacion-actividades-uas-zonas-fuera-atz-ctr-fiz.html',
  },
  aepd: { label: 'AEPD · Guía sobre drones y protección de datos', url: 'https://www.aepd.es/guias/guia-drones.pdf' },
  easaFpv: {
    label: 'EASA · Vuelo FPV en categoría abierta',
    url: 'https://www.easa.europa.eu/en/the-agency/faqs/i-am-drone-racing-andor-flying-drones-goggles-fpv-open-category',
  },
} satisfies Record<string, Source>;

// ---------------------------------------------------------------------------
// Zonas de aeródromos y helipuertos (art. 41 RD 517/2024)
// ---------------------------------------------------------------------------

export interface AerodromeZoneSpec {
  key: 'publicAerodrome' | 'publicHeliport' | 'restrictedAerodrome' | 'restrictedHeliport';
  label: string;
  article: string;
  shape: 'rectangle' | 'circle';
  /** Volumen 1. Rectángulo: prolongación más allá de cada extremo de pista y distancia a cada lado del eje. Círculo: radio en `beyondM`. */
  inner: { beyondM: number; sideM: number };
  /** Volumen 2 (más amplio, a partir de `innerTopM`). */
  outer: { beyondM: number; sideM: number };
  /** Altura (m) sobre el punto de referencia del aeródromo/helipuerto (ARP/HRP) que cubre el volumen 1. */
  innerTopM: number;
  outerTopM: number;
  /** Semilongitud de pista supuesta cuando el dataset no tiene la geometría de las pistas. */
  assumedHalfRunwayM: number;
}

export const AERODROME_ZONE_SPECS: Record<AerodromeZoneSpec['key'], AerodromeZoneSpec> = {
  publicAerodrome: {
    key: 'publicAerodrome',
    label: 'Aeródromo de uso público o militar',
    article: 'art. 41.1.a',
    shape: 'rectangle',
    inner: { beyondM: 6000, sideM: 5000 },
    outer: { beyondM: 10000, sideM: 7500 },
    innerTopM: 45,
    outerTopM: 900,
    assumedHalfRunwayM: 1200,
  },
  publicHeliport: {
    key: 'publicHeliport',
    label: 'Helipuerto de uso público o militar',
    article: 'art. 41.1.b',
    // La FATO no consta en el dataset: se aproxima el rectángulo de 2,5 km × 2,5 km con un círculo.
    shape: 'circle',
    inner: { beyondM: 2500, sideM: 2500 },
    outer: { beyondM: 3300, sideM: 3300 },
    innerTopM: 90,
    outerTopM: 900,
    assumedHalfRunwayM: 0,
  },
  restrictedAerodrome: {
    key: 'restrictedAerodrome',
    label: 'Aeródromo de uso restringido',
    article: 'art. 41.1.c',
    shape: 'rectangle',
    inner: { beyondM: 3000, sideM: 3000 },
    outer: { beyondM: 5000, sideM: 4500 },
    innerTopM: 45,
    outerTopM: 900,
    assumedHalfRunwayM: 400,
  },
  restrictedHeliport: {
    key: 'restrictedHeliport',
    label: 'Helipuerto de uso restringido (p. ej. hospitales)',
    article: 'art. 41.1.d',
    shape: 'circle',
    inner: { beyondM: 2500, sideM: 2500 },
    outer: { beyondM: 3300, sideM: 3300 },
    innerTopM: 90,
    outerTopM: 450,
    assumedHalfRunwayM: 0,
  },
};

/** Altura máxima sin coordinación en CTR/FIZ fuera de zonas de aeródromo (art. 42.3 RD). */
export const CTR_FREE_HEIGHT_M = 60;

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const GENERAL_RULES: RuleItem[] = [
  {
    title: 'Altura máxima: 120 m',
    text: 'Como máximo 120 m sobre el punto más próximo de la superficie. Solo se puede subir hasta 15 m por encima de un obstáculo artificial de más de 105 m si vuelas a menos de 50 m de él y lo pide su responsable.',
    source: SOURCES.re947,
  },
  {
    title: 'Siempre a la vista (VLOS)',
    text: 'Contacto visual directo y continuo, sin prismáticos. Con gafas FPV necesitas un observador a tu lado que vea el dron y te avise. En A1 se admite el modo «sígueme» a menos de 50 m del piloto.',
    source: SOURCES.easaFpv,
  },
  {
    title: 'Nunca sobre concentraciones de personas',
    text: 'En ninguna subcategoría de la categoría abierta. Son concentraciones las reuniones en las que la gente no puede apartarse por la densidad: eventos, playas o parques llenos, calles comerciales en horario de tiendas…',
    source: SOURCES.re947,
  },
  {
    title: 'Distancia a las personas según la subcategoría',
    text: 'A1: con C0, sin marcado < 250 g o de construcción propia < 250 g puedes pasar sobre personas ajenas (lo mínimo posible); con C1 no debes prever sobrevolarlas. A2 (solo C2): 30 m de personas ajenas, 5 m con el modo de baja velocidad. A3: zona sin personas ajenas y a 150 m de zonas residenciales, comerciales, industriales o recreativas.',
    source: SOURCES.aesaOpen,
  },
  {
    title: 'Registro de operador en AESA',
    text: 'Obligatorio si el dron pesa 250 g o más, puede transferir más de 80 J o lleva cámara o micrófono (salvo juguetes). Es gratuito, el operador debe tener al menos 16 años y la inscripción caduca a los 3 años si no se renueva. El número de operador debe ir visible en el dron y cargado en la identificación a distancia.',
    source: SOURCES.aesaRegistro,
  },
  {
    title: 'Formación y edad del piloto',
    text: 'C0, sin marcado < 250 g y construcción propia: conocer el manual. C1, A3 y drones sin marcado de 250 g o más: curso y examen online A1/A3 de AESA (gratuito). A2: además autoformación práctica y examen adicional. Edad: 16 años con carácter general; en España 12 años con C0 no juguete o sin marcado < 250 g y 14 años con C1, A2 y A3. Los certificados valen 5 años.',
    source: SOURCES.aesaFormacion,
  },
  {
    title: 'Identificación a distancia (Remote ID)',
    text: 'Obligatoria, activa y actualizada en los C1, C2 y C3. No se exige a C0, C4, construcción propia ni drones sin marcado.',
    source: SOURCES.aesaOpen,
  },
  {
    title: 'Seguro de responsabilidad civil',
    text: 'Obligatorio en la subcategoría A2, en las categorías específica y certificada y con cualquier dron de 20 kg o más. En A1 y A3 por debajo de 20 kg no es obligatorio, aunque respondes igualmente de los daños: es muy recomendable.',
    source: SOURCES.rd517,
  },
  {
    title: 'Vuelo nocturno',
    text: 'Permitido en la categoría abierta. Desde el fin del crepúsculo civil hasta el comienzo del siguiente debes llevar activada una luz verde intermitente. Los C1, C2 y C3 la llevan de serie; en C0, C4 y drones sin marcado habría que instalarla.',
    source: SOURCES.re947,
  },
  {
    title: 'Prohibiciones generales',
    text: 'Ni mercancías peligrosas ni arrojar objetos. No vueles bajo los efectos del alcohol o de drogas (las Fuerzas y Cuerpos de Seguridad pueden hacer pruebas) ni cerca de operaciones de emergencia sin permiso. Si se acerca una aeronave tripulada, baja el dron y apártate.',
    source: SOURCES.ley8_2025,
  },
  {
    title: 'Más de 25 kg u operaciones fuera de estas reglas',
    text: 'Se necesita la categoría específica: declaración de escenario estándar o autorización de AESA.',
    source: SOURCES.re947,
  },
  {
    title: 'Privacidad e imagen',
    text: 'Grabar personas identificables puede entrar en el RGPD y en la LO 1/1982 (derecho a la propia imagen). Respeta patios, terrazas e interiores, difumina a terceros y no difundas imágenes sin base legal.',
    source: SOURCES.aepd,
  },
];

export const ZONE_RULES: RuleItem[] = [
  {
    title: 'Zonas geográficas UAS',
    text: 'ENAIRE publica en formato digital las zonas que condicionan el vuelo (se actualizan cada ciclo AIRAC de 28 días). Si te afectan varias, debes cumplir todas. Consulta siempre el visor oficial y los NOTAM antes de volar.',
    source: SOURCES.enaire,
  },
  {
    title: 'Aeródromos y helipuertos (art. 41)',
    text: 'Prohibido volar sin coordinación con el gestor (y con el proveedor ATS, si lo hay). Aeródromos públicos o militares: hasta 45 m sobre el punto de referencia del aeródromo, 6 km más allá de cada extremo de pista y 5 km a cada lado del eje; de 45 a 900 m, 10 km × 7,5 km. Uso restringido: 3 km × 3 km (5 km × 4,5 km). Helipuertos de uso restringido, como los de hospitales: círculo de 2,5 km hasta 90 m (3,3 km hasta 450 m).',
    source: SOURCES.rd517,
  },
  {
    title: 'Espacio aéreo controlado (CTR) y FIZ (art. 42)',
    text: 'Se puede volar sin coordinar en VLOS hasta 60 m de altura, fuera de las zonas de aeródromo. Por encima hace falta coordinar con el proveedor ATS (con ENAIRE, mediante Planea, con al menos 10 días de antelación).',
    source: SOURCES.planea,
  },
  {
    title: 'Entorno urbano (art. 40)',
    text: 'Comunica el vuelo al Ministerio del Interior con al menos 5 días naturales de antelación (si estás obligado a registrarte). Prohibido sobrevolar edificios, casas, patios y zonas de recreo. Distancia a edificios: 5 m con C1 de 250 g o más; 30 m con C2 en A2 (5 m en baja velocidad). En A3 no se puede volar en entorno urbano.',
    source: SOURCES.interior,
  },
  {
    title: 'Infraestructuras críticas (art. 39)',
    text: 'Sin permiso del titular no se puede volar a menos de 25 m de infraestructuras lineales (carreteras, ferrocarril, redes eléctricas, agua, gas…) ni a menos de 10 m de las demás (centrales, refinerías, puertos…), hasta 50 m por encima de su punto más alto. Sí puedes pasar por encima de ese volumen.',
    source: SOURCES.rd517,
  },
  {
    title: 'Defensa y seguridad del Estado (art. 38)',
    text: 'Instalaciones militares y de seguridad requieren permiso previo y expreso del titular. Las zonas prohibidas (LEP) no se pueden sobrevolar; las restringidas (LER) y peligrosas (LED, TSA, TRA) exigen autorización o coordinación con al menos 15 días naturales de antelación.',
    source: SOURCES.rd1180,
  },
  {
    title: 'Espacios naturales protegidos',
    text: 'Limitaciones del RD 1180/2018 y de cada espacio: prohibido sobrevolar zonas de nidificación en época de cría o concentraciones de aves. En los parques nacionales el sobrevuelo por debajo de 3.000 m es incompatible salvo autorización expresa. Pide permiso al órgano gestor.',
    source: SOURCES.parques,
  },
  {
    title: 'Restricción al vuelo fotográfico (ZRVF)',
    text: 'Para captar imágenes en una ZRVF hace falta una solicitud de obtención de imágenes aéreas (OIA) al CECAF del Ejército del Aire, que responde en unos 15 días hábiles.',
    source: SOURCES.aesaZonas,
  },
];

export const DEADLINES: { procedure: string; notice: string }[] = [
  { procedure: 'Comunicación al Ministerio del Interior (entorno urbano)', notice: '≥ 5 días naturales' },
  { procedure: 'Coordinación con ENAIRE (Planea) en CTR/FIZ por encima de 60 m', notice: '≥ 10 días' },
  { procedure: 'Zonas de Defensa (LER, LED, TSA, TRA)', notice: '≥ 15 días naturales' },
  { procedure: 'Autorización de imágenes aéreas en ZRVF (CECAF)', notice: '≈ 15 días hábiles de respuesta' },
  { procedure: 'Coordinación con aeródromos (art. 43)', notice: 'Respuesta en ≤ 1 mes; confirmar con ≥ 72 h' },
];

export const SANCTIONS: RuleItem[] = [
  {
    title: 'Infracciones de drones (art. 45 ter Ley 21/2003, desde el 20/10/2025)',
    text: 'Entre otras: volar sin registro de operador o sin el número en el dron, sin Remote ID cuando es obligatorio, incumplir las condiciones de la categoría abierta o de una zona geográfica (incluida la falta de coordinación o de permiso).',
    source: SOURCES.lsa,
  },
  {
    title: 'Multas (art. 55 Ley 21/2003)',
    text: 'Particulares: leves de 60 € a 45.000 €; graves hasta 90.000 €; muy graves hasta 225.000 €. En actividad profesional, hasta 4,5 millones de euros. Además, la Ley de Seguridad Ciudadana sanciona el sobrevuelo de infraestructuras críticas.',
    source: SOURCES.ley8_2025,
  },
];

export const CHECKLIST: string[] = [
  'Consulta la zona en ENAIRE Drones y los NOTAM para la fecha, la hora y la altura del vuelo.',
  'Si el vuelo es urbano, envía la comunicación al Ministerio del Interior con 5 días naturales de antelación.',
  'Si hay aeródromo, CTR por encima de 60 m u otra zona con coordinación, tramítala con la antelación necesaria.',
  'Revisa la previsión: viento a la altura de vuelo y rachas frente al límite del fabricante, lluvia, visibilidad y temperatura.',
  'Lleva el justificante de registro de operador, el certificado de piloto y, si procede, el seguro.',
  'Comprueba el número de operador en el dron y la identificación a distancia activa (C1, C2, C3).',
  'Baterías cargadas (templadas si hace frío), hélices sin daños y firmware actualizado.',
  'Espera a tener buena señal GNSS, fija el punto de regreso y una altura de regreso por encima de obstáculos.',
  'Despega lejos de personas ajenas y vuela siempre a la vista, por debajo de 120 m y atento a otras aeronaves.',
];

export const LEGAL_FRAMEWORK: RuleItem[] = [
  {
    title: 'Reglamento de Ejecución (UE) 2019/947',
    text: 'Normas de operación de UAS en la UE (categorías abierta, específica y certificada). Aplicable desde el 31/12/2020; última modificación aplicable desde el 01/05/2025, sin cambios en la categoría abierta.',
    source: SOURCES.re947,
  },
  {
    title: 'Reglamento Delegado (UE) 2019/945',
    text: 'Requisitos técnicos de los drones y marcado de clase C0 a C6.',
    source: SOURCES.rd945,
  },
  {
    title: 'Real Decreto 517/2024',
    text: 'Régimen jurídico de los UAS civiles en España (BOE 05/06/2024, en vigor desde el 25/06/2024). Deroga el RD 1036/2017. El Tribunal Supremo anuló en 2025 solo el registro de drones del Ministerio del Interior (arts. 53 a 58).',
    source: SOURCES.rd517,
  },
  {
    title: 'Ley 21/2003 de Seguridad Aérea (modificada por la Ley 8/2025)',
    text: 'Tipifica las infracciones específicas de UAS y las sanciones. La reforma está en vigor desde el 20/10/2025.',
    source: SOURCES.ley8_2025,
  },
];

export const OFFICIAL_LINKS: { label: string; url: string; description: string }[] = [
  { label: 'ENAIRE Drones', url: 'https://drones.enaire.es/', description: 'Visor oficial de zonas geográficas UAS y NOTAM.' },
  { label: 'ICARO XXI (NOTAM)', url: 'https://notampib.enaire.es/icaro', description: 'Fuente oficial de NOTAM.' },
  { label: 'ENAIRE Planea', url: 'https://planea.enaire.es', description: 'Solicitudes de coordinación con ENAIRE.' },
  {
    label: 'Datos oficiales de zonas UAS',
    url: 'https://aip.enaire.es/AIP/UAS-es.html',
    description: 'Descargas GeoJSON (ED-318) y API de ENAIRE.',
  },
  { label: 'AESA · Drones', url: 'https://www.seguridadaerea.gob.es/es/ambitos/drones', description: 'Registro, formación y normativa.' },
  { label: SOURCES.interior.label, url: SOURCES.interior.url, description: 'Comunicación previa de vuelos en entorno urbano.' },
  { label: SOURCES.aena.label, url: SOURCES.aena.url, description: 'Vuelos cerca de aeropuertos de Aena.' },
  { label: 'AEMET', url: 'https://www.aemet.es/', description: 'Avisos meteorológicos oficiales.' },
];
