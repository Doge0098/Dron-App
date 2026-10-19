import { useMemo } from 'react';
import { hourlyLevels, maxWindUpTo, weatherChecks, worstLevel } from '../logic/assessment';
import { windLimitFor, type DroneProfile } from '../logic/drone';
import { compassPoint, formatDistance } from '../lib/geo';
import { isLegalNight, sunTimes } from '../lib/sun';
import { formatHour, relativeDay } from '../lib/time';
import { weatherCodeInfo } from '../lib/weatherCodes';
import { beaufort, describeDirection, msToKmh } from '../lib/wind';
import { kpAt, type KpEntry } from '../services/kp';
import { WIND_HEIGHTS, hourAt, nearestHourIndex, type PointForecast, type WindHeight } from '../services/openMeteo';
import { HourlyChart } from './HourlyChart';
import { CheckList, LevelPill, Section, Stat, WindArrow } from './ui';

interface WeatherDetailsProps {
  forecast: PointForecast;
  drone: DroneProfile;
  time: number;
  start: number;
  hours: number;
  height: WindHeight;
  kp: KpEntry[] | null;
  onSelectTime(time: number): void;
  /** Texto para el bloque de viento (p. ej. "máximo en la zona"). */
  windNote?: string;
  directionSpread?: number;
}

const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

export function WeatherDetails(props: WeatherDetailsProps) {
  const { forecast, drone, time, start, hours, height, kp, onSelectTime, windNote, directionSpread } = props;
  const index = nearestHourIndex(forecast.hourly.time, time);
  const hour = hourAt(forecast, index);
  const kpNow = kp ? kpAt(kp, time)?.kp ?? null : null;
  const night = hour ? isLegalNight(hour.time, forecast.lat, forecast.lon) : false;
  const checks = useMemo(
    () => (hour ? weatherChecks(drone, hour, { height, kp: kpNow, night }) : []),
    [hour, drone, height, kpNow, night],
  );
  const levels = useMemo(() => hourlyLevels(drone, forecast, height, kp, start, hours), [drone, forecast, height, kp, start, hours]);
  if (!hour) return <p className="muted">Sin previsión para esta hora.</p>;

  const level = worstLevel(checks);
  const code = weatherCodeInfo(hour.weatherCode);
  const strongest = maxWindUpTo(hour, height);
  const limit = windLimitFor(drone);
  const sun = sunTimes(time * 1000, forecast.lat, forecast.lon);
  const nextOk = levels.find((l) => l.time >= time && l.level === 'ok');

  return (
    <>
      <div className={`verdict verdict--${level}`}>
        <div className="verdict__main">
          <span className="verdict__icon" aria-hidden="true">
            {code.icon}
          </span>
          <div>
            <p className="verdict__when">
              {relativeDay(time)} a las {formatHour(time)} · {code.label}
            </p>
            <LevelPill level={level} large />
          </div>
        </div>
        <p className="verdict__summary">
          {level === 'ok'
            ? `Las condiciones meteorológicas son adecuadas para ${drone.generic ? 'un dron ligero' : 'tu dron'}.`
            : level === 'caution'
              ? 'Se puede volar con precaución: revisa los puntos marcados.'
              : 'No se recomienda volar con estas condiciones.'}
          {level !== 'ok' && nextOk && nextOk.time !== time ? (
            <>
              {' '}
              Próxima franja apta: <button type="button" className="link-button" onClick={() => onSelectTime(nextOk.time)}>
                {relativeDay(nextOk.time)} {formatHour(nextOk.time)}
              </button>
              .
            </>
          ) : null}
        </p>
      </div>

      <Section title="Viento" aside={windNote ? <span className="muted small">{windNote}</span> : undefined}>
        <table className="wind-table">
          <thead>
            <tr>
              <th scope="col">Altura</th>
              <th scope="col">Velocidad</th>
              <th scope="col">Dirección</th>
            </tr>
          </thead>
          <tbody>
            {WIND_HEIGHTS.map((h) => {
              const w = hour.wind[h];
              return (
                <tr key={h} className={h === height ? 'is-selected' : ''}>
                  <th scope="row">{h} m</th>
                  <td>
                    {Number.isFinite(w.speed) ? (
                      <>
                        <strong>{Math.round(msToKmh(w.speed))} km/h</strong> <span className="muted">{fmt1(w.speed)} m/s</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className="wind-dir">
                      <WindArrow dirFrom={w.dir} animated={h === height} />
                      {Number.isFinite(w.dir) ? `del ${compassPoint(w.dir)}` : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small">
          {Number.isFinite(strongest.dir) ? `Viento ${describeDirection(strongest.dir)}. ` : ''}
          {Number.isFinite(strongest.speed) ? `${beaufort(strongest.speed).name} (Beaufort ${beaufort(strongest.speed).force}). ` : ''}
          {Number.isFinite(hour.gusts) ? `Rachas de ${Math.round(msToKmh(hour.gusts))} km/h. ` : ''}
          {drone.generic
            ? `Sin dron elegido se usa un límite prudente de ${Math.round(msToKmh(limit.limit))} km/h: elige el tuyo en «Piloto» para ajustarlo.`
            : `Límite de tu dron: ${Math.round(msToKmh(limit.limit))} km/h${limit.estimated ? ' (estimado)' : ''}.`}
          {directionSpread != null && directionSpread > 45
            ? ` La dirección varía hasta ${Math.round(directionSpread)}° entre distintos puntos de la zona (viento racheado o turbulento).`
            : ''}
        </p>
      </Section>

      <Section title="Condiciones">
        <div className="stats">
          <Stat label="Temperatura" value={`${Math.round(hour.temperature)} °C`} />
          <Stat
            label="Precipitación"
            value={`${fmt1(Number.isFinite(hour.precipitation) ? hour.precipitation : 0)} mm/h`}
            hint={Number.isFinite(hour.precipitationProbability) ? `${Math.round(hour.precipitationProbability)} % prob.` : undefined}
          />
          <Stat label="Nubosidad" value={Number.isFinite(hour.cloudCover) ? `${Math.round(hour.cloudCover)} %` : '—'} />
          <Stat label="Visibilidad" value={Number.isFinite(hour.visibility) ? formatDistance(hour.visibility) : '—'} />
          <Stat label="Humedad" value={Number.isFinite(hour.humidity) ? `${Math.round(hour.humidity)} %` : '—'} />
          <Stat label="Índice Kp" value={kpNow != null ? fmt1(kpNow) : '—'} hint="GPS" />
          <Stat label="Amanecer" value={formatHour(sun.sunrise / 1000)} hint={`luz desde ${formatHour(sun.civilDawn / 1000)}`} />
          <Stat label="Atardecer" value={formatHour(sun.sunset / 1000)} hint={`noche desde ${formatHour(sun.civilDusk / 1000)}`} />
        </div>
      </Section>

      <Section title="¿Puedo volar?">
        <CheckList checks={checks} />
      </Section>

      <Section title={`Próximas ${hours} horas`}>
        <HourlyChart
          forecast={forecast}
          from={start}
          hours={hours}
          height={height}
          limitMs={limit.limit}
          levels={levels}
          selected={forecast.hourly.time[index]}
          onSelect={onSelectTime}
        />
        <p className="small muted">Pulsa en el gráfico para ver otra hora. Franja inferior: verde apto, ámbar precaución, rojo no recomendado.</p>
      </Section>
    </>
  );
}
