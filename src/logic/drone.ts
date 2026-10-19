// Clasificación del dron en la categoría abierta (Reglamento (UE) 2019/947) y requisitos asociados.

import type { ClassLabel, DroneModel } from '../data/drones';

export interface DroneProfile {
  /** Modelo del catálogo, o `null` si el usuario lo ha definido a mano. */
  modelId: string | null;
  brand: string;
  model: string;
  massG: number;
  classLabel: ClassLabel;
  maxWindMs: number | null;
  ipRating: string | null;
  minTempC: number | null;
  maxTempC: number | null;
  camera: boolean;
  /** Perfil de reserva mientras el usuario no ha elegido su dron (no se guarda). */
  generic?: boolean;
}

export function profileFromModel(m: DroneModel): DroneProfile {
  return {
    modelId: m.id,
    brand: m.brand,
    model: m.model,
    massG: m.massG,
    classLabel: m.classLabel,
    maxWindMs: m.maxWindMs,
    ipRating: m.ipRating,
    minTempC: m.minTempC,
    maxTempC: m.maxTempC,
    camera: m.camera,
  };
}

export const CUSTOM_PROFILE: DroneProfile = {
  modelId: null,
  brand: 'Otro',
  model: '',
  massG: 249,
  classLabel: 'legacy',
  maxWindMs: null,
  ipRating: null,
  minTempC: null,
  maxTempC: null,
  camera: true,
};

/**
 * Perfil prudente para los cálculos mientras no se elige dron: un dron ligero (< 250 g) con cámara, el
 * límite de viento estimado más bajo y sin protección contra el agua.
 */
export const GENERIC_PROFILE: DroneProfile = { ...CUSTOM_PROFILE, brand: '', model: '', generic: true };

/** Nombre corto del dron para la interfaz. */
export function droneName(p: DroneProfile): string {
  if (p.generic) return 'Dron sin elegir';
  return [p.brand === 'Otro' ? '' : p.brand, p.model].filter(Boolean).join(' ') || 'Mi dron';
}

export const CLASS_LABEL_TEXT: Record<ClassLabel, string> = {
  C0: 'C0 (< 250 g)',
  C1: 'C1 (< 900 g)',
  C2: 'C2 (< 4 kg)',
  C3: 'C3 (< 25 kg)',
  C4: 'C4 (< 25 kg, sin automatismos)',
  legacy: 'Sin marcado de clase',
  privateBuilt: 'Construcción propia',
};

export type Subcategory = 'A1' | 'A2' | 'A3';

export interface OpenCategoryInfo {
  open: boolean;
  subcategories: Subcategory[];
  /** Subcategoría más permisiva en cuanto a cercanía a personas. */
  primary: Subcategory | null;
  headline: string;
  peopleRule: string;
  competency: string;
  warnings: string[];
}

const PEOPLE_RULE: Record<Subcategory, string> = {
  A1: 'Puedes volar cerca de personas, pero nunca sobre concentraciones de personas.',
  A2: 'Mantén al menos 30 m en horizontal con personas ajenas a la operación (5 m con el modo de baja velocidad activado).',
  A3: 'Vuela lejos de personas: a más de 150 m en horizontal de zonas residenciales, comerciales, industriales o recreativas.',
};

/** Subcategorías permitidas según la etiqueta de clase y la masa (tras el fin del periodo transitorio, 1/1/2024). */
export function openCategoryFor(p: DroneProfile): OpenCategoryInfo {
  const warnings: string[] = [];
  if (p.massG >= 25_000) {
    return {
      open: false,
      subcategories: [],
      primary: null,
      headline: 'Fuera de la categoría abierta',
      peopleRule: 'Con 25 kg o más solo se puede operar en categoría específica (declaración o autorización de AESA).',
      competency: 'Certificado de piloto para categoría específica según el escenario.',
      warnings,
    };
  }
  let subcategories: Subcategory[];
  let competency: string;
  switch (p.classLabel) {
    case 'C0':
      if (p.massG >= 250) warnings.push('Un C0 debe pesar menos de 250 g: revisa la masa indicada.');
      subcategories = ['A1', 'A3'];
      competency = 'Conocer el manual del fabricante. Se recomienda el curso online A1/A3 de AESA (gratuito).';
      break;
    case 'C1':
      if (p.massG >= 900) warnings.push('Un C1 debe pesar menos de 900 g: revisa la masa indicada.');
      subcategories = ['A1', 'A3'];
      competency = 'Certificado A1/A3: curso y examen online gratuitos en la sede electrónica de AESA.';
      break;
    case 'C2':
      subcategories = ['A2', 'A3'];
      competency = 'A2: certificado de competencia de piloto a distancia A2 (A1/A3 + autoformación práctica + examen presencial). A3: basta el certificado A1/A3.';
      break;
    case 'C3':
    case 'C4':
      subcategories = ['A3'];
      competency = 'Certificado A1/A3 (curso y examen online de AESA).';
      break;
    case 'privateBuilt':
    case 'legacy':
    default:
      if (p.classLabel === 'legacy') {
        warnings.push(
          'Un dron sin marcado de clase solo puede volar en categoría abierta si se comercializó antes del 1 de enero de 2024.',
        );
      }
      if (p.massG < 250) {
        subcategories = ['A1', 'A3'];
        competency = 'Sin examen obligatorio por debajo de 250 g (basta conocer el manual); se recomienda el curso A1/A3 de AESA.';
      } else {
        subcategories = ['A3'];
        competency = 'Certificado A1/A3 (curso y examen online de AESA).';
        warnings.push(
          'Al no tener etiqueta de clase y pesar 250 g o más, desde el 1 de enero de 2024 solo puede volar en A3 (lejos de personas).',
        );
      }
      break;
  }
  const primary = subcategories[0];
  return {
    open: true,
    subcategories,
    primary,
    headline: `Categoría abierta · ${subcategories.join(' y ')}`,
    peopleRule: PEOPLE_RULE[primary],
    competency,
    warnings,
  };
}

