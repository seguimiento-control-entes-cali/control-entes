/* Pruebas del reconocimiento de la dependencia al importar planes: `node tests/dependencias.test.cjs`.
   Usa los 30 nombres institucionales del catálogo y los cargos del directorio (públicos, sin nombres de personas),
   más variantes de escritura y casos fáciles de confundir. Una dependencia que no se puede saber queda en null:
   la app no adivina y Control Interno la elige en la vista previa. */
const assert = require('assert');
const cargarApp = require('./cargar-app.cjs');
const R = cargarApp(['S', 'pmDepImport', 'pmDepSugerida']);
R.S.deps = [[1, "Departamento Administrativo de Contratación Pública"], [2, "Departamento Administrativo de Control Disciplinario Interno"], [3, "Departamento Administrativo de Control Interno"], [4, "Departamento Administrativo de Desarrollo e Innovación Institucional"], [5, "Departamento Administrativo de Gestión Jurídica Pública"], [6, "Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)"], [7, "Departamento Administrativo de Hacienda Municipal"], [8, "Departamento Administrativo de Planeación Municipal"], [9, "Departamento Administrativo de Tecnologías de la Información y las Comunicaciones"], [10, "Oficina de la Secretaría Privada y Despacho del Alcalde"], [11, "Secretaría de Bienestar Social"], [12, "Secretaría de Cultura"], [13, "Secretaría de Desarrollo Económico"], [14, "Secretaría de Desarrollo Territorial y Participación Ciudadana"], [15, "Secretaría de Educación"], [16, "Secretaría de Gestión del Riesgo de Emergencias y Desastres"], [17, "Secretaría de Gobierno"], [18, "Secretaría de Infraestructura"], [19, "Secretaría de Movilidad"], [20, "Secretaría de Paz y Cultura Ciudadana"], [21, "Secretaría de Salud Pública"], [22, "Secretaría de Seguridad y Justicia"], [23, "Secretaría de Turismo"], [24, "Secretaría de Vivienda Social y Hábitat"], [25, "Secretaría del Deporte y la Recreación"], [26, "Teatro Municipal Enrique Buenaventura"], [27, "Unidad Administrativa Especial Estudios Takeshima"], [28, "Unidad Administrativa Especial de Gestión de Bienes y Servicios"], [29, "Unidad Administrativa Especial de Protección Animal"], [30, "Unidad Administrativa Especial de Servicios Públicos Municipales"]].map(([id, nombre]) => ({ id, nombre }));
const id = n => R.S.deps.find(d => d.nombre === n).id;
const dep = (resp, lugar = '') => R.pmDepImport(resp, lugar) || R.pmDepSugerida([lugar, resp]);
const sinTilde = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
let n = 0;
const ok = (resp, esperado, lugar) => { assert.strictEqual(dep(resp, lugar), esperado == null ? null : id(esperado), resp + ' | ' + (lugar || '')); n++; };

