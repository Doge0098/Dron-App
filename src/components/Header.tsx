import type { PlaceResult } from '../services/geocode';
import { Icon } from './Icon';
import { SearchBox } from './SearchBox';

interface HeaderProps {
  droneLabel: string;
  onSearch(place: PlaceResult): void;
  onLocate(): void;
  locating: boolean;
  onHome(): void;
  onOpenDrone(): void;
}

export function Header({ droneLabel, onSearch, onLocate, locating, onHome, onOpenDrone }: HeaderProps) {
  return (
    <header className="header">
      <button className="brand" type="button" onClick={onHome} title="Ver toda España">
        <span className="brand__logo" aria-hidden="true">
          <Icon name="drone" size={22} />
        </span>
        <span className="brand__text">
          <strong>Dron-App</strong>
          <small>Clima y normativa para volar en España</small>
        </span>
      </button>
      <SearchBox onSelect={onSearch} />
      <div className="header__actions">
        <button className={`icon-button${locating ? ' is-busy' : ''}`} type="button" onClick={onLocate} title="Usar mi ubicación">
          <Icon name="locate" />
          <span className="sr-only">Usar mi ubicación</span>
        </button>
        <button className="drone-chip" type="button" onClick={onOpenDrone} title="Cambiar de dron">
          <Icon name="drone" size={18} />
          <span>{droneLabel}</span>
        </button>
      </div>
    </header>
  );
}
