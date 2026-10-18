import { useState } from 'react';
import { WIND_COLOR_STOPS, msToKmh } from '../lib/wind';
import { SEVERITY_LABEL, type ZoneSeverity } from '../services/enaire';
import type { LayerToggles, MapStatus } from '../types';
import { Icon } from './Icon';
import { Spinner } from './ui';

const ZONE_STATUS_TEXT: Record<MapStatus['zones'], string> = {
  idle: 'Zonas ENAIRE desactivadas',
  loading: 'Cargando zonas ENAIRE…',
  ok: 'Zonas ENAIRE al día',
  partial: 'Algunas capas de ENAIRE no respondieron',
  unavailable: 'ENAIRE no disponible desde este navegador',
  zoom: 'Acerca el mapa para ver zonas ENAIRE',
};

export function Legend({ layers, status }: { layers: LayerToggles; status: MapStatus }) {
  const [open, setOpen] = useState(() => window.innerWidth > 900);
  const gradient = `linear-gradient(90deg, ${WIND_COLOR_STOPS.map(([s, c]) => `${c} ${(s / 20) * 100}%`).join(', ')})`;
  return (
    <div className={`legend${open ? ' is-open' : ''}`}>
      <button type="button" className="legend__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Leyenda
        <Icon name="chevron" size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div className="legend__body">
          {(layers.wind || layers.arrows) && (
            <div className="legend__block">
              <span className="legend__title">Viento (las partículas avanzan hacia donde sopla)</span>
              <div className="legend__gradient" style={{ background: gradient }} />
              <div className="legend__scale">
                {[0, 5, 10, 15, 20].map((s) => (
                  <span key={s}>{Math.round(msToKmh(s))}</span>
                ))}
                <span>km/h</span>
              </div>
            </div>
          )}
          {layers.zones && (
            <div className="legend__block">
              <span className="legend__title">Zonas UAS</span>
              {(Object.keys(SEVERITY_LABEL) as ZoneSeverity[]).map((s) => (
                <span key={s} className="legend__item">
                  <span className={`legend__swatch legend__swatch--${s}`} />
                  {SEVERITY_LABEL[s]}
                </span>
              ))}
            </div>
          )}
          {layers.aerodromes && (
            <div className="legend__block">
              <span className="legend__item">
                <span className="legend__swatch legend__swatch--aero" />
                Zonas orientativas de aeródromos (art. 41 RD 517/2024)
              </span>
            </div>
          )}
          <div className="legend__status">
            {status.weatherLoading && <Spinner label="Actualizando viento…" />}
            {status.weatherError && <span className="legend__error">{status.weatherError}</span>}
            {layers.zones && (
              <span className={`legend__zones legend__zones--${status.zones}`}>
                {status.zones === 'loading' ? <Spinner label={ZONE_STATUS_TEXT.loading} /> : ZONE_STATUS_TEXT[status.zones]}
                {status.zones === 'ok' || status.zones === 'partial' ? ` (${status.zoneCount})` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