/* 1. Nombre completo, en mayúsculas sin tildes y dentro de un cargo con persona inventada */
for (const d of R.S.deps) {
  ok(d.nombre, d.nombre);
  ok(sinTilde(d.nombre), d.nombre);
  ok('Pedro Pérez Gómez - Jefe de Oficina - ' + d.nombre, d.nombre);
}
/* 2. Cargos tal como están en el directorio */
for (const [org, cargo] of [["Secretaría de Gobierno", "Secretario de Gobierno"], ["Oficina de la Secretaría Privada y Despacho del Alcalde", "Secretaria Privada"], ["Departamento Administrativo de Gestión Jurídica Pública", "Directora Gestión Juridica Pública"], ["Departamento Administrativo de Control Interno", "Director Control Interno"], ["Departamento Administrativo de Control Disciplinario Interno", "Director Control Disciplinario Interno"], ["Departamento Administrativo de Control Disciplinario Interno", "Directora Control Disciplinario Interno de Juzgamiento"], ["Departamento Administrativo de Desarrollo e Innovación Institucional", "Directora Departamento Administrativo de Desarrollo e Innovación Institucional - DADII"], ["Departamento Administrativo de Hacienda Municipal", "Director Hacienda Municipal"], ["Departamento Administrativo de Planeación Municipal", "Directora Planeación Municipal"], ["Departamento Administrativo de Tecnologías de la Información y las Comunicaciones", "Director Tecnologías de Información y las Telecomunicaciones - DATIC"], ["Departamento Administrativo de Contratación Pública", "Directora de Contratación Pública"], ["Unidad Administrativa Especial de Gestión de Bienes y Servicios", "Directora Unidad Administrativa Especial de Gestión de Bienes y Servicios"], ["Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)", "Directora Departamento Administrativo de Gestión del Medio Ambiente - DAGMA"], ["Unidad Administrativa Especial de Protección Animal", "Directora Unidad Administrativa Especial de Protección Animal"], ["Secretaría de Paz y Cultura Ciudadana", "Secretario de Paz y Cultura Ciudadana"], ["Secretaría de Seguridad y Justicia", "Secretario de Seguridad y Justicia"], ["Secretaría de Gestión del Riesgo de Emergencias y Desastres", "Secretario Gestión del Riesgo de Emergencias y Desastres"], ["Secretaría de Bienestar Social", "Secretaria de Bienestar Social"], ["Secretaría de Salud Pública", "Secretario de Salud"], ["Secretaría de Educación", "Secretaria de Educación"], ["Secretaría de Desarrollo Económico", "Secretaria de Desarrollo Económico"], ["Secretaría de Cultura", "Secretario de Cultura"], ["Unidad Administrativa Especial Estudios Takeshima", "Director Unidad Administrativa Especial Estudios Takeshima"], ["Teatro Municipal Enrique Buenaventura", "Directora Unidad Administrativa Especial Teatro Municipal"], ["Secretaría del Deporte y la Recreación", "Secretario de Deporte y la Recreación"], ["Secretaría de Desarrollo Territorial y Participación Ciudadana", "Secretaria de Desarrollo Territorial y Participación Ciudadana"], ["Secretaría de Movilidad", "Secretario de Movilidad"], ["Secretaría de Infraestructura", "Secretario de Infraestructura Vial"], ["Secretaría de Vivienda Social y Hábitat", "Secretaria de Vivienda Social y Hábitat"], ["Unidad Administrativa Especial de Servicios Públicos Municipales", "Director Técnico Unidad Administrativa Especial de Servicios Públicos Municipales - UAESPM"], ["Secretaría de Turismo", "Secretaria de Turismo"]]) ok(cargo, org);
/* 3. Siglas, subsecretarías y nombres abreviados */
[
  ['Profesional Especializado - DAGMA', 'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)'],
  ['Subdirector de Operaciones - DATIC', 'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones'],
  ['Jefe de Oficina - DADII', 'Departamento Administrativo de Desarrollo e Innovación Institucional'],
  ['Subdirector - UAESPM', 'Unidad Administrativa Especial de Servicios Públicos Municipales'],
  ['Subdirector de Ordenamiento - DAPM', 'Departamento Administrativo de Planeación Municipal'],
  ['Dpto. Adm. de Planeación Municipal', 'Departamento Administrativo de Planeación Municipal'],
  ['Subdirectora de Tesorería - Hacienda Municipal', 'Departamento Administrativo de Hacienda Municipal'],
  ['Subdirector de Hacienda', 'Departamento Administrativo de Hacienda Municipal'],
  ['Director Teatro Municipal', 'Teatro Municipal Enrique Buenaventura'],
  ['Unidad de Bienes y Servicios', 'Unidad Administrativa Especial de Gestión de Bienes y Servicios'],
  ['Subsecretaria de Salud Pública', 'Secretaría de Salud Pública'],
  ['Subsecretario de Infraestructura Vial', 'Secretaría de Infraestructura'],
  ['Subsecretario de Infraestructura Deportiva - Secretaría del Deporte', 'Secretaría del Deporte y la Recreación'],
  /* 4. Fáciles de confundir */
  ['Secretario de Cultura', 'Secretaría de Cultura'],
  ['Asesora - Secretaría de Paz y Cultura Ciudadana', 'Secretaría de Paz y Cultura Ciudadana'],
  ['Director Control Interno', 'Departamento Administrativo de Control Interno'],
  ['Directora Control Disciplinario Interno', 'Departamento Administrativo de Control Disciplinario Interno'],
  ['Secretaria de Desarrollo Territorial', 'Secretaría de Desarrollo Territorial y Participación Ciudadana'],
  ['Profesional Especializado - Desarrollo Económico', 'Secretaría de Desarrollo Económico'],
  ['Subsecretario de Gestión del Riesgo', 'Secretaría de Gestión del Riesgo de Emergencias y Desastres'],
  ['Asesor de Gestión Jurídica Pública', 'Departamento Administrativo de Gestión Jurídica Pública'],
  ['Subsecretaria de Vivienda', 'Secretaría de Vivienda Social y Hábitat'],
  ['Secretaría de Seguridad', 'Secretaría de Seguridad y Justicia'],
  ['Coordinadora Protección Animal', 'Unidad Administrativa Especial de Protección Animal'],
  ['Director Estudios Takeshima', 'Unidad Administrativa Especial Estudios Takeshima'],
  ['Subsecretario de Movilidad Sostenible', 'Secretaría de Movilidad'],
  /* 5. No son dependencias de la Administración: no se adivinan */
  ['Oficina Asesora de Comunicaciones', null],
  ['Contraloría General de Santiago de Cali', null],
  ['Personería Distrital', null],
  ['Concejo Distrital', null],
  ['Juan Pérez, contratista', null]
].forEach(([r, e]) => ok(r, e));
/* 6. El responsable con nombre completo manda sobre un lugar de verificación distinto; si no, el lugar */
ok('María Pérez - Secretaría de Salud Pública', 'Secretaría de Salud Pública', 'Departamento Administrativo de Control Interno');
ok('Subsecretario de Infraestructura Deportiva y Recreativa', 'Secretaría del Deporte y la Recreación', 'Secretaría del Deporte y la Recreación');
ok('Jefe Unidad de Apoyo a la Gestión', 'Secretaría de Educación', 'Secretaría de Educación');
ok('Juan Gómez, contratista', null, 'Carpeta compartida');
console.log('OK: ' + n + ' verificaciones del reconocimiento de dependencias');
