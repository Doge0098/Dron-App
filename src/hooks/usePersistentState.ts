import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../lib/storage';

function read<T>(key: string, fallback: T): T {
  const value = readStored(key);
  if (value === undefined) return fallback;
  // Fusiona objetos para tolerar claves nuevas añadidas en versiones posteriores.
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback) && value && typeof value === 'object') {
    return { ...fallback, ...value };
  }
  return value as T;
}

/** `useState` que se guarda en localStorage (preferencias del usuario en este navegador). */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => writeStored(key, value), [key, value]);
  return [value, setValue] as const;
}
