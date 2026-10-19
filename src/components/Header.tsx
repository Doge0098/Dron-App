import type { PlaceResult } from '../services/geocode';
import { Icon } from './Icon';
import { SearchBox } from './SearchBox';

interface HeaderProps {
  droneLabel: string;
  /** Aún no se ha elegido dron: el botón invita a hacerlo. */
  droneMissing: boolean;
  onSearch(place: PlaceResult): void;
  onLocate(): void;
  locating: boolean;
  onHome(): void;
  onOpenDrone(): void;
}

export function Header({ droneLabel, droneMissing, onSearch, onLocate, locating, onHome, onOpenDrone }: HeaderProps) {
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
        <button
          className={`drone-chip${droneMissing ? ' drone-chip--missing' : ''}`}
          type="button"
          onClick={onOpenDrone}
          title={droneMissing ? 'Elige tu dron y añade tus datos de piloto' : 'Tus datos de piloto y tu dron'}
        >
          <Icon name="drone" size={18} />
          <span>{droneLabel}</span>
        </button>
      </div>
    </header>
  );
}
