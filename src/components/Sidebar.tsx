import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type TabKey = 'drone' | 'place' | 'zone' | 'rules';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'drone', label: 'Piloto', icon: 'user' },
  { key: 'place', label: 'Lugar', icon: 'pin' },
  { key: 'zone', label: 'Zona', icon: 'shape' },
  { key: 'rules', label: 'Normativa', icon: 'book' },
];

interface SidebarProps {
  tab: TabKey;
  onTab(tab: TabKey): void;
  open: boolean;
  onToggle(): void;
  badges?: Partial<Record<TabKey, ReactNode>>;
  children: ReactNode;
}

export function Sidebar({ tab, onTab, open, onToggle, badges, children }: SidebarProps) {
  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Panel de información">
      <div className="sidebar__bar">
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="sidebar-panel"
              className={`tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => {
                onTab(t.key);
                if (!open || tab === t.key) onToggle();
              }}
            >
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
              {badges?.[t.key]}
            </button>
          ))}
        </nav>
        <button type="button" className="sidebar__toggle" onClick={onToggle} aria-expanded={open} title={open ? 'Ocultar panel' : 'Mostrar panel'}>
          <Icon name="chevron" size={18} />
          <span className="sr-only">{open ? 'Ocultar panel' : 'Mostrar panel'}</span>
        </button>
      </div>
      <div className="sidebar__content" id="sidebar-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} hidden={!open}>
        {children}
      </div>
    </aside>
  );
}
