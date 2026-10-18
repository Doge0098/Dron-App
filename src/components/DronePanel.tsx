import { useMemo, useState } from 'react';
import { BRANDS, DRONES, DRONE_BY_ID, type ClassLabel } from '../data/drones';
import {
  CLASS_LABEL_TEXT,
  CUSTOM_PROFILE,
  openCategoryFor,
  profileFromModel,
  requirementsFor,
  windLimitFor,
  type DroneProfile,
} from '../logic/drone';
import { msToKmh } from '../lib/wind';
import { Notice, Section, Stat } from './ui';

const CUSTOM = '__custom__';
const CLASS_OPTIONS = Object.keys(CLASS_LABEL_TEXT) as ClassLabel[];

const fmt = (v: number | null | undefined, unit: string, digits = 0) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits).replace('.', ',')} ${unit}`;

export function DronePanel({ drone, onChange }: { drone: DroneProfile; onChange(p: DroneProfile): void }) {
  const model = drone.modelId ? DRONE_BY_ID.get(drone.modelId) : undefined;
  const [brand, setBrand] = useState(model ? model.brand : CUSTOM);
  const models = useMemo(() => DRONES.filter((d) => d.brand === brand), [brand]);
  const info = openCategoryFor(drone);
  const reqs = requirementsFor(drone);
  const limit = windLimitFor(drone);

  const selectBrand = (b: string) => {
    setBrand(b);
    if (b === CUSTOM) onChange({ ...CUSTOM_PROFILE, ...(drone.modelId ? {} : drone), modelId: null });
    else {
      const first = DRONES.find((d) => d.brand === b);
      if (first) onChange(profileFromModel(first));
    }
  };

  return (
    <div className="panel-body">
      <Section title="Tu dron">
        <div className="form-grid">
          <label className="field">
            <span>Marca</span>
            <select value={brand} onChange={(e) => selectBrand(e.target.value)}>
              {BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value={CUSTOM}>Otra marca / personalizado</option>
            </select>
          </label>
          {brand !== CUSTOM ? (
            <label className="field">
              <span>Modelo</span>
              <select
                value={drone.modelId ?? ''}
                onChange={(e) => {
                  const m = DRONE_BY_ID.get(e.target.value);
                  if (m) onChange(profileFromModel(m));
                }}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.model}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                <span>Fabricante</span>
                <input
                  type="text"
                  value={drone.brand === 'Otro' ? '' : drone.brand}
                  placeholder="p. ej. Holy Stone"
                  onChange={(e) => onChange({ ...drone, brand: e.target.value || 'Otro' })}
                />
              </label>
              <label className="field">
                <span>Modelo</span>
                <input
                  type="text"
                  value={drone.model}
                  placeholder="p. ej. HS175D"
                  onChange={(e) => onChange({ ...drone, model: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Masa al despegue (g)</span>
                <input
                  type="number"
                  min={1}
                  max={150000}
                  value={drone.massG}
                  onChange={(e) => onChange({ ...drone, massG: Math.max(1, Number(e.target.value) || 0) })}
                />
              </label>
              <label className="field">
                <span>Resistencia al viento (km/h)</span>
                <input
                  type="number"
                  min={0}
                  max={150}
                  placeholder="desconocida"
                  value={drone.maxWindMs ? Math.round(msToKmh(drone.maxWindMs)) : ''}
                  onChange={(e) => {
                    const kmh = Number(e.target.value);
                    onChange({ ...drone, maxWindMs: kmh > 0 ? kmh / 3.6 : null });
                  }}
                />
              </label>
              <label className="field">
                <span>Protección IP</span>
                <input
                  type="text"
                  placeholder="p. ej. IP55 (vacío si no tiene)"
                  value={drone.ipRating ?? ''}
                  onChange={(e) => onChange({ ...drone, ipRating: e.target.value.trim() || null })}
                />
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={drone.camera} onChange={(e) => onChange({ ...drone, camera: e.target.checked })} />
                Lleva cámara o sensores que captan datos personales
              </label>
            </>
          )}
          <label className="field">
            <span>Marcado de clase de tu unidad</span>
            <select value={drone.classLabel} onChange={(e) => onChange({ ...drone, classLabel: e.target.value as ClassLabel })}>
              {CLASS_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CLASS_LABEL_TEXT[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {model?.classNote && <p className="small muted">{model.classNote}</p>}
        {model && model.classLabel !== drone.classLabel && (
          <p className="small muted">Has cambiado el marcado respecto al habitual del modelo ({CLASS_LABEL_TEXT[model.classLabel]}).</p>
        )}
      </Section>

      <Section title="Especificaciones">
        <div className="stats">
          <Stat label="Masa" value={fmt(drone.massG, 'g', Number.isInteger(drone.massG) ? 0 : 1)} />
          <Stat
            label="Resiste viento"
            value={`${Math.round(msToKmh(limit.limit))} km/h`}
            hint={limit.estimated ? 'estimado' : `${limit.limit.toFixed(1).replace('.', ',')} m/s`}
          />
          <Stat label="Protección" value={drone.ipRating ?? 'Sin IP'} />
          <Stat
            label="Temperatura"
            value={drone.minTempC != null && drone.maxTempC != null ? `${drone.minTempC} a ${drone.maxTempC} °C` : '—'}
          />
          {model && <Stat label="Autonomía" value={fmt(model.flightTimeMin, 'min')} />}
          {model && <Stat label="Velocidad máx." value={model.maxSpeedMs ? `${Math.round(msToKmh(model.maxSpeedMs))} km/h` : '—'} />}
        </div>
        {model?.notes && <p className="small">{model.notes}</p>}
        {model?.sources.length ? (
          <p className="small muted">
            Fuente:{' '}
            {model.sources.slice(0, 2).map((s, i) => (
              <span key={s}>
                {i > 0 && ' · '}
                <a href={s} target="_blank" rel="noopener noreferrer">
                  {new URL(s).hostname.replace(/^www\./, '')}
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </Section>

      <Section title="Qué puedes hacer con él">
        <div className={`category-card${info.open ? '' : ' category-card--closed'}`}>
          <strong className="category-card__headline">{info.headline}</strong>
          <p>{info.peopleRule}</p>
          <p className="small">
            <strong>Formación:</strong> {info.competency}
          </p>
        </div>
        {info.warnings.map((w) => (
          <Notice key={w} tone="warning">
            {w}
          </Notice>
        ))}
      </Section>

      <Section title="Requisitos">
        <ul className="requirements">
          {reqs.map((r) => (
            <li key={r.id} className={`requirement requirement--${r.status}`}>
              <span className="requirement__status">
                {r.status === 'required' ? 'Obligatorio' : r.status === 'recommended' ? 'Recomendado' : 'No necesario'}
              </span>
              <strong>{r.title}</strong>
              <p>{r.detail}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
