import { useMemo } from 'react';
import type { AsyncState } from '../hooks/useAsync';
import type { DroneProfile } from '../logic/drone';
import { directionSpread, type ZoneAnalysis } from '../logic/zoneAnalysis';
import { formatArea, formatDistance } from '../lib/geo';
import type { DrawMode } from '../map/DrawController';
import type { Surroundings } from '../map/surroundings';
import type { KpEntry } from '../services/kp';
import { nearestHourIndex, type PointForecast, type WindHeight } from '../services/openMeteo';
import type { DrawnZone } from '../types';
import { AirspaceDetails } from './AirspaceDetails';
import { Icon } from './Icon';
import { DRAW_TOOLS } from './MapToolbar';
import { Notice, Spinner } from './ui';
import { WeatherDetails } from './WeatherDetails';

interface ZonePanelProps {
  zone: DrawnZone | null;
  analysis: AsyncState<ZoneAnalysis & { raw: PointForecast[] }>;
  drone: DroneProfile;
  time: number;
  start: number;
  hours: number;
  height: WindHeight;
  kp: KpEntry[] | null;
  surroundings: Surroundings | null;
  drawMode: DrawMode | null;
  onDrawMode(mode: DrawMode | null): void;
  onClear(): void;
  onSelectTime(time: number): void;
  onFocusZone(): void;
}

const SHAPE_LABEL: Record<DrawMode, string> = {
  freehand: 'Zona a mano alzada',
  polygon: 'Polígono',
  rectangle: 'Rectángulo',
  circle: 'Círculo',
};

export function ZonePanel(props: ZonePanelProps) {
  const { zone, analysis, drawMode, onDrawMode, onClear, time, height } = props;
  const data = analysis.data;
  const spread = useMemo(() => {
    if (!data?.raw.length) return 0;
    const idx = nearestHourIndex(data.raw[0].hourly.time, time);
    return directionSpread(data.raw, idx, height);
  }, [data, time, height]);

  if (!zone) {
    return (
      <div className="panel-body">
        <div className="empty">
          <p>
            <strong>Dibuja sobre el mapa la zona donde quieres volar.</strong> Te mostraremos el viento (velocidad y dirección a
            10, 80 y 120 m), la lluvia, las restricciones de ENAIRE que la afectan y los aeródromos cercanos.
          </p>
        </div>
        <div className="draw-grid">
          {DRAW_TOOLS.map((t) => (
            <button
              key={t.mode}
              type="button"
              className={`draw-card${drawMode === t.mode ? ' is-active' : ''}`}
              onClick={() => onDrawMode(drawMode === t.mode ? null : t.mode)}
            >
              <Icon name={t.icon} size={26} />
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const center = zone.centroid;
  return (
    <div className="panel-body">
      <div className="place-head">
        <h2 className="place-head__name">{SHAPE_LABEL[zone.kind]}</h2>
        <p className="place-head__coords">
          {formatArea(zone.areaM2)} · perímetro {formatDistance(zone.perimeterM)}
          {zone.radiusM ? ` · radio ${formatDistance(zone.radiusM)}` : ''}
        </p>
        <p className="place-head__coords">
          Centro {center[1].toFixed(5)}, {center[0].toFixed(5)}
          {data?.samples.length ? ` · ${data.samples.length} punto${data.samples.length > 1 ? 's' : ''} de muestreo` : ''}
        </p>
        <div className="place-head__actions">
          <button type="button" className="button button--small" onClick={props.onFocusZone}>
            Centrar en el mapa
          </button>
          <button type="button" className="button button--small" onClick={() => onDrawMode('freehand')}>
            Redibujar
          </button>
          <button type="button" className="button button--small button--danger" onClick={onClear}>
            <Icon name="trash" size={16} /> Borrar
          </button>
        </div>
      </div>

      {analysis.loading && <Spinner label="Analizando la zona…" />}
      {analysis.error && <Notice tone="error">{analysis.error}</Notice>}
      {data?.forecastError && <Notice tone="error">{data.forecastError}</Notice>}
      {data?.forecast && (
        <WeatherDetails
          forecast={data.forecast}
          drone={props.drone}
          time={time}
          start={props.start}
          hours={props.hours}
          height={height}
          kp={props.kp}
          onSelectTime={props.onSelectTime}
          windNote={data.samples.length > 1 ? 'valores máximos en la zona' : undefined}
          directionSpread={spread}
        />
      )}
      {data && (
        <AirspaceDetails
          zones={data.zones}
          zonesLoading={false}
          zonesError={data.zonesError}
          aerodromes={data.aerodromes}
          center={center}
          scope="zone"
          drone={props.drone}
          heightM={height}
          groundElevationM={data.forecast?.elevation ?? null}
          surroundings={props.surroundings}
        />
      )}
    </div>
  );
}
