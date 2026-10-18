import { useEffect, useState } from 'react';

const PREFIX = 'dron-app:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const value = JSON.parse(raw) as T;
    // Fusiona objetos para tolerar claves nuevas añadidas en versiones posteriores.
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) && value && typeof value === 'object') {
      return { ...fallback, ...value };
    }
    return value;
  } catch {
    return fallback;
  }
}

/** `useState` que se guarda en localStorage (preferencias del usuario en este navegador). */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Navegación privada o almacenamiento lleno: se ignora.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
