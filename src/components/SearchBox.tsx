import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { isAbortError } from '../services/http';
import { searchPlaces, type PlaceResult } from '../services/geocode';
import { Icon } from './Icon';

export function SearchBox({ onSelect }: { onSelect(place: PlaceResult): void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchPlaces(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setError(r.length ? null : 'Sin resultados');
        })
        .catch((err) => {
          if (!isAbortError(err)) setError('No se pudo buscar ahora mismo');
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const choose = (place: PlaceResult) => {
    onSelect(place);
    setQuery(place.name);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && (results.length > 0 || error);
  return (
    <div className="search" ref={boxRef}>
      <Icon name="search" size={18} className="search__icon" />
      <input
        className="search__input"
        type="search"
        placeholder="Buscar lugar o coordenadas (40.41, -3.70)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Buscar lugar"
      />
      {loading && <span className="search__loading" aria-hidden="true" />}
      {showList && (
        <ul className="search__results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={`search__result${i === active ? ' is-active' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
            >
              <span className="search__name">{r.name}</span>
              {r.detail && <span className="search__detail">{r.detail}</span>}
            </li>
          ))}
          {!results.length && error && <li className="search__empty">{error}</li>}
        </ul>
      )}
    </div>
  );
}
