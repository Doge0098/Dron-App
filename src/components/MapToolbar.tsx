import { useEffect, useRef, useState } from 'react';
import type { DrawMode } from '../map/DrawController';
import type { WindHeight } from '../services/openMeteo';
import { WIND_HEIGHTS } from '../services/openMeteo';
import type { Basemap, LayerToggles } from '../types';
import { Icon, type IconName } from './Icon';

export const DRAW_TOOLS: { mode: DrawMode; icon: IconName; label: string; hint: string }[] = [
  { mode: 'freehand', icon: 'pen', label: 'Mano alzada', hint: 'Mantén pulsado y dibuja el contorno de la zona; suelta para terminar.' },
  { mode: 'polygon', icon: 'polygon', label: 'Polígono', hint: 'Pulsa para añadir vértices. Doble clic, Intro o «Terminar» para cerrar.' },
  { mode: 'rectangle', icon: 'rectangle', label: 'Rectángulo', hint: 'Arrastra de una esquina a la opuesta.' },
  { mode: 'circle', icon: 'circle', label: 'Círculo', hint: 'Arrastra desde el centro hasta el radio deseado.' },
];

const LAYER_LABELS: { key: keyof LayerToggles; label: string; group: string }[] = [
  { key: 'wind', label: 'Viento animado (partículas)', group: 'Meteorología' },
  { key: 'arrows', label: 'Flechas de viento', group: 'Meteorología' },
  { key: 'rain', label: 'Lluvia y nieve previstas (animación)', group: 'Meteorología' },
  { key: 'radar', label: 'Radar de lluvia real (últimas 2 h)', group: 'Meteorología' },
  { key: 'zones', label: 'Zonas UAS oficiales (ENAIRE)', group: 'Espacio aéreo' },
  { key: 'aerodromes', label: 'Aeródromos y helipuertos', group: 'Espacio aéreo' },
  { key: 'terrain', label: 'Relieve 3D', group: 'Mapa 3D' },
  { key: 'buildings', label: 'Edificios 3D', group: 'Mapa 3D' },
];

interface MapToolbarProps {
  drawMode: DrawMode | null;
  drawVertices: number;
  hasZone: boolean;
  onDrawMode(mode: DrawMode | null): void;
  onFinish(): void;
  onUndo(): void;
  onClearZone(): void;
  layers: LayerToggles;
  onLayers(layers: LayerToggles): void;
  basemap: Basemap;
  onBasemap(b: Basemap): void;
  windHeight: WindHeight;
  onWindHeight(h: WindHeight): void;
}

export function MapToolbar(props: MapToolbarProps) {
  const { drawMode, drawVertices, hasZone, onDrawMode, onFinish, onUndo, onClearZone } = props;
  const [layersOpen, setLayersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tool = DRAW_TOOLS.find((t) => t.mode === drawMode);

  useEffect(() => {
    if (!layersOpen) return;
    const close = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setLayersOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [layersOpen]);

  return (
    <div className="toolbar">
      <div className="toolbar__group" role="toolbar" aria-label="Dibujar zona">
        <span className="toolbar__label">Dibujar zona</span>
        {DRAW_TOOLS.map((t) => (
          <button
            key={t.mode}
            type="button"
            className={`tool-button${drawMode === t.mode ? ' is-active' : ''}`}
            onClick={() => onDrawMode(drawMode === t.mode ? null : t.mode)}
            title={t.label}
            aria-pressed={drawMode === t.mode}
          >
            <Icon name={t.icon} />
            <span className="tool-button__text">{t.label}</span>
          </button>
        ))}
        {hasZone && !drawMode && (
          <button type="button" className="tool-button tool-button--danger" onClick={onClearZone} title="Borrar zona">
            <Icon name="trash" />
            <span className="tool-button__text">Borrar</span>
          </button>
        )}
      </div>

      <div className="toolbar__group toolbar__group--layers" ref={panelRef}>
        <button
          type="button"
          className={`tool-button${layersOpen ? ' is-active' : ''}`}
          onClick={() => setLayersOpen((o) => !o)}
          aria-expanded={layersOpen}
          title="Capas del mapa"
        >
          <Icon name="layers" />
          <span className="tool-button__text">Capas</span>
        </button>
        {layersOpen && <LayerPanel {...props} />}
      </div>

      {tool && (
        <div className="draw-hint" role="status">
          <p>
            <strong>{tool.label}:</strong> {tool.hint}
          </p>
          <div className="draw-hint__actions">
            {drawMode === 'polygon' && (
              <>
                <button type="button" className="button button--small" onClick={onUndo} disabled={drawVertices === 0}>
                  <Icon name="undo" size={16} /> Deshacer
                </button>
                <button type="button" className="button button--small button--primary" onClick={onFinish} disabled={drawVertices < 3}>
                  <Icon name="check" size={16} /> Terminar ({drawVertices})
                </button>
              </>
            )}
            <button type="button" className="button button--small" onClick={() => onDrawMode(null)}>
              <Icon name="close" size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerPanel({ layers, onLayers, basemap, onBasemap, windHeight, onWindHeight }: MapToolbarProps) {
  const groups = [...new Set(LAYER_LABELS.map((l) => l.group))];
  return (
    <div className="layer-panel" role="dialog" aria-label="Capas del mapa">
      <fieldset className="segmented">
        <legend>Mapa base</legend>
        {(
          [
            ['vector', 'Mapa'],
            ['satellite', 'Satélite PNOA'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={basemap === value ? 'is-active' : ''}>
            <input type="radio" name="basemap" value={value} checked={basemap === value} onChange={() => onBasemap(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="segmented">
        <legend>Altura de vuelo (viento y restricciones)</legend>
        {WIND_HEIGHTS.map((h) => (
          <label key={h} className={windHeight === h ? 'is-active' : ''}>
            <input type="radio" name="wind-height" value={h} checked={windHeight === h} onChange={() => onWindHeight(h)} />
            {h} m
          </label>
        ))}
      </fieldset>
      {groups.map((g) => (
        <fieldset key={g} className="layer-panel__group">
          <legend>{g}</legend>
          {LAYER_LABELS.filter((l) => l.group === g).map((l) => (
            <label key={l.key} className="switch">
              <input type="checkbox" checked={layers[l.key]} onChange={(e) => onLayers({ ...layers, [l.key]: e.target.checked })} />
              <span className="switch__track" aria-hidden="true" />
              {l.label}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
