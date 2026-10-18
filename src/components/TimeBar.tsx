import { useEffect, useState } from 'react';
import type { Level } from '../logic/assessment';
import { formatHour, relativeDay } from '../lib/time';
import { Icon } from './Icon';

interface TimeBarProps {
  start: number;
  hours: number;
  value: number;
  onChange(time: number): void;
  levels: { time: number; level: Level }[] | null;
  radar: { index: number; count: number; time: number } | null;
}

export function TimeBar({ start, hours, value, onChange, levels, radar }: TimeBarProps) {
  const [playing, setPlaying] = useState(false);
  const offset = Math.round((value - start) / 3600);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      onChange(start + ((Math.round((value - start) / 3600) + 1) % hours) * 3600);
    }, 1100);
    return () => window.clearInterval(id);
  }, [playing, value, start, hours, onChange]);

  const levelByTime = new Map(levels?.map((l) => [l.time, l.level]));
  const minutesAgo = radar ? Math.max(0, Math.round((Date.now() / 1000 - radar.time) / 60)) : 0;

  return (
    <div className="timebar">
      <button
        type="button"
        className="icon-button icon-button--accent"
        onClick={() => setPlaying((p) => !p)}
        title={playing ? 'Pausar la previsión' : 'Reproducir la previsión hora a hora'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
        <span className="sr-only">{playing ? 'Pausar' : 'Reproducir'}</span>
      </button>
      <div className="timebar__main">
        <div className="timebar__row">
          <span className="timebar__time">
            <strong>{relativeDay(value)}</strong> {formatHour(value)}
          </span>
          <span className="timebar__offset">{offset === 0 ? 'ahora' : `+${offset} h`}</span>
          {offset !== 0 && (
            <button type="button" className="link-button" onClick={() => onChange(start)}>
              Volver a ahora
            </button>
          )}
          {radar && (
            <span className="timebar__radar" title="Fotograma del radar de precipitación (RainViewer)">
              Radar {formatHour(radar.time)} · hace {minutesAgo} min
            </span>
          )}
        </div>
        <div className="timebar__track">
          {levels && (
            <div className="timebar__levels" aria-hidden="true">
              {Array.from({ length: hours }, (_, i) => {
                const level = levelByTime.get(start + i * 3600);
                return <span key={i} className={level ? `is-${level}` : ''} />;
              })}
            </div>
          )}
          <input
            type="range"
            min={0}
            max={hours - 1}
            step={1}
            value={offset}
            onChange={(e) => onChange(start + Number(e.target.value) * 3600)}
            aria-label="Hora de la previsión"
            aria-valuetext={`${relativeDay(value)} ${formatHour(value)}`}
          />
          <div className="timebar__days" aria-hidden="true">
            {Array.from({ length: hours }, (_, i) => start + i * 3600)
              .filter((t) => new Date(t * 1000).getHours() === 0)
              .map((t) => (
                <span key={t} style={{ left: `${(((t - start) / 3600) / (hours - 1)) * 100}%` }}>
                  {relativeDay(t)}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
