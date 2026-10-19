import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

describe('storage', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('una instalación nueva o de una versión anterior empieza de cero', async () => {
    storage.setItem('dron-app:drone', JSON.stringify({ modelId: 'dji-mini-4-pro' }));
    storage.setItem('dron-app:disclaimer-v1', 'true');
    storage.setItem('otra-app:dato', 'se conserva');
    const { STORAGE_VERSION, prepareStorage, readStored } = await import('./storage');
    prepareStorage();
    expect(readStored('drone')).toBeUndefined();
    expect(readStored('disclaimer-v1')).toBeUndefined();
    expect(storage.getItem('otra-app:dato')).toBe('se conserva');
    expect(storage.getItem('dron-app:version')).toBe(STORAGE_VERSION);
  });

  it('con la versión actual conserva los datos', async () => {
    const { STORAGE_VERSION, prepareStorage, readStored, writeStored } = await import('./storage');
    storage.setItem('dron-app:version', STORAGE_VERSION);
    writeStored('pilot', { fullName: 'Lucía' });
    prepareStorage();
    expect(readStored('pilot')).toEqual({ fullName: 'Lucía' });
  });

  it('«Borrar mis datos» lo elimina todo y no deja volver a escribir', async () => {
    const { clearAppData, readStored, writeStored } = await import('./storage');
    writeStored('pilot', { fullName: 'Lucía' });
    writeStored('layers', { wind: true });
    clearAppData();
    writeStored('pilot', { fullName: 'Lucía' });
    expect(readStored('pilot')).toBeUndefined();
    expect(readStored('layers')).toBeUndefined();
    expect(storage.length).toBe(0);
  });
});
