import type { ReactNode } from 'react';
import { LEVEL_LABEL, type Check, type CheckLevel, type Level } from '../logic/assessment';
import { Icon } from './Icon';

export function LevelPill({ level, children, large }: { level: Level; children?: ReactNode; large?: boolean }) {
  return (
    <span className={`level-pill level-pill--${level}${large ? ' level-pill--large' : ''}`}>
      <span className="level-pill__dot" aria-hidden="true" />
      {children ?? LEVEL_LABEL[level]}
    </span>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section__header">
        <h3 className="section__title">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

const CHECK_ICON: Record<CheckLevel, string> = { ok: '✓', caution: '!', no: '✕', info: 'i' };

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="checks">
      {checks.map((c) => (
        <li key={c.id} className={`check check--${c.level}`}>
          <span className="check__icon" aria-hidden="true">
            {CHECK_ICON[c.level]}
          </span>
          <div className="check__body">
            <div className="check__row">
              <span className="check__label">{c.label}</span>
              <span className="check__value">{c.value}</span>
            </div>
            <p className="check__detail">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <span className="spinner__ring" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error'; children: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name="alert" size={16} />
      <div>{children}</div>
    </div>
  );
}

/** Flecha que apunta hacia donde sopla el viento (dirección meteorológica + 180°). */
export function WindArrow({ dirFrom, size = 18, animated }: { dirFrom: number; size?: number; animated?: boolean }) {
  if (!Number.isFinite(dirFrom)) return <span className="wind-arrow wind-arrow--none">—</span>;
  return (
    <span
      className={`wind-arrow${animated ? ' wind-arrow--animated' : ''}`}
      style={{ transform: `rotate(${(dirFrom + 180) % 360}deg)`, width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path d="M12 2l6 8h-4v12h-4V10H6z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="external-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <Icon name="external" size={14} />
    </a>
  );
}
