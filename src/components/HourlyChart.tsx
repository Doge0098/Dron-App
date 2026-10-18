import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Level } from '../logic/assessment';
import { formatHour, relativeDay } from '../lib/time';
import { msToKmh } from '../lib/wind';
import type { PointForecast, WindHeight } from '../services/openMeteo';

interface HourlyChartProps {
  forecast: PointForecast;
  from: number;
  hours: number;
  height: WindHeight;
  limitMs: number;
  levels: { time: number; level: Level }[];
  selected: number;
  onSelect(time: number): void;
}

const LEVEL_COLOR: Record<Level, string> = { ok: 'var(--ok)', caution: 'var(--caution)', no: 'var(--no)' };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function HourlyChart({ forecast, from, hours, height, limitMs, levels, selected, onSelect }: HourlyChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 196;
  const pad = { l: 34, r: 8, t: 10 };
  const windH = 112;
  const precipTop = pad.t + windH + 8;
  const precipH = 24;
  const levelTop = precipTop + precipH + 6;
  const levelH = 10;
  const axisTop = levelTop + levelH + 4;

  const data = useMemo(() => {
    const h = forecast.hourly;
    const idx: number[] = [];
    h.time.forEach((t, i) => {
      if (t >= from && t < from + hours * 3600) idx.push(i);
    });
    return idx.map((i) => ({
      time: h.time[i],
      w10: msToKmh(h.wind[10].speed[i]),
      wH: msToKmh(h.wind[height].speed[i]),
      gust: msToKmh(h.gusts[i]),
      precip: h.precipitation[i],
    }));
  }, [forecast, from, hours, height]);

  if (data.length < 2) return null;
  const innerW = width - pad.l - pad.r;
  const x = (k: number) => pad.l + (k / (data.length - 1)) * innerW;
  const limitKmh = msToKmh(limitMs);
  const maxY = Math.max(limitKmh * 1.15, ...data.map((d) => (Number.isFinite(d.gust) ? d.gust : 0)), 20);
  const y = (v: number) => pad.t + windH - (Math.max(0, v) / maxY) * windH;
  const path = (key: 'w10' | 'wH' | 'gust') =>
    data
      .map((d, k) => (Number.isFinite(d[key]) ? `${k === 0 || !Number.isFinite(data[k - 1][key]) ? 'M' : 'L'}${x(k).toFixed(1)},${y(d[key]).toFixed(1)}` : ''))
      .join('');
  const maxPrecip = Math.max(2, ...data.map((d) => (Number.isFinite(d.precip) ? d.precip : 0)));
  const barW = Math.max(1, innerW / data.length - 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxY * f) / 5) * 5);
  const selectedK = data.findIndex((d) => d.time === selected);
  const levelByTime = new Map(levels.map((l) => [l.time, l.level]));

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - rect.left - pad.l) / innerW) * (data.length - 1));
    const d = data[Math.max(0, Math.min(data.length - 1, k))];
    if (d) onSelect(d.time);
  };

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`Viento previsto en las próximas ${hours} horas frente al límite del dron`}
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons === 1 && pick(e)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
            <text className="chart__tick" x={pad.l - 6} y={y(t) + 3.5} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text className="chart__unit" x={4} y={pad.t + 4}>
          km/h
        </text>
        <line className="chart__limit" x1={pad.l} x2={width - pad.r} y1={y(limitKmh)} y2={y(limitKmh)} />
        <text className="chart__limit-label" x={width - pad.r - 2} y={y(limitKmh) - 4} textAnchor="end">
          límite del dron
        </text>
        <path className="chart__line chart__line--gust" d={path('gust')} />
        <path className="chart__line chart__line--w10" d={path('w10')} />
        {height !== 10 && <path className="chart__line chart__line--wh" d={path('wH')} />}

        {data.map((d, k) =>
          Number.isFinite(d.precip) && d.precip > 0 ? (
            <rect
              key={`p${d.time}`}
              className="chart__precip"
              x={x(k) - barW / 2}
              width={barW}
              y={precipTop + precipH - (d.precip / maxPrecip) * precipH}
              height={(d.precip / maxPrecip) * precipH}
            />
          ) : null,
        )}
        <text className="chart__tick" x={pad.l - 6} y={precipTop + precipH - 2} textAnchor="end">
          mm
        </text>
        {data.map((d, k) => {
          const level = levelByTime.get(d.time);
          return level ? (
            <rect
              key={`l${d.time}`}
              x={x(k) - innerW / data.length / 2}
              width={innerW / data.length + 0.5}
              y={levelTop}
              height={levelH}
              fill={LEVEL_COLOR[level]}
              opacity={0.85}
            />
          ) : null;
        })}
        {data.map((d, k) => {
          const date = new Date(d.time * 1000);
          if (date.getHours() % 6 !== 0) return null;
          const midnight = date.getHours() === 0;
          return (
            <g key={`a${d.time}`}>
              <line className={midnight ? 'chart__day' : 'chart__grid'} x1={x(k)} x2={x(k)} y1={pad.t} y2={levelTop + levelH} />
              <text className="chart__tick" x={x(k)} y={axisTop + 9} textAnchor="middle">
                {midnight ? relativeDay(d.time) : formatHour(d.time).slice(0, 2) + 'h'}
              </text>
            </g>
          );
        })}
        {selectedK >= 0 && (
          <g>
            <line className="chart__cursor" x1={x(selectedK)} x2={x(selectedK)} y1={pad.t} y2={levelTop + levelH} />
            {Number.isFinite(data[selectedK].wH) && <circle className="chart__dot" cx={x(selectedK)} cy={y(data[selectedK].wH)} r={3.5} />}
          </g>
        )}
      </svg>
      <div className="chart__legend">
        <span className="chart__key chart__key--w10">Viento 10 m</span>
        {height !== 10 && <span className="chart__key chart__key--wh">Viento {height} m</span>}
        <span className="chart__key chart__key--gust">Rachas</span>
        <span className="chart__key chart__key--precip">Precipitación</span>
      </div>
    </div>
  );
}
