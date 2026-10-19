import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AirspaceSummaryBadge } from './components/AirspaceSummaryBadge';
import { DronePanel } from './components/DronePanel';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { MapToolbar } from './components/MapToolbar';
import { MapView } from './components/MapView';
import { PlacePanel } from './components/PlacePanel';
import { RulesPanel } from './components/RulesPanel';
import { Sidebar, type TabKey } from './components/Sidebar';
import { TimeBar } from './components/TimeBar';
import { WindCompass } from './components/WindCompass';
import { ZonePanel } from './components/ZonePanel';
import { DRONE_BY_ID } from './data/drones';
import { useAsync } from './hooks/useAsync';
import { usePersistentState } from './hooks/usePersistentState';
import { hourlyLevels } from './logic/assessment';
import { GENERIC_PROFILE, droneName, type DroneProfile } from './logic/drone';
import { EMPTY_PILOT, type PilotProfile } from './logic/pilot';
import { analyzeZone } from './logic/zoneAnalysis';
import { ringAreaM2, ringBBox, ringCentroid, ringPerimeterM, type LngLatTuple } from './lib/geo';
import { clearAppData } from './lib/storage';
import { currentHour } from './lib/time';
import type { DrawMode, DrawnShape } from './map/DrawController';
import type { MapController, MapControllerCallbacks } from './map/MapController';
import type { Surroundings } from './map/surroundings';
import { findNearbyAerodromes } from './services/aerodromes';
import { ZONE_LAYERS, queryZones } from './services/enaire';
import { reversePlace, type PlaceResult } from './services/geocode';
import { fetchKpForecast } from './services/kp';
import { WIND_HEIGHTS, fetchPointForecast, hourAt, nearestHourIndex, type WindField, type WindHeight } from './services/openMeteo';
import { DEFAULT_LAYERS, type Basemap, type DrawnZone, type LayerToggles, type MapStatus } from './types';

const HOURS = 48;
const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;

function makeZone(shape: DrawnShape): DrawnZone {
  return {
    ...shape,
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    centroid: shape.center ?? ringCentroid(shape.ring),
    areaM2: ringAreaM2(shape.ring),
    perimeterM: ringPerimeterM(shape.ring),
  };
}

