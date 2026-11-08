/* Pruebas del aviso diario de planes de mejoramiento (supabase/functions/avisos-planes/reglas.js, la función y los
   scripts 24 y 25). Sin base de datos ni correo: `node tests/avisos-planes.test.cjs`. Todas las fechas son inventadas
   sobre el calendario real de 2026 (2-nov y 16-nov son festivos en Colombia). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
let n = 0; const ok = () => { n++; };

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

(async () => {
  const R = await import(pathToFileURL(path.join(RAIZ, 'supabase', 'functions', 'avisos-planes', 'reglas.js')).href);

  // --- 1. Calendario idéntico al de la app (src/js/02-utilidades.js), día por día de 2024 a 2031
  {
    const A = require('./cargar-app.cjs')(['esHabil', 'festivosCO']);
    let dias = 0, distintos = 0;
    for (let d = new Date(2024, 0, 1); d.getFullYear() <= 2031; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (R.esHabil(iso) !== A.esHabil(new Date(d))) distintos++;
      dias++;
    }
    assert.strictEqual(dias, 2922); ok();
    assert.strictEqual(distintos, 0, 'días hábiles distintos a los de la app'); ok();
    assert.strictEqual(R.festivos(2026).size, A.festivosCO(2026).size); ok();
  }

  // --- 2. Días hábiles, fecha de Colombia y cuándo corre la tarea
  assert.strictEqual(R.anteriorHabil('2026-11-03'), '2026-10-30'); ok(); // salta el fin de semana y el festivo del 2-nov
  assert.strictEqual(R.siguienteHabil('2026-10-30'), '2026-11-03'); ok();
  assert.strictEqual(R.siguienteHabil('2026-11-07'), '2026-11-09'); ok(); // sábado → lunes
  assert.strictEqual(R.anteriorHabil('2026-11-17'), '2026-11-13'); ok(); // salta el festivo del 16-nov
  assert.ok(!R.debeCorrer('2026-11-02') && !R.debeCorrer('2026-11-07') && !R.debeCorrer('2026-11-08')); ok();
  assert.ok(R.debeCorrer('2026-11-03') && R.debeCorrer('2026-11-06')); ok();
  assert.strictEqual(R.hoyColombia(new Date('2026-10-31T04:00:00Z')), '2026-10-30'); ok(); // 11:00 p. m. del 30 en Cali
  assert.strictEqual(R.hoyColombia(new Date('2026-10-31T05:00:00Z')), '2026-10-31'); ok(); // medianoche en Cali
  assert.strictEqual(R.masDias('2026-12-31', 1), '2027-01-01'); ok();

  // --- 3. Qué acciones se avisan
  const planes = new Map([['p1', { estado: 'en_ejecucion', formato: 'PM_01_CGSC' }], ['p2', { estado: 'cerrado' }], ['p3', { estado: 'en_ejecucion', formato: 'F14_CGR' }]]);
  const acc = (id, fecha_fin, extra = {}) => ({ id, plan_id: 'p1', hallazgo_id: 'h1', dependencia_id: 10, accion: 'Acción inventada ' + id,
    fecha_fin, avance: 10, cantidad: 100, ...extra });
  const elegir = (hoy, acciones, enviados = new Set()) => R.elegirAvisos({ hoy, acciones, planes, enviados });
  const ids = l => l.map(a => a.id).sort();
  {
    const A = [acc('martes', '2026-11-03'), acc('sabado', '2026-11-07'), acc('lejos', '2026-12-15')];
    // Viernes 30-oct: la del martes 3-nov (el lunes 2 es festivo) recibe el aviso previo
    assert.deepStrictEqual(ids(elegir('2026-10-30', A).previo), ['martes']); ok();
    assert.deepStrictEqual(ids(elegir('2026-10-29', A).previo), []); ok(); // aún no
    // Si el viernes no se pudo enviar, se envía el mismo día del vencimiento, pero nunca dos veces
    assert.deepStrictEqual(ids(elegir('2026-11-03', A).previo), ['martes']); ok();
    assert.deepStrictEqual(ids(elegir('2026-11-03', A, new Set([R.claveAviso('martes', 'previo', '2026-11-03')])).previo), []); ok();
    // Vence un sábado: previo el viernes 6, atraso el lunes 9
    assert.deepStrictEqual(ids(elegir('2026-11-06', A).previo), ['sabado']); ok();
    // (la del martes 3-nov ya recibió su aviso de atraso el 4-nov, por eso el 9-nov solo sale la del sábado)
    assert.deepStrictEqual(ids(elegir('2026-11-09', A, new Set([R.claveAviso('martes', 'atraso', '2026-11-03')])).atraso), ['sabado']); ok();
    assert.deepStrictEqual(ids(elegir('2026-11-09', A).atraso), ['martes', 'sabado']); ok(); // si no se hubiera enviado, sale
    assert.ok(!elegir('2026-11-08', A).atraso.some(a => a.id === 'sabado')); ok(); // domingo: para la del sábado aún no es el primer día hábil
    // Atraso: desde el primer día hábil después del vencimiento, solo dentro de los 7 días
    assert.deepStrictEqual(ids(elegir('2026-11-04', A).atraso), ['martes']); ok();
    assert.deepStrictEqual(ids(elegir('2026-11-10', A).atraso), ['martes', 'sabado']); ok(); // 3-nov está a 7 días: entra
    assert.deepStrictEqual(ids(elegir('2026-11-11', A).atraso), ['sabado']); ok(); // 3-nov ya pasó de 7 días: sale
    assert.deepStrictEqual(ids(elegir('2026-11-04', A, new Set([R.claveAviso('martes', 'atraso', '2026-11-03')])).atraso), []); ok();
    // Una acción lejana no se avisa
    assert.ok(!elegir('2026-11-04', A).previo.some(a => a.id === 'lejos')); ok();
  }
  {
    // Cumplida, plan cerrado y sin fecha: nunca
    const A = [acc('cumplida', '2026-11-03', { avance: 100 }), acc('cerrado', '2026-11-03', { plan_id: 'p2' }), acc('sinfecha', null)];
    const r = elegir('2026-10-30', A);
    assert.strictEqual(r.previo.length + r.atraso.length + r.sinDependencia.length, 0); ok();
    // Sin dependencia: no se avisa, pero se cuenta para mostrarlo
    const s = elegir('2026-10-30', [acc('huerfana', '2026-11-03', { dependencia_id: null })]);
    assert.strictEqual(s.previo.length, 0); ok();
    assert.deepStrictEqual(s.sinDependencia.map(a => [a.id, a.tipo]), [['huerfana', 'previo']]); ok();
    // Prórroga: con la fecha nueva se avisa otra vez, aunque ya se hubiera avisado con la fecha anterior
    const ya = new Set([R.claveAviso('pror', 'previo', '2026-11-03')]);
    assert.deepStrictEqual(ids(elegir('2026-11-03', [acc('pror', '2026-11-03')], ya).previo), []); ok();
    assert.deepStrictEqual(ids(elegir('2026-11-13', [acc('pror', '2026-11-17')], ya).previo), ['pror']); ok();
    // La fecha puede venir con hora (timestamptz convertido a texto): se usa solo el día
    assert.deepStrictEqual(ids(elegir('2026-10-30', [acc('conhora', '2026-11-03T00:00:00')]).previo), ['conhora']); ok();
  }

  // --- 4. Agrupar por dependencia, titular y correo de copia
  {
    const g = R.porDependencia({ previo: [acc('a', '2026-11-03'), acc('b', '2026-11-03', { dependencia_id: 20 })], atraso: [acc('c', '2026-10-28')] });
    assert.deepStrictEqual([...g.keys()].sort(), [10, 20]); ok();
    assert.deepStrictEqual([g.get(10).previo.length, g.get(10).atraso.length, g.get(20).previo.length], [1, 1, 1]); ok();
    const dir = [
      { organismo: 'Secretaría Inventada', cargo: 'Profesional', nombre: 'Persona Uno', correo: 'uno@cali.gov.co' },
      { organismo: 'Secretaría Inventada', cargo: 'Secretario(a)', nombre: 'Persona Dos', correo: 'DOS@cali.gov.co' },
      { organismo: 'Secretaría Inventada', cargo: 'Secretaria', nombre: 'Persona Tres', correo: 'tres@gmail.com' }
    ];
    assert.strictEqual(R.titularDe(dir, 'Secretaría Inventada').nombre, 'Persona Dos'); ok();
    assert.strictEqual(R.titularDe([dir[2]], 'Secretaría Inventada'), null); ok(); // solo correos @cali.gov.co
    assert.strictEqual(R.titularDe([dir[0]], 'Secretaría Inventada').nombre, 'Persona Uno'); ok(); // si no hay titular, el primero
    assert.ok(R.copiaValida('') && R.copiaValida('control.interno@cali.gov.co') && R.copiaValida(' Control.Interno@CALI.gov.co ')); ok();
    assert.ok(!R.copiaValida('alguien@gmail.com') && !R.copiaValida('x@cali.gov.co.otro.com')); ok();
  }

  // --- 5. El correo
  {
    const c = R.armarCorreo({
      dependencia: 'Secretaría Inventada', titular: { nombre: 'Persona <b>Dos</b>' },
      previo: [acc('a', '2026-11-03', { avance: 25, cantidad: 100 })],
      atraso: [acc('b', '2026-10-28', { plan_id: 'p3', hallazgo_id: 'h2', accion: 'Acción <script>x</script>' })],
      hallazgos: new Map([['h1', '1'], ['h2', '3.1']]), planes, sitio: 'https://ejemplo.invalido/control-entes/', hoy: '2026-10-30'
    });
    assert.ok(/^[\x20-\x7e]+$/.test(c.asunto) && c.asunto.length < 75); ok(); // sin tildes y corto (denomailer)
    assert.strictEqual(c.n, 2); ok();
    assert.ok(c.texto.includes('Acciones que vencen el próximo día hábil (1)') && c.texto.includes('Acciones vencidas sin cumplir (1)')); ok();
    assert.ok(c.texto.includes('termina 3 nov 2026; avance 25 %')); ok();
    assert.ok(c.texto.includes('Contraloría General de la República, hallazgo 3.1')); ok(); // formato F14
    assert.ok(c.texto.includes('Contraloría General de Santiago de Cali, hallazgo 1')); ok();
    assert.ok(c.texto.includes('https://ejemplo.invalido/control-entes/')); ok();
    assert.ok(!c.html.includes('<script>') && c.html.includes('&lt;script&gt;') && !c.html.includes('<b>Dos</b>')); ok(); // escapado
    const sinNombre = R.armarCorreo({ dependencia: 'D', titular: null, previo: [acc('a', '2026-11-03')], atraso: [], hallazgos: new Map(), planes, sitio: '', hoy: '2026-10-30' });
    assert.ok(sinNombre.texto.startsWith('Respetado(a) secretario(a) o director(a):') && !sinNombre.texto.includes('vencidas sin cumplir')); ok();
  }

  // --- 6. La función: apagada no exige el correo, reserva antes de enviar y libera si falla
  {
    const f = leer('supabase/functions/avisos-planes/index.ts');
    const i = s => { const k = f.indexOf(s); assert.ok(k >= 0, 'falta en la función: ' + s); return k; };
    assert.ok(i('!cfg?.avisos_activo') < i("Deno.env.get('SMTP_USER')")); ok(); // la casilla se revisa antes que los secretos
    assert.ok(i('debeCorrer(hoy)') < i("Deno.env.get('SMTP_USER')")); ok(); // festivos y fines de semana, antes del correo
    assert.ok(i("onConflict: 'accion_id,tipo,fecha_fin', ignoreDuplicates: true") < i('await smtp.send(')); ok(); // reservar, luego enviar
    assert.ok(i('await smtp.send(') < i(".from('pm_avisos').delete()")); ok(); // si falla, libera
    assert.ok(f.includes("...(copia ? { cc: copia } : {})")); ok(); // copia a Control Interno
    assert.ok(f.includes("from './reglas.js'")); ok();
    assert.ok(i('if (vistaPrevia) {') < i('await smtp.send(') && /vista_previa: true/.test(f)); ok(); // la vista previa no envía
  }

  // --- 7. Scripts 24 y 25
  {
    const s24 = leer('supabase/24_avisos_planes.sql'), s25 = leer('supabase/25_programar_avisos.sql');
    assert.ok(/avisos_activo boolean not null default false/.test(s24)); ok(); // apagado por defecto
    assert.ok(/constraint pm_avisos_unico unique \(accion_id, tipo, fecha_fin\)/.test(s24)); ok();
    assert.ok(/check \(avisos_copia_correo = '' or lower\(avisos_copia_correo\) ~ '\^\[a-z0-9\._%\+-\]\+@cali\\\.gov\\\.co\$'\)/.test(s24)); ok();
    assert.ok(/enable row level security/.test(s24) && /revoke all on public\.pm_avisos from anon, authenticated;/.test(s24)); ok();
    assert.ok(!/cron\./.test(s24) && !/vault\./.test(s24)); ok(); // el 24 no programa tareas
    const codigo25 = s25.replace(/--.*$/gm, ''); // sin comentarios (el encabezado explica cómo activarla después)
    assert.ok(/'0 12 \* \* 1-5'/.test(codigo25) && /active := false\)/.test(codigo25) && !/active := true/.test(codigo25)); ok(); // siempre apagada
    assert.ok(/vault\.decrypted_secrets/.test(s25) && !/https?:\/\/[a-z]/.test(s25.replace(/--.*$/gm, ''))); ok(); // sin dirección escrita
  }

  // --- 8. La versión para pegar en el panel une los dos archivos y sigue siendo código válido
  {
    const { unir } = await import(pathToFileURL(path.join(RAIZ, 'scripts', 'funcion-para-pegar.mjs')).href);
    const unido = unir('avisos-planes');
    assert.ok(!/from '\.\/reglas\.js'/.test(unido) && unido.includes('inicio de ./reglas.js')); ok();
    assert.ok(!/^export /m.test(unido)); ok();
    for (const f of ['elegirAvisos', 'armarCorreo', 'claveAviso', 'copiaValida', 'debeCorrer', 'hoyColombia', 'porDependencia', 'titularDe'])
      assert.ok(new RegExp(`^(const|function) ${f}\\b`, 'm').test(unido), `falta ${f}`), ok();
    const m = require('module');
    if (typeof m.stripTypeScriptTypes === 'function') {
      const os = require('os'), { spawnSync } = require('child_process');
      const tmp = path.join(os.tmpdir(), `avisos-unido-${process.pid}.mjs`);
      fs.writeFileSync(tmp, m.stripTypeScriptTypes(unido));
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      fs.unlinkSync(tmp);
      assert.strictEqual(r.status, 0, r.stderr); ok();
    }
  }

  console.log(`OK: ${n} verificaciones del aviso diario de planes de mejoramiento`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
