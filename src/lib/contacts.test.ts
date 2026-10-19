import { describe, expect, it } from 'vitest';
import {
  contactName,
  extractContacts,
  formatPhone,
  mailtoHref,
  normalizeSpanishPhone,
  normalizeWeb,
  parsePhoneField,
  webLabel,
} from './contacts';

describe('contacts', () => {
  it('normaliza teléfonos españoles a E.164', () => {
    expect(normalizeSpanishPhone('913 21 33 63')).toBe('+34913213363');
    expect(normalizeSpanishPhone('+34 913-213-363')).toBe('+34913213363');
    expect(normalizeSpanishPhone('0034 600123456')).toBe('+34600123456');
    expect(normalizeSpanishPhone('123456789')).toBeNull();
    expect(normalizeSpanishPhone('91321336')).toBeNull();
    expect(formatPhone('+34913213363')).toBe('913 21 33 63');
    expect(formatPhone('+351211234567')).toBe('+351211234567');
  });

  it('encuentra teléfonos, correos y webs en los textos de ENAIRE', () => {
    const found = extractContacts(
      'Coordinar con la torre: Tel. 944 86 96 63 o 91 321 33 63. Correo: Torre.LEBB@enaire.es. Info en www.enaire.es/drones.',
      'Teléfono (+34) 600 123 456; también torre.lebb@enaire.es',
    );
    expect(found.phones).toEqual(['+34944869663', '+34913213363', '+34600123456']);
    expect(found.emails).toEqual(['torre.lebb@enaire.es']);
    expect(found.urls).toEqual(['https://www.enaire.es/drones']);
  });

  it('no confunde con teléfonos las listas de días, horas o coordenadas', () => {
    const notam = 'D) 9 10 11 12 13 0800-1400. E) AREA 401230N0034512W RADIO 2NM SFC-600FT AMSL. NOTAM B1234/26 2610180800';
    expect(extractContacts(notam).phones).toEqual([]);
    // Las cifras de un correo tampoco cuentan como teléfono.
    expect(extractContacts('uas913213363@ejemplo.es').phones).toEqual([]);
  });

  it('lee los campos dedicados de teléfono y web', () => {
    expect(parsePhoneField('913213363 / 600 12 34 56')).toEqual(['+34913213363', '+34600123456']);
    expect(parsePhoneField('+351 21 123 4567')).toEqual(['+351211234567']);
    expect(parsePhoneField('sin teléfono')).toEqual([]);
    expect(normalizeWeb('planea.enaire.es')).toBe('https://planea.enaire.es');
    expect(normalizeWeb('https://www.aena.es/es')).toBe('https://www.aena.es/es');
    expect(normalizeWeb('consultar en la oficina')).toBeNull();
    expect(webLabel('https://www.aena.es/es/corporativa')).toBe('aena.es');
  });

  it('se queda con el nombre de la entidad', () => {
    expect(contactName('Contacto: Torre de control de Bilbao, tel. 944 86 96 63, torre@enaire.es')).toBe(
      'Torre de control de Bilbao',
    );
    expect(contactName('Hotel Miramar')).toBe('Hotel Miramar');
    expect(contactName('Aeropuerto de Bilbao · Oficina UAS')).toBe('Aeropuerto de Bilbao · Oficina UAS');
    expect(contactName('Oficina de operaciones (tel. 944869663)')).toBe('Oficina de operaciones');
    expect(contactName('Torre de control (LEBB) - 944 86 96 63')).toBe('Torre de control (LEBB)');
  });

  it('crea enlaces mailto: con asunto y cuerpo codificados', () => {
    expect(mailtoHref('cop@enaire.es')).toBe('mailto:cop@enaire.es');
    expect(mailtoHref('cop@enaire.es', 'Vuelo & fotos', 'Hola\nAdiós')).toBe(
      'mailto:cop@enaire.es?subject=Vuelo%20%26%20fotos&body=Hola%0D%0AAdi%C3%B3s',
    );
  });
});
