# Dron-App

Aplicación web para planificar vuelos de dron en España. Reúne en un mapa 3D el **clima animado** (viento y lluvia), las
**zonas geográficas UAS oficiales de ENAIRE**, los **aeródromos cercanos** y un resumen de la **normativa** aplicable a tu
dron concreto.

> Información orientativa. La responsabilidad del vuelo es del piloto: consulta siempre
> [ENAIRE Drones](https://drones.enaire.es) y [AESA](https://www.seguridadaerea.gob.es/es/ambitos/drones) antes de volar.

## Funciones

- **Piloto y dron.** En la pestaña «Piloto» se guardan tus datos (nombre y apellidos, ID de piloto o nº de operador y nº
  de serie del dron) y se elige el dron. Catálogo de 54 modelos (DJI, Autel, Parrot, Potensic, HoverAir, Skydio, Holy
  Stone, Ryze, FIMI, Hubsan) con masa, marcado de clase UE (C0–C4 o sin marcado) según el registro de EASA, resistencia al
  viento, protección IP y temperaturas de funcionamiento del fabricante. También se puede definir un dron a mano. La app
  calcula la subcategoría (A1, A2 o A3) y los requisitos en España: registro de operador, Remote ID, formación, edad
  mínima, seguro y privacidad. Si el ID incluye la parte secreta del nº de operador (los 3 caracteres tras el guion), la
  app avisa y nunca la incluye en las solicitudes.
- **Clima en un mapa 3D con animaciones.**
  - Relieve 3D, edificios 3D y ortofoto PNOA del IGN.
  - **Viento animado con partículas** que avanzan en la dirección en la que sopla, coloreadas según la velocidad. Se puede
    elegir la altura: 10, 80 o 120 m.
  - Flechas de viento con la velocidad en km/h y una brújula animada que gira con el mapa.
  - **Lluvia y nieve animadas** donde hay precipitación prevista (las gotas se inclinan con el viento), con rayos en las
    zonas de tormenta.
  - **Radar de lluvia real** de las últimas horas, también animado.
  - Barra temporal de 48 horas con reproducción y una franja de colores que indica **cuándo se puede volar**.
- **Restricciones de la zona.**
  - Zonas UAS oficiales de ENAIRE: aeródromos, CTR/FIZ, zonas prohibidas, restringidas o peligrosas, NOTAM,
    infraestructuras, espacios naturales y fotografía aérea.
  - Aeródromos y helipuertos cercanos, con sus zonas de protección del art. 41 del RD 517/2024 calculadas a partir de las
    pistas.
  - Detección aproximada, con los datos del mapa, de entorno urbano, carreteras y vías férreas, y parques nacionales.
  - **Contacto de la entidad responsable** en cada aviso (en el panel y al pulsar la zona en el mapa): teléfono para
    llamar y correo con la solicitud ya rellena (lugar, fecha y hora, altura, dron, nº de serie, piloto e ID). Se usa el
    contacto que ENAIRE publica para la zona y, si falta el teléfono o el correo, el oficial según el tipo de zona
    (ENAIRE, Aena, Defensa, CECAF, Interior…), recogido en `src/data/contacts.ts`.
- **Dibujar una zona.** Se puede dibujar a mano alzada, como polígono, rectángulo o círculo. Para la zona dibujada la app
  muestra:
  - viento por alturas y su dirección (con la variación entre distintos puntos de la zona) y las rachas;
  - lluvia, visibilidad y temperatura;
  - zonas ENAIRE que la cruzan y aeródromos cercanos;
  - un veredicto «Apto / Precaución / No recomendado» para tu dron, hora a hora.

## Tus datos

Dron-App no tiene cuentas ni servidor propio. Tus datos de piloto, el dron elegido y las preferencias del mapa se guardan
solo en el navegador (`localStorage`) y únicamente salen de él en los correos que tú decidas enviar.

- Una instalación nueva empieza de cero: sin dron ni lugar preseleccionados.
- Al subir `STORAGE_VERSION` (en `src/lib/storage.ts`) se borra lo guardado por versiones anteriores. La versión 2 elimina
  los datos que quedaron de las pruebas.
- «Borrar mis datos», al final de la pestaña «Piloto», lo elimina todo de ese dispositivo.

## Cómo decide si puedes volar

| Factor | Criterio |
|---|---|
| Viento (máximo entre 10 m y la altura de vuelo) | Precaución desde el 60 % de la resistencia del fabricante; no recomendado desde el 85 % |
| Rachas | Precaución desde el 75 %; no recomendado al alcanzar la resistencia del fabricante |
| Lluvia o nieve | No recomendado sin protección IP; tormenta siempre no recomendado |
| Visibilidad | Precaución por debajo de 3 km; no recomendado por debajo de 1 km |
| Temperatura | Según el rango del fabricante (−10 a 40 °C si no se conoce) |
| Índice Kp (GNSS) | Precaución desde Kp 5; no recomendado desde Kp 7 |
| Noche legal (tras el crepúsculo civil) | Precaución: luz verde intermitente obligatoria |
| Espacio aéreo | Según las zonas de ENAIRE, la altura de vuelo (CTR hasta 60 m sin coordinación) y la elevación del aeródromo (45/90 m sobre el ARP) |

Los umbrales meteorológicos son de buena práctica: la normativa no fija valores numéricos, sino que obliga a respetar los
límites del fabricante.

## Fuentes de datos

Ninguna fuente necesita clave de API. Todo se consulta desde el navegador.

| Dato | Fuente | Licencia |
|---|---|---|
| Previsión horaria (viento a 10/80/120 m, rachas, precipitación…) | [Open-Meteo](https://open-meteo.com) | CC BY 4.0 (uso no comercial gratuito) |
| Radar de precipitación | [RainViewer](https://www.rainviewer.com/api.html) | Condiciones de RainViewer |
| Índice Kp | [NOAA SWPC](https://www.swpc.noaa.gov/) | Dominio público |
| Zonas geográficas UAS | [ENAIRE](https://drones.enaire.es) (servicios ArcGIS REST del visor oficial) | Titularidad de ENAIRE |
| Aeródromos y pistas | [OurAirports](https://ourairports.com/data/) | Dominio público |
| Mapa base vectorial | [OpenFreeMap](https://openfreemap.org) / © OpenStreetMap | ODbL |
| Ortofoto | [PNOA, IGN](https://www.ign.es) | CC BY 4.0 |
| Relieve 3D | [Mapzen Terrain Tiles en AWS](https://registry.opendata.aws/terrain-tiles/) | Varias, abiertas |
| Búsqueda de lugares | [Photon](https://photon.komoot.io) / OpenStreetMap | ODbL |

Normativa: Reglamento de Ejecución (UE) 2019/947, Reglamento Delegado (UE) 2019/945,
[Real Decreto 517/2024](https://www.boe.es/buscar/act.php?id=BOE-A-2024-11377) y Ley 21/2003 modificada por la Ley 8/2025.
El resumen está en `src/data/regulations.ts`, con el artículo y la fuente oficial de cada regla (revisado en octubre de
2026).

### Sobre ENAIRE

Los servicios de ENAIRE están detrás de un cortafuegos que puede rechazar peticiones de algunas redes o regiones. Si no
responden:

- la app lo indica y usa las zonas orientativas de aeródromos calculadas en local;
- en desarrollo, `npm run dev` incluye un proxy (`/enaire-proxy`) por si el CORS bloquea las peticiones;
- en producción se puede apuntar a un proxy propio con la variable `VITE_ENAIRE_BASE_URL` (por ejemplo
  `https://mi-proxy.example/insignias/rest/services`).

## Desarrollo

Requiere Node.js 20.19 o superior.

```bash
npm install
npm run dev       # servidor de desarrollo en http://localhost:5173
npm test          # tests unitarios (Vitest)
npm run build     # comprobación de tipos y build de producción en dist/
npm run preview   # sirve el build
npm run data:aerodromes   # regenera src/data/aerodromes-es.json desde OurAirports
```

### Estructura

```
src/
  App.tsx                 estado global y composición de la interfaz
  components/             paneles (piloto y dron, lugar, zona, normativa), contactos, barra temporal, brújula…
  map/
    MapController.ts      mapa MapLibre 3D: estilos, capas, zonas, radar
    WeatherOverlay.ts     animación de partículas de viento, lluvia, nieve y rayos
    DrawController.ts     herramientas de dibujo (mano alzada, polígono, rectángulo, círculo)
    surroundings.ts       detección de entorno urbano e infraestructuras con los datos del mapa
  services/               Open-Meteo, ENAIRE, RainViewer, NOAA Kp, aeródromos, geocodificación
  logic/                  clasificación del dron, evaluación del vuelo, análisis de zonas, piloto, solicitudes
  data/                   catálogo de drones, aeródromos, normativa y contactos oficiales
  lib/                    geodesia, viento, Sol (crepúsculo civil), fechas, contactos, almacenamiento local
```

## Publicación

Es una web estática: el contenido de `dist/` se puede servir desde cualquier hosting. El repositorio incluye un flujo de
GitHub Actions que la publica en GitHub Pages al actualizar `main`. Para activarlo, ve a **Settings → Pages → Source:
GitHub Actions**. Al abrirla en el móvil se puede añadir a la pantalla de inicio.

## Limitaciones

- La previsión es un modelo numérico (Open-Meteo elige el mejor disponible para cada punto). No sustituye a los avisos
  de AEMET.
- La capa urbana de ENAIRE solo es un aviso genérico. La detección de entorno urbano, carreteras y espacios protegidos
  usa OpenStreetMap: es aproximada y necesita zoom 13 o más.
- Las zonas de aeródromo calculadas en local suponen el tipo de uso (público o restringido) a partir del tipo de
  instalación. La referencia legal son las zonas publicadas por ENAIRE.
