// «Proyectar respuesta»: el oficio se arma sobre la plantilla ORFEO sin tocar el recuadro de radicado, con lo
// pendiente en amarillo. Las plantillas de prueba se construyen aquí (sin datos personales ni logos reales).
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { sumarHabiles } from './dias-habiles';
import {
  conArticulo,
  enLetras,
  fechaLarga,
  lineasOficio,
  llenarDocumentoXml,
  llenarOficio,
  nombreOficio,
  pareceDocx,
  parrafosPrincipales,
  plazoHabiles,
  type DatosOficio
} from './oficio-respuesta';

const p = (
  t: string,
  rPr = '<w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/><w:u w:val="single"/></w:rPr>'
) => `<w:p w:rsidR="00AB"><w:pPr><w:jc w:val="both"/></w:pPr><w:r>${rPr}<w:t>${t}</w:t></w:r></w:p>`;
// Recuadro de ORFEO: un cuadro de texto DENTRO de un párrafo, con sus propios párrafos
const RECUADRO =
  '<w:p><w:r><w:drawing><wps:txbx><w:txbxContent>' +
  [
    '**RAD_S**',
    'Al contestar por favor cite estos datos:',
    'Radicado No.: *RAD_S*',
    'Fecha: *F_RAD_S*',
    'TRD: *TRD_S*',
    'Rad. Padre: *RAD_E_PADRE*'
  ]
    .map(t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`)
    .join('') +
  '</w:txbxContent></wps:txbx></w:drawing></w:r></w:p>';
const FORMATO = [
  'NOMBRE COMPLETO',
  'Cargo ',
  'Razón Social ',
  'Ciudad y/o Dirección ',
  'Asunto: (Reseña inductiva del tema de la comunicación oficial)',
  'Saludo ',
  'Texto................ .....',
  '................ ..................... .',
  'Despedida ',
  'NOMBRE DEL REMITENTE',
  'Cargo',
  'Organismo/Dependencia',
  'Anexos: (opcional - Indicando formato y cantidad de folios) ',
  'CC. Nombre - Cargo',
  'Proyectó: Nombre completo- Cargo',
  'Elaboró: Nombre completo– Cargo',
  'Revisó: Nombre completo – Cargo',
  'En atención del desarrollo de nuestros Sistemas de Gestión y Control Integrados…'
];
const cuerpo = (parrafos: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos}<w:p/><w:sectPr/></w:body></w:document>`;
const XML_FORMATO = cuerpo(RECUADRO + FORMATO.map(t => p(t)).join(''));
const XML_VACIO = cuerpo(RECUADRO + p('En atención del desarrollo de nuestros Sistemas…'));

function docx(xml: string): Uint8Array {
  const z = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(z, '[Content_Types].xml', new TextEncoder().encode('<Types/>'));
  XLSX.CFB.utils.cfb_add(z, 'word/document.xml', new TextEncoder().encode(xml));
  XLSX.CFB.utils.cfb_add(z, 'word/footer1.xml', new TextEncoder().encode('<w:ftr>Piso 9</w:ftr>'));
  const b = XLSX.CFB.write(z, { type: 'array', fileType: 'zip' }) as unknown;
  return b instanceof Uint8Array ? b : new Uint8Array(b as ArrayLike<number>);
}
const leer = (b: Uint8Array, parte: string) => {
  const z = XLSX.CFB.read(b, { type: 'array' });
  const e = z.FileIndex[z.FullPaths.findIndex((x: string) => x.endsWith('/' + parte) || x === parte)];
  return e ? new TextDecoder().decode(e.content as Uint8Array) : '';
};
const visible = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join(' | ');

const D: DatosOficio = {
  radicado: '2026EE004812',
  fechaRadicacion: '2026-11-23',
  fechaLimite: '2026-12-15',
  asunto: 'Solicitud de información sobre contratos de obra',
  ente: 'Contraloría General de Santiago de Cali',
  titularNombre: '',
  titularCargo: 'Contralor(a) General de Santiago de Cali',
  dependencia: 'Secretaría de Gobierno',
  remitenteNombre: 'Persona Inventada',
  remitenteCargo: 'Secretario(a) de Gobierno',
  proyecto: 'Enlace de prueba'
};

describe('fechas y plazos del oficio', () => {
  it('fecha larga en español', () => {
    expect(fechaLarga('2026-11-23')).toBe('23 de noviembre de 2026');
    expect(fechaLarga('2026-01-05')).toBe('5 de enero de 2026');
  });
  it('plazo en días hábiles: sin fines de semana ni festivos (8 de diciembre)', () => {
    expect(plazoHabiles('2026-11-23', '2026-12-15')).toBe(15);
    expect(plazoHabiles('2026-11-23', sumarHabiles('2026-11-23', 10))).toBe(10);
    expect(plazoHabiles('2026-12-15', '2026-11-23')).toBe(0);
    expect(plazoHabiles('', '2026-12-15')).toBe(0);
  });
  it('números en letras y artículo de la dependencia', () => {
    expect([enLetras(5), enLetras(15), enLetras(21), enLetras(30), enLetras(45), enLetras(70)]).toEqual([
      'cinco',
      'quince',
      'veintiuno',
      'treinta',
      'cuarenta y cinco',
      '70'
    ]);
    expect(conArticulo('Secretaría de Gobierno')).toBe('la Secretaría de Gobierno');
    expect(conArticulo('DA Hacienda Municipal')).toBe('el DA Hacienda Municipal');
    expect(conArticulo('Departamento Administrativo de Planeación')).toBe(
      'el Departamento Administrativo de Planeación'
    );
  });
  it('lo que no se sabe queda pendiente (amarillo); lo que se sabe, no', () => {
    const L = lineasOficio(D);
    expect(L.titular).toEqual({ texto: 'Doctor(a) [NOMBRE DEL TITULAR DEL ENTE]', pendiente: true });
    expect(L.cargoTitular.pendiente).toBe(false);
    expect(L.fondo.pendiente).toBe(true);
    expect(L.remitente.texto).toBe('PERSONA INVENTADA');
    expect(L.introduccion.texto).toContain(
      'dentro del término de quince (15) días hábiles concedido, que vence el 15 de diciembre de 2026'
    );
    expect(lineasOficio({ ...D, titularNombre: 'Titular Inventado' }).titular).toEqual({
      texto: 'Doctor(a) Titular Inventado',
      pendiente: false
    });
  });
});

describe('plantilla con el formato oficial de comunicaciones', () => {
  const r = llenarDocumentoXml(XML_FORMATO, D);
  const t = visible(r.xml);
  it('llena los 17 campos del formato', () => {
    expect(r.modo).toBe('formato');
    expect(r.campos).toBe(17);
    for (const s of [
      'Contraloría General de Santiago de Cali',
      'Santiago de Cali',
      'Asunto: Respuesta al requerimiento radicado No. 2026EE004812 del 23 de noviembre de 2026',
      'Respetado(a) doctor(a):',
      'Atentamente,',
      'PERSONA INVENTADA',
      'Secretario(a) de Gobierno',
      'Proyectó: Enlace de prueba'
    ])
      expect(t).toContain(s);
    for (const s of [
      'NOMBRE COMPLETO',
      'Razón Social',
      'Saludo |',
      'Despedida',
      'NOMBRE DEL REMITENTE',
      'Organismo/Dependencia',
      'Texto....'
    ])
      expect(t).not.toContain(s);
  });
  it('NO toca el recuadro de ORFEO', () => {
    for (const s of [
      '**RAD_S**',
      'Radicado No.: *RAD_S*',
      'Fecha: *F_RAD_S*',
      'TRD: *TRD_S*',
      'Rad. Padre: *RAD_E_PADRE*'
    ])
      expect(t).toContain(s);
    expect(r.xml).toContain(RECUADRO);
  });
  it('los dos «Cargo» van en su lugar: primero el del titular, después el de quien firma', () => {
    expect(t.indexOf('Contralor(a) General de Santiago de Cali')).toBeLessThan(
      t.indexOf('PERSONA INVENTADA')
    );
    expect(t.indexOf('PERSONA INVENTADA')).toBeLessThan(t.indexOf('Secretario(a) de Gobierno'));
  });
  it('resalta en amarillo SOLO lo pendiente, con el highlight antes del subrayado (orden de Word)', () => {
    const amarillos = [
      ...r.xml.matchAll(
        /<w:p\b[^>]*>(?:(?!<\/w:p>).)*?<w:highlight w:val="yellow"\/>(?:(?!<\/w:p>).)*?<\/w:p>/gs
      )
    ].map(m => visible(m[0]));
    expect(amarillos).toEqual([
      'Doctor(a) [NOMBRE DEL TITULAR DEL ENTE]',
      '[Escriba aquí la respuesta de fondo: lo que hizo la dependencia, las cifras y los soportes que la respaldan, punto por punto según lo solicitado.]',
      'Anexos: [indique formato y número de folios, o borre esta línea]',
      'CC. [opcional: nombre – cargo, o borre esta línea]',
      'Elaboró: [nombre completo – cargo]',
      'Revisó: [nombre completo – cargo]'
    ]);
    expect(r.xml).toContain('<w:sz w:val="24"/><w:highlight w:val="yellow"/><w:u w:val="single"/>');
  });
  it('conserva el formato del párrafo y la letra de la plantilla, y deja la encuesta', () => {
    expect(r.xml.match(/<w:jc w:val="both"\/>/g)?.length).toBe(FORMATO.length);
    expect(t).toContain('En atención del desarrollo de nuestros Sistemas de Gestión');
  });
  it('escapa los caracteres especiales del asunto', () => {
    const x = llenarDocumentoXml(XML_FORMATO, { ...D, asunto: 'Contratos <obra> & «vías»' }).xml;
    expect(x).toContain('Contratos &lt;obra&gt; &amp; «vías»');
  });
});

describe('plantilla con el cuerpo vacío (Despacho, Secretaría Privada)', () => {
  const r = llenarDocumentoXml(XML_VACIO, D);
  it('agrega el oficio completo DEBAJO del recuadro de ORFEO, sin tocarlo', () => {
    expect(r.modo).toBe('agregado');
    const t = visible(r.xml);
    expect(t.indexOf('Rad. Padre: *RAD_E_PADRE*')).toBeLessThan(
      t.indexOf('Doctor(a) [NOMBRE DEL TITULAR DEL ENTE]')
    );
    expect(t.indexOf('Revisó:')).toBeLessThan(t.indexOf('En atención del desarrollo'));
    expect(r.xml).toContain(RECUADRO);
    // 17 líneas del oficio + el recuadro + la encuesta (los renglones en blanco, <w:p/>, no cuentan)
    expect(parrafosPrincipales(r.xml).length).toBe(19);
  });
});

describe('el .docx completo', () => {
  it('cambia solo word/document.xml (membrete y pie intactos) y sigue siendo un .docx', () => {
    const plantilla = docx(XML_FORMATO);
    expect(pareceDocx(plantilla)).toBe(true);
    const r = llenarOficio(XLSX, plantilla, D);
    expect(pareceDocx(r.docx)).toBe(true);
    expect(leer(r.docx, 'word/footer1.xml')).toBe('<w:ftr>Piso 9</w:ftr>');
    expect(visible(leer(r.docx, 'word/document.xml'))).toContain(
      'Asunto: Respuesta al requerimiento radicado No. 2026EE004812'
    );
  });
  it('rechaza un archivo que no es Word', () => {
    expect(pareceDocx(new TextEncoder().encode('%PDF-1.7'))).toBe(false);
  });
  it('nombre del archivo sin caracteres raros', () => {
    expect(nombreOficio('2026EE004812', 'Secretaría de Gobierno')).toBe(
      'Respuesta_2026EE004812_Secretaría_de_Gobierno.docx'
    );
  });
});
