import { useMemo } from 'react';
import { airspaceChecks, worstLevel, type Level } from '../logic/assessment';
import type { DroneProfile } from '../logic/drone';
import type { ZoneAnalysis } from '../logic/zoneAnalysis';
import type { Surroundings } from '../map/surroundings';

interface BadgeProps {
  analysis: ZoneAnalysis | null;
  loading: boolean;
  drone: DroneProfile;
  heightM: number;
  surroundings: Surroundings | null;
}

/** Punto de color en la pestaña «Zona» con el estado del espacio aéreo de la zona dibujada. */
export function AirspaceSummaryBadge({ analysis, loading, drone, heightM, surroundings }: BadgeProps) {
  const level = useMemo((): Level | null => {
    if (!analysis) return null;
    const enaireOk = Boolean(analysis.zones && !analysis.zones.unavailable);
    const summary = airspaceChecks(analysis.zones?.zones ?? null, analysis.aerodromes, enaireOk, {
      drone,
      heightM,
      groundElevationM: analysis.forecast?.elevation ?? null,
      surroundings,
    }, 'zone');
    return worstLevel(summary.checks);
  }, [analysis, drone, heightM, surroundings]);
  if (loading) return <span className="tab__badge tab__badge--loading" aria-label="Analizando" />;
  if (!level) return null;
  return <span className={`tab__badge tab__badge--${level}`} aria-label={`Espacio aéreo de la zona: ${level}`} />;
}