export interface Requirement {
  id: string;
  title: string;
  status: 'required' | 'recommended' | 'not-required';
  detail: string;
}

/** Edad mínima del piloto a distancia en España (art. 9 RE y art. 7 RD 517/2024). */
export function minimumPilotAge(p: DroneProfile): string {
  if (p.classLabel === 'privateBuilt' && p.massG < 250) return 'Sin edad mínima (construcción propia de menos de 250 g).';
  if ((p.classLabel === 'C0' || p.classLabel === 'legacy') && p.massG < 250) {
    return '12 años (sin edad mínima si es un juguete). Con supervisión directa de un piloto apto no hay mínimo.';
  }
  return '14 años en España (16 con carácter general en la UE). Con supervisión directa de un piloto apto no hay mínimo.';
}

/** Registro, identificación, formación, seguro y otros requisitos generales en España. */
export function requirementsFor(p: DroneProfile): Requirement[] {
  const heavy = p.massG >= 250;
  const mustRegister = heavy || p.camera || ['C1', 'C2', 'C3', 'C4'].includes(p.classLabel);
  const remoteId = ['C1', 'C2', 'C3'].includes(p.classLabel);
  const info = openCategoryFor(p);
  const insuranceRequired = p.massG >= 20_000;
  const insuranceIfA2 = info.subcategories.includes('A2');
  return [
    {
      id: 'operator-registration',
      title: 'Registro como operador en AESA',
      status: mustRegister ? 'required' : 'not-required',
      detail: mustRegister
        ? `Obligatorio porque ${heavy ? 'el dron pesa 250 g o más' : p.camera ? 'lleva cámara o sensores capaces de captar datos personales' : 'tiene marcado de clase C1 o superior'}. Gratuito en la sede electrónica de AESA (operador mayor de 16 años), válido 3 años. El número de operador debe ir visible en el dron.`
        : 'No es obligatorio para drones de menos de 250 g sin cámara ni micrófono (o juguetes).',
    },
    {
      id: 'remote-id',
      title: 'Identificación a distancia (Remote ID)',
      status: remoteId ? 'required' : 'not-required',
      detail: remoteId
        ? 'Los C1, C2 y C3 deben emitir su identificación: carga tu número de operador en la app del fabricante y mantenla activa y actualizada.'
        : 'No exigida para esta clase en la categoría abierta.',
    },
    {
      id: 'competency',
      title: 'Formación del piloto',
      status: info.open && (p.massG >= 250 || ['C1', 'C2', 'C3', 'C4'].includes(p.classLabel)) ? 'required' : 'recommended',
      detail: info.competency,
    },
    {
      id: 'age',
      title: 'Edad mínima del piloto',
      status: 'required',
      detail: minimumPilotAge(p),
    },
    {
      id: 'insurance',
      title: 'Seguro de responsabilidad civil',
      status: insuranceRequired ? 'required' : 'recommended',
      detail: insuranceRequired
        ? 'Obligatorio con 20 kg o más de masa máxima al despegue.'
        : insuranceIfA2
          ? 'Obligatorio si vuelas en la subcategoría A2 (art. 8 RD 517/2024). En A1 y A3 por debajo de 20 kg no lo es, pero es muy recomendable.'
          : 'No es obligatorio en A1 ni A3 por debajo de 20 kg (art. 8 RD 517/2024), pero respondes de los daños: es muy recomendable.',
    },
    {
      id: 'vlos-height',
      title: 'Visibilidad directa y altura máxima',
      status: 'required',
      detail: 'Siempre con contacto visual directo con el dron (VLOS) y a un máximo de 120 m sobre el punto más próximo de la superficie.',
    },
    {
      id: 'privacy',
      title: 'Privacidad y protección de datos',
      status: p.camera ? 'required' : 'not-required',
      detail: 'Si grabas o fotografías a personas identificables se aplica el RGPD: respeta su intimidad y no difundas imágenes sin base legal.',
    },
  ];
}

/** Límite de viento a usar en la evaluación: el del fabricante o una estimación prudente por masa. */
export function windLimitFor(p: DroneProfile): { limit: number; estimated: boolean } {
  if (p.maxWindMs && p.maxWindMs > 0) return { limit: p.maxWindMs, estimated: false };
  const limit = p.massG < 250 ? 8 : p.massG < 900 ? 10 : 12;
  return { limit, estimated: true };
}

/** El dron tolera lluvia (protección IP con segundo dígito ≥ 3). */
export function isWaterResistant(p: DroneProfile): boolean {
  const m = p.ipRating?.match(/IP[\dX](\d)/i);
  return m ? Number(m[1]) >= 3 : false;
}
