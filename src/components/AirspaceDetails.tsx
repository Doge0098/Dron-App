import { useMemo } from 'react';
import { airspaceChecks } from '../logic/assessment';
import type { DroneProfile } from '../logic/drone';
import type { Check } from '../logic/assessment';
import { compassPoint, formatDistance, type LngLatTuple } from '../lib/geo';
import type { Surroundings } from '../map/surroundings';
import { AERODROME_TYPE_LABEL, type NearbyAerodrome } from '../services/aerodromes';
import { SEVERITY_LABEL, enaireViewerUrl, type UasZone, type ZoneQueryResult } from '../services/enaire';
import { CheckList, ExternalLink, LevelPill, Notice, Section, Spinner } from './ui';

interface AirspaceDetailsProps {
  zones: ZoneQueryResult | null;
  zonesLoading: boolean;
  zonesError: string | null;
  aerodromes: NearbyAerodrome[];
  center: LngLatTuple;
  scope: 'point' | 'zone';
  drone: DroneProfile;
  heightM: number;
  groundElevationM: number | null;
  surroundings: Surroundings | null;
}

function ZoneCard({ zone, check }: { zone: UasZone; check?: Check }) {
  const limits = [zone.lower && `desde ${zone.lower}`, zone.upper && `hasta ${zone.upper}`].filter(Boolean).join(' ');
  return (
    <li className={`zone-card zone-card--${zone.severity}`}>
      <div className="zone-card__head">
        <span className="zone-card__layer">{zone.layerLabel}</span>
        <span className={`badge badge--${zone.severity}`}>{SEVERITY_LABEL[zone.severity]}</span>
      </div>
      <strong className="zone-card__name">
        {zone.name}
        {zone.identifier && zone.identifier !== zone.name ? <span className="muted"> · {zone.identifier}</span> : null}
      </strong>
      {check?.note && <p className={`zone-card__note zone-card__note--${check.level}`}>{check.note}</p>}
      {limits && <span className="zone-card__meta">Altitudes: {limits}</span>}
      {zone.validity && <span className="zone-card__meta">Vigencia: {zone.validity}</span>}
      {zone.schedule && <span className="zone-card__meta">Horario: {zone.schedule}</span>}
      {zone.message && (
        <details className="zone-card__details">
          <summary>Condiciones publicadas por ENAIRE</summary>
          <p>{zone.message}</p>
        </details>
      )}
      {zone.contact && <span className="zone-card__meta">Contacto: {zone.contact}</span>}
    </li>
  );
}

export function AirspaceDetails(props: AirspaceDetailsProps) {
  const { zones, zonesLoading, zonesError, aerodromes, center, scope } = props;
  const available = Boolean(zones && !zones.unavailable);
  const summary = useMemo(
    () =>
      airspaceChecks(
        zones?.zones ?? null,
        aerodromes,
        zonesLoading || available,
        { drone: props.drone, heightM: props.heightM, groundElevationM: props.groundElevationM, surroundings: props.surroundings },
        scope,
      ),
    [zones, aerodromes, zonesLoading, available, props.drone, props.heightM, props.groundElevationM, props.surroundings, scope],
  );
  const relevant = (zones?.zones ?? []).filter((z) => z.layer !== 'aerodromes' && z.layer !== 'modelFields');
  const points = (zones?.zones ?? []).filter((z) => z.layer === 'aerodromes' || z.layer === 'modelFields');
  const otherChecks = summary.checks.filter((c) => !relevant.some((z) => z.uid === c.id));

  return (
    <>
      <Section title="Espacio aéreo y restricciones" aside={zonesLoading ? <Spinner /> : <LevelPill level={summary.level} />}>
        {!zonesLoading && <p className="airspace-headline">{summary.headline}</p>}
        <p className="small muted">Evaluado para volar hasta {props.heightM} m sobre el terreno (cámbialo en Capas → Altura de vuelo).</p>
        {zonesLoading && <p className="muted small">Consultando las zonas geográficas UAS de ENAIRE…</p>}
        {!zonesLoading && (zonesError || zones?.unavailable) && (
          <Notice tone="warning">
            No se pudo consultar ENAIRE desde tu navegador (red, CORS o bloqueo temporal). Se usan las zonas orientativas de
            aeródromos calculadas con el dataset local. <ExternalLink href={enaireViewerUrl(center)}>Ver en ENAIRE Drones</ExternalLink>
          </Notice>
        )}
        {!zonesLoading && zones && !zones.unavailable && zones.failedLayers.length > 0 && (
          <Notice tone="info">Algunas capas de ENAIRE no respondieron ({zones.failedLayers.length}). Comprueba el visor oficial.</Notice>
        )}
        {!zonesLoading && available && relevant.length === 0 && (
          <p className="small">
            {scope === 'zone' ? 'La zona dibujada' : 'Este punto'} no interseca ninguna zona geográfica UAS publicada por ENAIRE.
          </p>
        )}
        {relevant.length > 0 && (
          <ul className="zone-list">
            {relevant.map((z) => (
              <ZoneCard key={z.uid} zone={z} check={summary.checks.find((c) => c.id === z.uid)} />
            ))}
          </ul>
        )}
        {otherChecks.length > 0 && <CheckList checks={otherChecks} />}
        {points.length > 0 && <p className="small muted">Puntos ENAIRE en la zona: {points.map((p) => p.name).join(', ')}.</p>}
        <p className="small">
          <ExternalLink href={enaireViewerUrl(center)}>Abrir este lugar en el visor oficial ENAIRE Drones</ExternalLink>
        </p>
      </Section>

      <Section title="Aeródromos y helipuertos cercanos">
        {aerodromes.length === 0 ? (
          <p className="small">No hay aeródromos ni helipuertos registrados a menos de 15 km.</p>
        ) : (
          <ul className="aero-list">
            {aerodromes.map((n) => (
              <li key={n.aerodrome.id} className={n.relation ? 'is-near' : ''}>
                <span className={`aero-list__type aero-list__type--${n.aerodrome.type}`}>{AERODROME_TYPE_LABEL[n.aerodrome.type]}</span>
                <span className="aero-list__name">
                  {n.aerodrome.name}
                  {n.aerodrome.icao && <span className="muted"> · {n.aerodrome.icao}</span>}
                </span>
                <span className="aero-list__dist">
                  {n.distanceM === 0 ? 'dentro de la zona dibujada' : `${formatDistance(n.distanceM)} al ${compassPoint(n.bearing)}`}
                  {n.elevationM != null ? ` · elevación ${n.elevationM} m` : ''}
                </span>
                {n.relation && (
                  <span className="aero-list__warn">
                    {n.relation === 'inner'
                      ? `Dentro del volumen de protección (${n.zones.spec.article}): coordinación obligatoria`
                      : `Volumen exterior: coordinar por encima de ${n.zones.spec.innerTopM} m sobre su elevación`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">
          Distancias {scope === 'zone' ? 'desde el borde de la zona' : 'desde el punto'} al punto de referencia. Zonas orientativas
          según el art. 41 del RD 517/2024 con las pistas de OurAirports; la referencia legal son las zonas de ENAIRE.
        </p>
      </Section>
    </>
  );
}
