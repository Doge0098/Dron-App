// Catálogo de drones con los datos del fabricante (masa, resistencia al viento, protección IP…)
// y el marcado de clase UE según el registro de EASA. Fuentes por modelo en `sources`.

import catalog from './drones.json';

export type ClassLabel = 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'legacy' | 'privateBuilt';
export type DroneCategory = 'consumer' | 'fpv' | 'professional' | 'enterprise' | 'toy';

export interface DroneModel {
  id: string;
  brand: string;
  model: string;
  massG: number;
  classLabel: ClassLabel;
  /** Matices del marcado (variantes, actualizaciones de firmware, baterías Plus…). */
  classNote: string;
  /** Resistencia máxima al viento declarada por el fabricante (m/s). */
  maxWindMs: number | null;
  maxSpeedMs: number | null;
  flightTimeMin: number | null;
  ipRating: string | null;
  minTempC: number | null;
  maxTempC: number | null;
  camera: boolean;
  remoteId: boolean | null;
  category: DroneCategory;
  notes: string;
  sources: string[];
}

export const DRONES = catalog.drones as DroneModel[];
export const DRONES_SOURCE = catalog.source;

export const BRANDS = [...new Set(DRONES.map((d) => d.brand))];

export const DRONE_BY_ID = new Map(DRONES.map((d) => [d.id, d]));
