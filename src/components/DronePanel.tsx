import { useMemo, useState, type ChangeEvent } from 'react';
import { BRANDS, DRONES, DRONE_BY_ID, type ClassLabel, type DroneModel } from '../data/drones';
import {
  CLASS_LABEL_TEXT,
  CUSTOM_PROFILE,
  openCategoryFor,
  profileFromModel,
  requirementsFor,
  windLimitFor,
  type DroneProfile,
} from '../logic/drone';
import { splitOperatorNumber, type PilotProfile } from '../logic/pilot';
import { msToKmh } from '../lib/wind';
import { Icon } from './Icon';
import { Notice, Section, Stat } from './ui';

const CUSTOM = '__custom__';
const CLASS_OPTIONS = Object.keys(CLASS_LABEL_TEXT) as ClassLabel[];

const fmt = (v: number | null | undefined, unit: string, digits = 0) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits).replace('.', ',')} ${unit}`;

interface DronePanelProps {
  /** `null` mientras no se haya elegido dron. */
  drone: DroneProfile | null;
  onChange(p: DroneProfile | null): void;
  pilot: PilotProfile;
  onPilot(p: PilotProfile): void;
  onClearData(): void;
}

function PilotSection({ pilot, onPilot }: { pilot: PilotProfile; onPilot(p: PilotProfile): void }) {
  const operator = splitOperatorNumber(pilot.pilotId);
  const set = (key: keyof PilotProfile) => (e: ChangeEvent<HTMLInputElement>) => onPilot({ ...pilot, [key]: e.target.value });
  return (
    <Section title="Tus datos de piloto">
      <div className="form-grid">
        <label className="field">
          <span>Nombre y apellidos</span>
          <input type="text" value={pilot.fullName} autoComplete="name" placeholder="p. ej. Lucía García Pérez" onChange={set('fullName')} />
        </label>
        <label className="field">
          <span>ID de piloto</span>
          <input
            type="text"
            value={pilot.pilotId}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Nº de operador (ESP…) o de certificado"
            onChange={set('pilotId')}
          />
        </label>
        {operator && (
          <Notice tone="warning">
            Los 3 caracteres tras el guion son la parte secreta del nº de operador: solo se cargan en la identificación a
            distancia del dron y no deben compartirse (no se incluyen en las solicitudes).{' '}
            <button type="button" className="link-button" onClick={() => onPilot({ ...pilot, pilotId: operator.publicPart })}>
              Quitarlos
            </button>
          </Notice>
        )}
        <label className="field">
          <span>Nº de serie del dron (SN)</span>
          <input
            type="text"
            value={pilot.droneSerial}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="En la etiqueta del dron, la caja o su app"
            onChange={set('droneSerial')}
          />
        </label>
      </div>
      <p className="small muted">
        Se guardan solo en este dispositivo y rellenan las solicitudes que envíes desde los avisos de cada zona.
      </p>
    </Section>
  );
}

function DroneDetails({ drone, model }: { drone: DroneProfile; model: DroneModel | undefined }) {
  const info = openCategoryFor(drone);
  const reqs = requirementsFor(drone);
  const limit = windLimitFor(drone);
  return (
    <>
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
    </>
  );
}

export function DronePanel({ drone, onChange, pilot, onPilot, onClearData }: DronePanelProps) {
  const model = drone?.modelId ? DRONE_BY_ID.get(drone.modelId) : undefined;
  const [brand, setBrand] = useState(model ? model.brand : drone ? CUSTOM : '');
  const models = useMemo(() => DRONES.filter((d) => d.brand === brand), [brand]);

  const selectBrand = (b: string) => {
    setBrand(b);
    if (b === CUSTOM) onChange({ ...CUSTOM_PROFILE, ...(drone && !drone.modelId ? drone : {}), modelId: null });
    else {
      // Con varios modelos se espera a que el usuario elija el suyo.
      const list = DRONES.filter((d) => d.brand === b);
      onChange(list.length === 1 ? profileFromModel(list[0]) : null);
    }
  };

  return (
    <div className="panel-body">
      <PilotSection pilot={pilot} onPilot={onPilot} />

      <Section title="Tu dron">
        <div className="form-grid">
          <label className="field">
            <span>Marca</span>
            <select value={brand} onChange={(e) => selectBrand(e.target.value)}>
              <option value="" disabled>
                Elige la marca…
              </option>
              {BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value={CUSTOM}>Otra marca / personalizado</option>
            </select>
          </label>
          {brand && brand !== CUSTOM && (
            <label className="field">
              <span>Modelo</span>
              <select
                value={drone?.modelId ?? ''}
                onChange={(e) => {
                  const m = DRONE_BY_ID.get(e.target.value);
                  onChange(m ? profileFromModel(m) : null);
                }}
              >
                <option value="" disabled>
                  Elige el modelo…
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.model}
                  </option>
                ))}
              </select>
            </label>
          )}
          {brand === CUSTOM && drone && (
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
          {drone && (
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
          )}
        </div>
        {model?.classNote && <p className="small muted">{model.classNote}</p>}
        {model && drone && model.classLabel !== drone.classLabel && (
          <p className="small muted">Has cambiado el marcado respecto al habitual del modelo ({CLASS_LABEL_TEXT[model.classLabel]}).</p>
        )}
        {!drone && (
          <p className="small muted">
            Elige la marca y el modelo (o «Otra marca / personalizado») para ver su categoría, los requisitos y el límite de viento
            con el que se evalúa el tiempo. Mientras tanto se usan límites prudentes de un dron ligero.
          </p>
        )}
      </Section>

      {drone && <DroneDetails drone={drone} model={model} />}

      <Section title="Datos guardados en este dispositivo">
        <p className="small">
          Dron-App no tiene cuentas ni servidor propio: tus datos de piloto, el dron elegido y tus preferencias del mapa se
          guardan solo en este navegador. Tus datos personales solo salen de él en los correos que tú decidas enviar.
        </p>
        <button type="button" className="button button--small button--danger" onClick={onClearData}>
          <Icon name="trash" size={16} /> Borrar mis datos
        </button>
      </Section>
    </div>
  );
}
