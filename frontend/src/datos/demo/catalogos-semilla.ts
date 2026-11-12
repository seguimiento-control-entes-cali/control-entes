// Catálogos de la demostración: los mismos de supabase/02_seed.sql (generados de ese archivo; no son datos reales).
import type { Dependencia, Ente } from '../contratos';

export const ENTES_DEMO: readonly Ente[] = [
  {
    'id': 1,
    'nombre': 'Contraloría General de Santiago de Cali',
    'sigla': 'CGSC',
    'tipo': 'Fiscal',
    'activo': true
  },
  {
    'id': 2,
    'nombre': 'Contraloría General de la República',
    'sigla': 'CGR',
    'tipo': 'Fiscal',
    'activo': true
  },
  {
    'id': 3,
    'nombre': 'Contraloría de Bogotá D.C',
    'sigla': 'CB',
    'tipo': 'Fiscal',
    'activo': true
  },
  {
    'id': 4,
    'nombre': 'Defensoría del Pueblo',
    'sigla': 'DP',
    'tipo': 'Ministerio Público',
    'activo': true
  },
  {
    'id': 5,
    'nombre': 'Otro',
    'sigla': '',
    'tipo': 'Otro',
    'activo': true
  },
  {
    'id': 6,
    'nombre': 'Personería Municipal Santiago de Cali',
    'sigla': 'PMC',
    'tipo': 'Ministerio Público',
    'activo': true
  },
  {
    'id': 7,
    'nombre': 'Personería de Bogotá D.C',
    'sigla': 'PB',
    'tipo': 'Ministerio Público',
    'activo': true
  },
  {
    'id': 8,
    'nombre': 'Procuraduría General de la Nación',
    'sigla': 'PGN',
    'tipo': 'Ministerio Público',
    'activo': true
  },
  {
    'id': 9,
    'nombre': 'Procuraduría Provincial de Cali',
    'sigla': 'PPC',
    'tipo': 'Ministerio Público',
    'activo': true
  },
  {
    'id': 10,
    'nombre': 'Procuraduría Regional del Valle',
    'sigla': 'PRV',
    'tipo': 'Ministerio Público',
    'activo': true
  }
];

export const DEPENDENCIAS_DEMO: readonly Pick<Dependencia, 'id' | 'nombre' | 'activo'>[] = [
  {
    'id': 1,
    'nombre': 'Departamento Administrativo de Contratación Pública',
    'activo': true
  },
  {
    'id': 2,
    'nombre': 'Departamento Administrativo de Control Disciplinario Interno',
    'activo': true
  },
  {
    'id': 3,
    'nombre': 'Departamento Administrativo de Control Interno',
    'activo': true
  },
  {
    'id': 4,
    'nombre': 'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'activo': true
  },
  {
    'id': 5,
    'nombre': 'Departamento Administrativo de Gestión Jurídica Pública',
    'activo': true
  },
  {
    'id': 6,
    'nombre': 'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'activo': true
  },
  {
    'id': 7,
    'nombre': 'Departamento Administrativo de Hacienda Municipal',
    'activo': true
  },
  {
    'id': 8,
    'nombre': 'Departamento Administrativo de Planeación Municipal',
    'activo': true
  },
  {
    'id': 9,
    'nombre': 'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'activo': true
  },
  {
    'id': 10,
    'nombre': 'Oficina de la Secretaría Privada y Despacho del Alcalde',
    'activo': true
  },
  {
    'id': 11,
    'nombre': 'Secretaría de Bienestar Social',
    'activo': true
  },
  {
    'id': 12,
    'nombre': 'Secretaría de Cultura',
    'activo': true
  },
  {
    'id': 13,
    'nombre': 'Secretaría de Desarrollo Económico',
    'activo': true
  },
  {
    'id': 14,
    'nombre': 'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'activo': true
  },
  {
    'id': 15,
    'nombre': 'Secretaría de Educación',
    'activo': true
  },
  {
    'id': 16,
    'nombre': 'Secretaría de Gestión del Riesgo de Emergencias y Desastres',
    'activo': true
  },
  {
    'id': 17,
    'nombre': 'Secretaría de Gobierno',
    'activo': true
  },
  {
    'id': 18,
    'nombre': 'Secretaría de Infraestructura',
    'activo': true
  },
  {
    'id': 19,
    'nombre': 'Secretaría de Movilidad',
    'activo': true
  },
  {
    'id': 20,
    'nombre': 'Secretaría de Paz y Cultura Ciudadana',
    'activo': true
  },
  {
    'id': 21,
    'nombre': 'Secretaría de Salud Pública',
    'activo': true
  },
  {
    'id': 22,
    'nombre': 'Secretaría de Seguridad y Justicia',
    'activo': true
  },
  {
    'id': 23,
    'nombre': 'Secretaría de Turismo',
    'activo': true
  },
  {
    'id': 24,
    'nombre': 'Secretaría de Vivienda Social y Hábitat',
    'activo': true
  },
  {
    'id': 25,
    'nombre': 'Secretaría del Deporte y la Recreación',
    'activo': true
  },
  {
    'id': 26,
    'nombre': 'Teatro Municipal Enrique Buenaventura',
    'activo': true
  },
  {
    'id': 27,
    'nombre': 'Unidad Administrativa Especial Estudios Takeshima',
    'activo': true
  },
  {
    'id': 28,
    'nombre': 'Unidad Administrativa Especial de Gestión de Bienes y Servicios',
    'activo': true
  },
  {
    'id': 29,
    'nombre': 'Unidad Administrativa Especial de Protección Animal',
    'activo': true
  },
  {
    'id': 30,
    'nombre': 'Unidad Administrativa Especial de Servicios Públicos Municipales',
    'activo': true
  }
];
