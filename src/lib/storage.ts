// Datos guardados en el navegador (localStorage): preferencias, dron elegido y datos del piloto.
// Nada de esto sale del dispositivo.

export const STORAGE_PREFIX = 'dron-app:';
const VERSION_KEY = `${STORAGE_PREFIX}version`;
/**
 * Versión del formato guardado. Cambiarla borra todo lo guardado por versiones anteriores (la 1 incluía
 * los datos de las pruebas), así que solo se sube cuando lo guardado deja de servir.
 */
export const STORAGE_VERSION = '2';

let locked = false;

function appKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Al arrancar: si lo guardado es de otra versión (o no hay nada), se empieza de cero. */
export function prepareStorage(): void {
  try {
    if (localStorage.getItem(VERSION_KEY) === STORAGE_VERSION) return;
    for (const key of appKeys(localStorage)) localStorage.removeItem(key);
    localStorage.setItem(VERSION_KEY, STORAGE_VERSION);
  } catch {
    // Sin almacenamiento disponible (navegación privada estricta): no hay nada que limpiar.
  }
}

/** Borra todo lo que la app guarda en este navegador y bloquea nuevas escrituras hasta recargar. */
export function clearAppData(): void {
  locked = true;
  try {
    for (const key of appKeys(localStorage)) localStorage.removeItem(key);
  } catch {
    // Ídem.
  }
}

export function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function writeStored(key: string, value: unknown): void {
  if (locked) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Navegación privada o almacenamiento lleno: se ignora.
  }
}