export default function App() {
  // Sin dron ni datos por defecto: cada instalación empieza de cero.
  const [storedDrone, setDrone] = usePersistentState<DroneProfile | null>('drone', null);
  const chosenDrone = storedDrone && (!storedDrone.modelId || DRONE_BY_ID.has(storedDrone.modelId)) ? storedDrone : null;
  /** Para las evaluaciones: el dron elegido o, mientras no lo haya, un perfil prudente. */
  const drone = chosenDrone ?? GENERIC_PROFILE;
  const [pilot, setPilot] = usePersistentState<PilotProfile>('pilot', EMPTY_PILOT);
  const [layers, setLayers] = usePersistentState<LayerToggles>('layers', DEFAULT_LAYERS);
  const [basemap, setBasemap] = usePersistentState<Basemap>('basemap', 'vector');
  const [storedHeight, setHeight] = usePersistentState<WindHeight>('windHeight', 120);
  const height = (WIND_HEIGHTS as readonly number[]).includes(storedHeight) ? storedHeight : 120;
  const [disclaimerSeen, setDisclaimerSeen] = usePersistentState('disclaimer-v1', false);

  const [start, setStart] = useState(currentHour);
  const [time, setTime] = useState(currentHour);
  const [point, setPoint] = useState<LngLatTuple | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [zone, setZone] = useState<DrawnZone | null>(null);
  const [drawMode, setDrawModeState] = useState<DrawMode | null>(null);
  const [drawVertices, setDrawVertices] = useState(0);
  const [tab, setTab] = useState<TabKey>(chosenDrone ? 'place' : 'drone');
  const [sheetOpen, setSheetOpen] = useState(() => !isNarrow());
  const [status, setStatus] = useState<MapStatus>({ weatherLoading: false, weatherError: null, zones: 'idle', zoneCount: 0 });
  const [radar, setRadar] = useState<{ index: number; count: number; time: number } | null>(null);
  const [view, setView] = useState({ center: [-3.6, 40] as LngLatTuple, zoom: 5.4, bearing: 0, pitch: 40 });
  const [field, setField] = useState<WindField | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [map, setMap] = useState<MapController | null>(null);
  const mapRef = useRef<MapController | null>(null);

  // La línea temporal avanza sola al cambiar la hora.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = currentHour();
      setStart((s) => (s === now ? s : now));
      setTime((t) => (t < now ? now : t));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // --- Datos -----------------------------------------------------------------
  const pointKey = point ? `${point[0].toFixed(5)},${point[1].toFixed(5)}` : '';
  const forecast = useAsync(point ? (signal) => fetchPointForecast(point, signal) : null, [pointKey]);
  const kp = useAsync(() => fetchKpForecast(), []);
  const pointZones = useAsync(
    point
      ? (signal) => queryZones({ type: 'point', point }, ZONE_LAYERS.filter((l) => l.geometry === 'polygon'), { signal })
      : null,
    [pointKey],
  );
  const pointAerodromes = useMemo(() => (point ? findNearbyAerodromes(point, 15_000, 8) : []), [point]);
  const analysis = useAsync(zone ? (signal) => analyzeZone(zone, signal) : null, [zone?.id]);

  // Entorno urbano, carreteras y espacios protegidos según los datos vectoriales del mapa.
  const [pointSurroundings, setPointSurroundings] = useState<Surroundings | null>(null);
  const [zoneSurroundings, setZoneSurroundings] = useState<Surroundings | null>(null);
  useEffect(() => {
    setPointSurroundings(null);
    if (!map || !point) return;
    let alive = true;
    void map.detectSurroundings(point).then((s) => alive && setPointSurroundings(s));
    return () => {
      alive = false;
    };
  }, [map, point]);
  useEffect(() => {
    setZoneSurroundings(null);
    if (!map || !zone) return;
    let alive = true;
    void map.detectSurroundings(zone.ring).then((s) => alive && setZoneSurroundings(s));
    return () => {
      alive = false;
    };
  }, [map, zone]);

  useEffect(() => {
    if (!point || placeName) return;
    const ctrl = new AbortController();
    reversePlace(point, ctrl.signal)
      .then((name) => !ctrl.signal.aborted && name && setPlaceName(name))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [point, placeName]);

  // --- Sincronización con el mapa ---------------------------------------------
  useEffect(() => map?.setLayers(layers), [map, layers]);
  useEffect(() => map?.setBasemap(basemap), [map, basemap]);
  useEffect(() => map?.setTime(time), [map, time]);
  useEffect(() => map?.setWindHeight(height), [map, height]);
  useEffect(() => map?.setZone(zone), [map, zone]);
  useEffect(() => map?.setZoneHighlights(analysis.data?.zones?.zones ?? []), [map, analysis.data]);

  const pointHour = useMemo(() => {
    if (!forecast.data) return null;
    return hourAt(forecast.data, nearestHourIndex(forecast.data.hourly.time, time));
  }, [forecast.data, time]);

  useEffect(() => {
    const w = pointHour?.wind[height];
    map?.setQueryPoint(point, w ? { dirFrom: w.dir, speed: w.speed } : null);
  }, [map, point, pointHour, height]);

  useEffect(() => map?.setRequestContext({ time, heightM: height, drone: chosenDrone, pilot }), [map, time, height, chosenDrone, pilot]);

  const onReady = useCallback((c: MapController) => {
    mapRef.current = c;
    setMap(c);
  }, []);

  const setDrawMode = useCallback((mode: DrawMode | null) => {
    setDrawModeState(mode);
    setDrawVertices(0);
    mapRef.current?.setDrawMode(mode);
    if (mode) {
      setTab('zone');
      if (isNarrow()) setSheetOpen(false);
    }
  }, []);

  const callbacks: MapControllerCallbacks = {
    onMapClick: (p) => {
      setPoint(p);
      setPlaceName(null);
      setTab('place');
      if (!isNarrow()) setSheetOpen(true);
    },
    onStatus: (s) => setStatus((prev) => ({ ...prev, ...s })),
    onShapeDrawn: (shape) => {
      setZone(makeZone(shape));
      setDrawModeState(null);
      setTab('zone');
      setSheetOpen(true);
    },
    onDrawCancel: () => setDrawModeState(null),
    onDrawProgress: (n) => setDrawVertices(n),
    onViewChange: (v) => setView(v),
    onRadarFrame: (f) => setRadar(f),
    onFieldChange: (f) => setField(f),
  };

  const focusZone = () => zone && mapRef.current?.fitBounds(ringBBox(zone.ring), 16);

  const onSearch = (place: PlaceResult) => {
    setPoint(place.center);
    setPlaceName(place.name);
    setTab('place');
    setSheetOpen(true);
    const b = place.bbox;
    if (b && b[2] - b[0] < 1.5 && b[3] - b[1] < 1.5 && b[2] > b[0]) mapRef.current?.fitBounds(b, 14);
    else mapRef.current?.flyTo(place.center, 13);
  };

  const onLocate = () => {
    if (!navigator.geolocation) {
      setLocateError('Tu navegador no permite obtener la ubicación.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p: LngLatTuple = [pos.coords.longitude, pos.coords.latitude];
        setPoint(p);
        setPlaceName('Tu ubicación');
        setTab('place');
        mapRef.current?.flyTo(p, 14);
      },
      (err) => {
        setLocating(false);
        setLocateError(err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado.' : 'No se pudo obtener tu ubicación.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  // --- Derivados para la interfaz ---------------------------------------------
  const activeForecast = tab === 'zone' && analysis.data?.forecast ? analysis.data.forecast : forecast.data;
  const timelineLevels = useMemo(
    () => (activeForecast ? hourlyLevels(drone, activeForecast, height, kp.data, start, HOURS) : null),
    [activeForecast, drone, height, kp.data, start],
  );

  const compass = useMemo(() => {
    if (pointHour && point) {
      const w = pointHour.wind[height];
      return { speed: w.speed, dirFrom: w.dir, gusts: pointHour.gusts, source: placeName ?? 'Punto seleccionado' };
    }
    const s = field ? mapRef.current?.sampleWind(view.center) : null;
    if (!s) return { speed: null, dirFrom: null, gusts: null, source: 'Centro del mapa' };
    const speed = Math.hypot(s.u, s.v);
    const dirFrom = ((Math.atan2(-s.u, -s.v) * 180) / Math.PI + 360) % 360;
    return { speed, dirFrom, gusts: null, source: 'Centro del mapa' };
  }, [pointHour, point, height, placeName, field, view.center]);

  const onClearData = () => {
    if (
      !window.confirm(
        '¿Borrar de este dispositivo tu nombre, tu ID de piloto, el nº de serie, el dron elegido y las preferencias del mapa? No se puede deshacer.',
      )
    ) {
      return;
    }
    clearAppData();
    window.location.replace(window.location.pathname);
  };

  let panel;
  if (tab === 'drone')
    panel = <DronePanel drone={chosenDrone} onChange={setDrone} pilot={pilot} onPilot={setPilot} onClearData={onClearData} />;
  else if (tab === 'zone')
    panel = (
      <ZonePanel
        zone={zone}
        analysis={analysis}
        drone={drone}
        pilot={pilot}
        time={time}
        start={start}
        hours={HOURS}
        height={height}
        kp={kp.data}
        surroundings={zoneSurroundings}
        drawMode={drawMode}
        onDrawMode={setDrawMode}
        onClear={() => setZone(null)}
        onSelectTime={setTime}
        onFocusZone={focusZone}
      />
    );
  else if (tab === 'rules') panel = <RulesPanel drone={drone} onChooseDrone={() => setTab('drone')} />;
  else
    panel = (
      <PlacePanel
        point={point}
        placeName={placeName}
        forecast={forecast}
        zones={pointZones}
        aerodromes={pointAerodromes}
        drone={drone}
        pilot={pilot}
        time={time}
        start={start}
        hours={HOURS}
        height={height}
        kp={kp.data}
        surroundings={pointSurroundings}
        onSelectTime={setTime}
        onLocate={onLocate}
        locating={locating}
      />
    );

  return (
    <div className="app">
      <Header
        droneLabel={chosenDrone ? droneName(chosenDrone) : 'Elige tu dron'}
        droneMissing={!chosenDrone}
        onSearch={onSearch}
        onLocate={onLocate}
        locating={locating}
        onHome={() => mapRef.current?.resetView()}
        onOpenDrone={() => {
          setTab('drone');
          setSheetOpen(true);
        }}
      />
      <main className={`main${sheetOpen ? ' has-sheet' : ''}`}>
        <MapView init={{ basemap, layers, windHeight: height, time }} callbacks={callbacks} onReady={onReady} />
        <MapToolbar
          drawMode={drawMode}
          drawVertices={drawVertices}
          hasZone={Boolean(zone)}
          onDrawMode={setDrawMode}
          onFinish={() => mapRef.current?.finishDrawing()}
          onUndo={() => mapRef.current?.undoDrawing()}
          onClearZone={() => setZone(null)}
          layers={layers}
          onLayers={setLayers}
          basemap={basemap}
          onBasemap={setBasemap}
          windHeight={height}
          onWindHeight={setHeight}
        />
        <div className="map-hud">
          <WindCompass
            speed={compass.speed}
            dirFrom={compass.dirFrom}
            gusts={compass.gusts}
            height={height}
            bearing={view.bearing}
            source={compass.source}
          />
          <Legend layers={layers} status={status} />
        </div>
        <TimeBar start={start} hours={HOURS} value={time} onChange={setTime} levels={timelineLevels} radar={layers.radar ? radar : null} />
        <Sidebar
          tab={tab}
          onTab={setTab}
          open={sheetOpen}
          onToggle={() => setSheetOpen((o) => !o)}
          badges={{
            zone: zone ? (
              <AirspaceSummaryBadge
                analysis={analysis.data}
                loading={analysis.loading}
                drone={drone}
                heightM={height}
                surroundings={zoneSurroundings}
              />
            ) : null,
          }}
        >
          {locateError && tab === 'place' && <div className="panel-alert">{locateError}</div>}
          {panel}
          <footer className="sidebar__footer">
            Información orientativa. La responsabilidad del vuelo es del piloto: consulta siempre{' '}
            <a href="https://drones.enaire.es" target="_blank" rel="noopener noreferrer">
              ENAIRE Drones
            </a>{' '}
            y{' '}
            <a href="https://www.seguridadaerea.gob.es/es/ambitos/drones" target="_blank" rel="noopener noreferrer">
              AESA
            </a>{' '}
            antes de volar.
          </footer>
        </Sidebar>
        {!disclaimerSeen && (
          <div className="disclaimer" role="dialog" aria-labelledby="disclaimer-title">
            <h2 id="disclaimer-title">Antes de empezar</h2>
            <p>
              Dron-App reúne previsión meteorológica (Open-Meteo), radar (RainViewer), zonas geográficas UAS oficiales (ENAIRE) y
              un resumen de la normativa española y europea. Es una ayuda para planificar: <strong>no sustituye</strong> a las fuentes
              oficiales ni a tu criterio como piloto.
            </p>
            <p className="small">
              Pulsa en el mapa para consultar un lugar o usa las herramientas de <strong>Dibujar zona</strong> para analizar el área
              donde quieres volar.
            </p>
            <button type="button" className="button button--primary" onClick={() => setDisclaimerSeen(true)}>
              Entendido
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
