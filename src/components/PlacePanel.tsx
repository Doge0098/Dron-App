import type { AsyncState } from '../hooks/useAsync';
import type { DroneProfile } from '../logic/drone';
import type { LngLatTuple } from '../lib/geo';
import type { Surroundings } from '../map/surroundings';
import type { NearbyAerodrome } from '../services/aerodromes';
import type { ZoneQueryResult } from '../services/enaire';
import type { KpEntry } from '../services/kp';
import type { PointForecast, WindHeight } from '../services/openMeteo';
import { AirspaceDetails } from './AirspaceDetails';
import { Notice, Spinner } from './ui';
import { WeatherDetails } from './WeatherDetails';

interface PlacePanelProps {
  point: LngLatTuple | null;
  placeName: string | null;
  forecast: AsyncState<PointForecast>;
  zones: AsyncState<ZoneQueryResult>;
  aerodromes: NearbyAerodrome[];
  drone: DroneProfile;
  time: number;
  start: number;
  hours: number;
  height: WindHeight;
  kp: KpEntry[] | null;
  surroundings: Surroundings | null;
  onSelectTime(time: number): void;
}

export function PlacePanel(props: PlacePanelProps) {
  const { point, placeName, forecast, zones, aerodromes } = props;
  if (!point) {
    return (
      <div className="empty">
        <p>
          <strong>Pulsa en cualquier punto del mapa</strong> o busca un lugar para ver el tiempo, el viento por alturas y las
          restricciones para volar allí.
        </p>
      </div>
    );
  }
  return (
    <div className="panel-body">
      <div className="place-head">
        <h2 className="place-head__name">{placeName ?? 'Punto seleccionado'}</h2>
        <p className="place-head__coords">
          {point[1].toFixed(5)}, {point[0].toFixed(5)}
          {forecast.data && Number.isFinite(forecast.data.elevation) ? ` · ${Math.round(forecast.data.elevation)} m de altitud` : ''}
        </p>
      </div>
      {forecast.loading && !forecast.data && <Spinner label="Cargando previsión…" />}
      {forecast.error && <Notice tone="error">No se pudo cargar la previsión: {forecast.error}</Notice>}
      {forecast.data && (
        <WeatherDetails
          forecast={forecast.data}
          drone={props.drone}
          time={props.time}
          start={props.start}
          hours={props.hours}
          height={props.height}
          kp={props.kp}
          onSelectTime={props.onSelectTime}
        />
      )}
      <AirspaceDetails
        zones={zones.data}
        zonesLoading={zones.loading}
        zonesError={zones.error}
        aerodromes={aerodromes}
        center={point}
        scope="point"
        drone={props.drone}
        heightM={props.height}
        groundElevationM={forecast.data?.elevation ?? null}
        surroundings={props.surroundings}
      />
    </div>
  );
}
