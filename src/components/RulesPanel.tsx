import {
  CHECKLIST,
  DEADLINES,
  GENERAL_RULES,
  LEGAL_FRAMEWORK,
  OFFICIAL_LINKS,
  SANCTIONS,
  ZONE_RULES,
  type RuleItem,
} from '../data/regulations';
import { openCategoryFor, type DroneProfile } from '../logic/drone';
import { ExternalLink, Section } from './ui';

function Rules({ items }: { items: RuleItem[] }) {
  return (
    <ul className="rules">
      {items.map((r) => (
        <li key={r.title} className="rule">
          <strong>{r.title}</strong>
          <p>{r.text}</p>
          {r.source && (
            <p className="rule__source">
              <ExternalLink href={r.source.url}>{r.source.label}</ExternalLink>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RulesPanel({ drone }: { drone: DroneProfile }) {
  const info = openCategoryFor(drone);
  return (
    <div className="panel-body">
      <Section title="Tu caso">
        <div className={`category-card${info.open ? '' : ' category-card--closed'}`}>
          <strong className="category-card__headline">
            {drone.brand} {drone.model}: {info.headline}
          </strong>
          <p>{info.peopleRule}</p>
          <p className="small">
            <strong>Formación:</strong> {info.competency}
          </p>
        </div>
      </Section>

      <Section title="Reglas básicas de la categoría abierta">
        <Rules items={GENERAL_RULES} />
      </Section>

      <Section title="Dónde hay restricciones">
        <Rules items={ZONE_RULES} />
      </Section>

      <Section title="Plazos de los trámites">
        <table className="deadlines">
          <tbody>
            {DEADLINES.map((d) => (
              <tr key={d.procedure}>
                <th scope="row">{d.procedure}</th>
                <td>{d.notice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Lista de comprobación antes de despegar">
        <ol className="checklist">
          {CHECKLIST.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
      </Section>

      <Section title="Sanciones">
        <Rules items={SANCTIONS} />
      </Section>

      <Section title="Marco legal">
        <Rules items={LEGAL_FRAMEWORK} />
      </Section>

      <Section title="Enlaces oficiales">
        <ul className="links">
          {OFFICIAL_LINKS.map((l) => (
            <li key={l.url}>
              <ExternalLink href={l.url}>{l.label}</ExternalLink>
              <span className="small muted">{l.description}</span>
            </li>
          ))}
        </ul>
      </Section>
      <p className="small muted">
        Resumen divulgativo, no asesoramiento jurídico. Si la normativa cambia, prevalece siempre la publicada en el BOE, AESA y ENAIRE.
      </p>
    </div>
  );
}
