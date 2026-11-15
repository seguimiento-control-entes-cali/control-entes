// Reglas de unificación de organismos del Excel de control: (patrón sobre el texto sin tildes, nombre oficial, tipo,
// confianza) y padre de las subunidades. COPIA LITERAL de CE_REGLAS y CE_PADRE de src/js/20-carga-excel.js de la 2.x
// (mismo orden y contenido que RULES en etl/clean.py), generada con un script; no se edita a mano.
// Paridad comprobada en pruebas/paridad-excel-control.test.ts.

const CE_SUB = 'Subunidad';

const REGLAS_TEXTO: readonly (readonly [string, string, string, string])[] = [
  /* EXTRA3 */
  ['contrav', 'Oficina de Contravenciones (padre por confirmar)', 'Subunidad', 'media'],
  ['comiaria', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  [
    'talento humane',
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento',
    'alta'
  ],
  ['politica de segurdad', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['infaestructura', 'Secretaría de Infraestructura', 'Secretaría', 'alta'],
  [
    'defensa judicial|defense judicial|prevencion del dano antijuridico',
    'Departamento Administrativo de Gestión Jurídica Pública',
    'Departamento',
    'alta'
  ],
  ['patrimonio|bibliotecas', 'Secretaría de Cultura', 'Secretaría', 'alta'],
  ['inspeccion urbano de policia', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  /* EXTRA2 */
  ['^\\d{1,3}( y \\d{1,3})?$|^y \\d+$', 'Sin dato', 'Otro', 'baja'],
  ['comis\\w*ri|corregidor', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['secretaria de (ed\\w*c\\w*n|edcuac\\w*|eduac\\w*)', 'Secretaría de Educación', 'Secretaría', 'alta'],
  ['cobertura educativa', 'Secretaría de Educación', 'Secretaría', 'alta'],
  ['seguridad y j\\w+|secretaria de inspeccion', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['infra\\w{3,}ructura', 'Secretaría de Infraestructura', 'Secretaría', 'alta'],
  ['sec+retaria privada', 'Oficina de la Secretaría Privada y Despacho del Alcalde', 'Despacho', 'alta'],
  ['etnias', 'Subsecretaría de Poblaciones y Etnias (padre por confirmar)', 'Subunidad', 'media'],
  ['contra\\w+ publica', 'Departamento Administrativo de Contratación Pública', 'Departamento', 'alta'],
  [
    'cobro (coactivo|persuasivo|coativo)|tesoreria|administracion de pagos',
    'Departamento Administrativo de Hacienda Municipal',
    'Departamento',
    'alta'
  ],
  [
    'subdireccion desarrollo integral',
    'Departamento Administrativo de Planeación Municipal',
    'Departamento',
    'alta'
  ],
  ['transparencia', 'Oficina de Transparencia (padre por confirmar)', 'Subunidad', 'media'],
  ['contravenciones', 'Oficina de Contravenciones (padre por confirmar)', 'Subunidad', 'media'],
  /* EXTRA */
  ['insp\\w* polic|inspeccion de policia', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['acceso a (servicios de )?(la )?justicia', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  [
    '(subsecretari[ao] (de )?(la )?)?politica de seguridad',
    'Secretaría de Seguridad y Justicia',
    'Secretaría',
    'alta'
  ],
  ['derechos humanos y construccion de paz', 'Secretaría de Paz y Cultura Ciudadana', 'Secretaría', 'alta'],
  ['mejoramiento integral y legalizacion', 'Secretaría de Vivienda Social y Hábitat', 'Secretaría', 'alta'],
  ['catast|finanzas publicas', 'Departamento Administrativo de Hacienda Municipal', 'Departamento', 'alta'],
  [
    'doctrina y asuntos normativos',
    'Departamento Administrativo de Gestión Jurídica Pública',
    'Departamento',
    'alta'
  ],
  [
    'centro de administracion local integrada|\\bcali \\d|cali rural',
    'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'Secretaría',
    'alta'
  ],
  ['takeshima', 'Unidad Administrativa Especial Estudios Takeshima', 'UAE', 'alta'],
  [
    'gestion ambiental',
    'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'Departamento',
    'alta'
  ],
  ['contrataci', 'Departamento Administrativo de Contratación Pública', 'Departamento', 'alta'],
  [
    'tecnolog|tenolog',
    'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'Departamento',
    'alta'
  ],
  ['suguridad|seguridad y just', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['educac', 'Secretaría de Educación', 'Secretaría', 'alta'],
  [
    'proteccion an\\w*mal|\\buepa\\b|\\buaepa\\b',
    'Unidad Administrativa Especial de Protección Animal',
    'UAE',
    'alta'
  ],
  [
    'contador del distrito|contaduria',
    'Departamento Administrativo de Hacienda Municipal',
    'Departamento',
    'alta'
  ],
  [
    'gestion del medio',
    'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'Departamento',
    'alta'
  ],
  ['\\bsgred\\b', 'Secretaría de Gestión del Riesgo de Emergencias y Desastres', 'Secretaría', 'alta'],
  [
    '\\bdatic\\b',
    'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'Departamento',
    'alta'
  ],
  [
    'disciplinario interno',
    'Departamento Administrativo de Control Disciplinario Interno',
    'Departamento',
    'alta'
  ],
  [
    'subsecretari[ao] (de )?(la )?primera infancia',
    'Subsecretaría de Primera Infancia (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?equidad',
    'Subsecretaría de Equidad de Género (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?(poblaciones y etnias|etnias y poblaciones)',
    'Subsecretaría de Poblaciones y Etnias (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?atencion',
    'Subsecretaría de Atención Integral a Víctimas (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?inspeccion|^vigilancia y control',
    'Subsecretaría de Inspección, Vigilancia y Control (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'tramites servicios y gestion documental',
    'Subdirección de Trámites, Servicios y Gestión Documental (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  /* subunidades con padre de confianza alta */
  [
    'subsecretaria de acceso a servicios de justicia|comisaria|inspeccion de policia|inspector',
    'Secretaría de Seguridad y Justicia',
    'Secretaría',
    'alta'
  ],
  ['subsecretaria de la politica de seguridad', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  [
    'subsecretaria de promocion y fortalecimiento de la participacion',
    'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'Secretaría',
    'alta'
  ],
  [
    'subsecretaria (proteccion de la salud|de promocion prevencion)|subsecretaria de salud|promocion prevencion y produccion social',
    'Secretaría de Salud Pública',
    'Secretaría',
    'alta'
  ],
  [
    'subsecretaria de infraestructura y mantenimiento vial',
    'Secretaría de Infraestructura',
    'Secretaría',
    'alta'
  ],
  [
    'subsecretaria de infraestructura deportiva',
    'Secretaría del Deporte y la Recreación',
    'Secretaría',
    'alta'
  ],
  ['subsecretaria de movilidad sostenible', 'Secretaría de Movilidad', 'Secretaría', 'alta'],
  ['subsecretaria de artes', 'Secretaría de Cultura', 'Secretaría', 'alta'],
  [
    'subdireccion (de )?(finanzas publicas|tesoreria|de impuestos|de catastro)|oficina tecnica operativa de cobro coactivo|contaduria',
    'Departamento Administrativo de Hacienda Municipal',
    'Departamento',
    'alta'
  ],
  [
    'subdireccion (de )?(planificacion del territorio|de espacio publico|de desarrollo integral)',
    'Departamento Administrativo de Planeación Municipal',
    'Departamento',
    'alta'
  ],
  [
    '(subdireccion|subsecretaria) (de )?gesti\\w* estrategica (de )?(del )?talento humano|subdireccion estrategica de talento humano|talento humano',
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento',
    'alta'
  ],
  /* subunidades sin padre confirmado */
  [
    'subsecretaria de equidad de gener',
    'Subsecretaría de Equidad de Género (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  [
    'subsecretaria de poblaciones y etnias',
    'Subsecretaría de Poblaciones y Etnias (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  [
    'subsecretaria de atencion (integral )?a victimas',
    'Subsecretaría de Atención Integral a Víctimas (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  [
    'subsecretaria de inspeccion',
    'Subsecretaría de Inspección, Vigilancia y Control (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  /* organismos principales */
  [
    'secretaria privada|despacho (del )?alcalde|^alcalde|^alcaldia$|^alcalde$',
    'Oficina de la Secretaría Privada y Despacho del Alcalde',
    'Despacho',
    'alta'
  ],
  ['todos los organismos', 'Todos los organismos', 'Otro', 'alta'],
  ['paz y cultura', 'Secretaría de Paz y Cultura Ciudadana', 'Secretaría', 'alta'],
  [
    'seguridad y just|seguridad y justcia|seguridad y jus',
    'Secretaría de Seguridad y Justicia',
    'Secretaría',
    'alta'
  ],
  ['educacion', 'Secretaría de Educación', 'Secretaría', 'alta'],
  ['movilidad', 'Secretaría de Movilidad', 'Secretaría', 'alta'],
  ['bienestar|binestar', 'Secretaría de Bienestar Social', 'Secretaría', 'alta'],
  ['salud', 'Secretaría de Salud Pública', 'Secretaría', 'alta'],
  ['infraestructura', 'Secretaría de Infraestructura', 'Secretaría', 'alta'],
  ['hacienda', 'Departamento Administrativo de Hacienda Municipal', 'Departamento', 'alta'],
  [
    'desarrollo (e )?innovacion|desarrollo institucional|dadii|desarrollo e inovacion',
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento',
    'alta'
  ],
  ['planeacion', 'Departamento Administrativo de Planeación Municipal', 'Departamento', 'alta'],
  [
    'desarrollo territorial|participacion ciudadana',
    'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'Secretaría',
    'alta'
  ],
  ['gobierno', 'Secretaría de Gobierno', 'Secretaría', 'alta'],
  [
    'medio ambiente|dagma',
    'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'Departamento',
    'alta'
  ],
  ['desarrollo economico', 'Secretaría de Desarrollo Económico', 'Secretaría', 'alta'],
  ['cultura', 'Secretaría de Cultura', 'Secretaría', 'alta'],
  ['bienes y servicios', 'Unidad Administrativa Especial de Gestión de Bienes y Servicios', 'UAE', 'alta'],
  [
    'control disciplinario',
    'Departamento Administrativo de Control Disciplinario Interno',
    'Departamento',
    'alta'
  ],
  ['control interno', 'Departamento Administrativo de Control Interno', 'Departamento', 'alta'],
  [
    'servicios publicos|uaesp',
    'Unidad Administrativa Especial de Servicios Públicos Municipales',
    'UAE',
    'alta'
  ],
  [
    'gestion juridica|juridica',
    'Departamento Administrativo de Gestión Jurídica Pública',
    'Departamento',
    'alta'
  ],
  ['deporte', 'Secretaría del Deporte y la Recreación', 'Secretaría', 'alta'],
  ['contratacion publica', 'Departamento Administrativo de Contratación Pública', 'Departamento', 'alta'],
  ['vivienda', 'Secretaría de Vivienda Social y Hábitat', 'Secretaría', 'alta'],
  ['riesgo', 'Secretaría de Gestión del Riesgo de Emergencias y Desastres', 'Secretaría', 'alta'],
  [
    'tecnologias de la informacion|\\btic\\b',
    'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'Departamento',
    'alta'
  ],
  ['turismo', 'Secretaría de Turismo', 'Secretaría', 'alta'],
  ['proteccion animal', 'Unidad Administrativa Especial de Protección Animal', 'UAE', 'alta'],
  ['teatro municipal', 'Teatro Municipal Enrique Buenaventura', 'UAE', 'alta']
];

/** Reglas en orden: la primera que coincide gana. */
export const REGLAS_ORGANISMOS: readonly (readonly [RegExp, string, string, string])[] = REGLAS_TEXTO.map(
  ([p, n, l, c]) => [new RegExp(p), n, l, c] as const
);

/** Subunidades cuyo padre está confirmado: se cuentan en su secretaría o departamento. */
export const PADRE_ORGANISMO: Readonly<Record<string, readonly [string, string]>> = {
  'Subsecretaría de Equidad de Género (padre por confirmar)': [
    'Secretaría de Bienestar Social',
    'Secretaría'
  ],
  'Subsecretaría de Poblaciones y Etnias (padre por confirmar)': [
    'Secretaría de Bienestar Social',
    'Secretaría'
  ],
  'Subsecretaría de Atención Integral a Víctimas (padre por confirmar)': [
    'Secretaría de Bienestar Social',
    'Secretaría'
  ],
  'Subsecretaría de Primera Infancia (padre por confirmar)': ['Secretaría de Bienestar Social', 'Secretaría'],
  'Subsecretaría de Inspección, Vigilancia y Control (padre por confirmar)': [
    'Secretaría de Seguridad y Justicia',
    'Secretaría'
  ],
  'Oficina de Contravenciones (padre por confirmar)': ['Secretaría de Movilidad', 'Secretaría'],
  'Subdirección de Trámites, Servicios y Gestión Documental (padre por confirmar)': [
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento'
  ],
  'Oficina de Transparencia (padre por confirmar)': [
    'Oficina de la Secretaría Privada y Despacho del Alcalde',
    'Despacho'
  ]
};
