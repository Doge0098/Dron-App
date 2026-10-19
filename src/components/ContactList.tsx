import { useEffect, useState } from 'react';
import { formatPhone, mailtoHref, telHref, webLabel, type ContactInfo } from '../lib/contacts';
import { draftAsText, type MailDraft } from '../logic/contactRequest';
import { Icon } from './Icon';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sin permiso de portapapeles (o sin HTTPS): copia mediante una selección temporal.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function ContactCard({ contact, draft }: { contact: ContactInfo; draft?: MailDraft }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const id = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);
  const labels = contact.phones.map((p) => p.label).filter(Boolean);
  const email = contact.emails[0];

  return (
    <div className={`contact contact--${contact.source}`}>
      <p className="contact__name">
        {contact.name}
        <span className="contact__source">{contact.source === 'zone' ? 'publicado para esta zona' : 'contacto oficial'}</span>
      </p>
      <div className="contact__links">
        {contact.phones.map((p) => (
          <a key={p.number} className="contact__link" href={telHref(p.number)} title={p.label ? `Llamar · ${p.label}` : 'Llamar'}>
            <Icon name="phone" size={15} />
            {formatPhone(p.number)}
          </a>
        ))}
        {contact.emails.map((e) => (
          <a key={e} className="contact__link" href={mailtoHref(e, draft?.subject, draft?.body)} title="Escribir un correo con tus datos ya rellenos">
            <Icon name="mail" size={15} />
            {e}
          </a>
        ))}
        {contact.web && (
          <a className="contact__link" href={contact.web} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={15} />
            {webLabel(contact.web)}
          </a>
        )}
      </div>
      {labels.length > 0 && <p className="contact__hint">Teléfono: {labels.join(' · ')}</p>}
      {contact.note && <p className="contact__hint">{contact.note}</p>}
      {email && draft && (
        <button type="button" className="link-button contact__copy" onClick={() => void copyText(draftAsText(email, draft)).then(setCopied)}>
          <Icon name="copy" size={14} />
          {copied === true ? 'Solicitud copiada' : copied === false ? 'No se pudo copiar' : 'Copiar la solicitud para tu correo web'}
        </button>
      )}
    </div>
  );
}

/** Teléfonos, correos y webs de las entidades responsables de una restricción. */
export function ContactList({ contacts, draft }: { contacts: ContactInfo[]; draft?: MailDraft }) {
  if (!contacts.length) return null;
  return (
    <div className="contacts">
      <span className="contacts__title">Contactar con el responsable</span>
      {contacts.map((c) => (
        <ContactCard key={`${c.source}:${c.name}`} contact={c} draft={draft} />
      ))}
    </div>
  );
}
