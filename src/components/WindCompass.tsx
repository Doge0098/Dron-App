import { compassName, compassPoint } from '../lib/geo';
import { beaufort, dirTowards, msToKmh, windColor } from '../lib/wind';

interface WindCompassProps {
  speed: number | null;
  dirFrom: number | null;
  gusts?: number | null;
  height: number;
  /** Rumbo del mapa: la rosa gira con el mapa para que el norte coincida. */
  bearing: number;
  source: string;
}

export function WindCompass({ speed, dirFrom, gusts, height, bearing, source }: WindCompassProps) {
  const ok = speed != null && dirFrom != null && Number.isFinite(speed) && Number.isFinite(dirFrom);
  const towards = ok ? dirTowards(dirFrom!) : 0;
  const color = ok ? windColor(speed!) : 'var(--muted)';
  // Más viento → flujo más rápido en la flecha.
  const duration = ok ? Math.max(0.5, 2.4 - speed! / 7) : 2;
  return (
    <div className="compass" aria-live="polite">
      <div className="compass__dial" style={{ transform: `rotate(${-bearing}deg)` }}>
        <svg viewBox="-60 -60 120 120" width="112" height="112" aria-hidden="true">
          <circle r="54" className="compass__ring" />
          {Array.from({ length: 16 }, (_, i) => (
            <line
              key={i}
              className={i % 4 === 0 ? 'compass__tick compass__tick--major' : 'compass__tick'}
              y1={-54}
              y2={i % 4 === 0 ? -46 : -50}
              transform={`rotate(${i * 22.5})`}
            />
          ))}
          {(['N', 'E', 'S', 'O'] as const).map((l, i) => (
            <text key={l} className={`compass__cardinal${l === 'N' ? ' is-north' : ''}`} transform={`rotate(${i * 90}) translate(0 -34) rotate(${-i * 90 + bearing})`}>
              {l}
            </text>
          ))}
          {ok && (
            <g transform={`rotate(${towards})`} style={{ color }}>
              <line className="compass__flow" y1={30} y2={-26} style={{ animationDuration: `${duration}s` }} />
              <path d="M0 -40 L10 -22 L-10 -22 Z" fill="currentColor" />
              <circle cy={30} r="4" fill="currentColor" opacity="0.7" />
            </g>
          )}
        </svg>
      </div>
      <div className="compass__info">
        <span className="compass__title">Viento a {height} m</span>
        {ok ? (
          <>
            <strong className="compass__speed" style={{ color }}>
              {Math.round(msToKmh(speed!))} <small>km/h</small>
            </strong>
            <span className="compass__dir">
              Del {compassPoint(dirFrom!)} → hacia el {compassName(towards)}
            </span>
            <span className="compass__meta">
              {beaufort(speed!).name}
              {gusts != null && Number.isFinite(gusts) ? ` · rachas ${Math.round(msToKmh(gusts))} km/h` : ''}
            </span>
          </>
        ) : (
          <span className="compass__meta">Sin datos</span>
        )}
        <span className="compass__source">{source}</span>
      </div>
    </div>
  );
}
