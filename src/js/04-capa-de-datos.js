/**
 * src/js/04-capa-de-datos.js
 * Capa de datos: objeto db con todas las lecturas y escrituras. Con Supabase usa la API real; sin conexión simula la base en memoria (DEMO) con auditoría equivalente.
 * Depende de: 01 (CFG), 02, 03 (S). En la variante privada usa HIST de 10.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   CAPA DE DATOS — Supabase real o modo demostración en memoria
   ===================================================================== */
const DEMO = {
  entes: [],
  deps: [],
  reqs: [],
  audit: [],
  profiles: [],
  alertas: [],
  cfg: { dias_rojo: 5, correo_disciplinario: '' }
};

function seedDemo() {
  const Y = new Date().getFullYear();
  DEMO.entes = [
    { id: 1, nombre: 'Contraloría General de la República', sigla: 'CGR', tipo: 'Fiscal', activo: true },
    {
      id: 2,
      nombre: 'Contraloría Distrital de Santiago de Cali',
      sigla: 'CDC',
      tipo: 'Fiscal',
      activo: true
    },
    {
      id: 3,
      nombre: 'Procuraduría General de la Nación',
      sigla: 'PGN',
      tipo: 'Ministerio Público',
      activo: true
    },
    {
      id: 4,
      nombre: 'Personería Distrital de Santiago de Cali',
      sigla: 'PDC',
      tipo: 'Ministerio Público',
      activo: true
    },
    { id: 5, nombre: 'Concejo Distrital de Santiago de Cali', sigla: 'CON', tipo: 'Político', activo: true }
  ];
  DEMO.deps = [
    {
      id: 1,
      nombre: 'Secretaría de Educación',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 2,
      nombre: 'Secretaría de Salud Pública',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 3,
      nombre: 'Secretaría de Infraestructura',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 4,
      nombre: 'Departamento Administrativo de Hacienda Municipal',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 5,
      nombre: 'Secretaría de Movilidad',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 6,
      nombre: 'Secretaría de Gobierno',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 7,
      nombre: 'Secretaría de Seguridad y Justicia',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    },
    {
      id: 8,
      nombre: 'Departamento Administrativo de Control Interno',
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    }
  ];
  {
    const have = new Set(DEMO.deps.map(d => d.nombre));
    let nid = DEMO.deps.length;
    mainOrgsAll().forEach(n => {
      if (!have.has(n))
        DEMO.deps.push({
          id: ++nid,
          nombre: n,
          secretario_nombre: '',
          correo: '',
          telefono: '',
          activo: true
        });
    });
  }
  // [ente, dep, asunto, diasDesdeRadicacion(neg), limite(offset), cerradoHace(null=abierto)]
  const seed = [
    [2, 1, 'Auditoría de cumplimiento de recursos PAE e infraestructura educativa.', -10, -1, null],
    [4, 2, 'Requerimiento sobre planta de personal asistencial en red hospitalaria oriente.', -9, 2, null],
    [1, 4, 'Solicitud de información sobre recursos SGP en educación y salud.', -8, 3, null],
    [3, 8, 'Seguimiento al plan de mejoramiento institucional.', -4, 5, null],
    [3, 3, 'Informe técnico sobre plan de manejo de tráfico en la Calle 5ta.', -6, 8, null],
    [4, 6, 'Traslado por competencia de derecho de petición ciudadano.', -2, 9, null],
    [2, 4, 'Reporte de ejecución presupuestal del trimestre.', -5, 11, null],
    [3, 5, 'Seguimiento a plan de acción sobre señalización vial.', -3, 14, null],
    [2, 1, 'Auditoría regular a la gestión contractual.', -40, -20, -22],
    [1, 4, 'Rendición de cuentas sobre recursos de regalías.', -60, -35, -37],
    [3, 2, 'Petición sobre atención en centros de salud del oriente.', -50, -30, -33],
    [4, 7, 'Informe sobre convivencia y seguridad en comunas.', -45, -25, -26]
  ];
  let n = 4800;
  DEMO.reqs = seed.map((s, i) => {
    const frad = addDays(s[3]);
    const closed = s[5] !== null;
    return {
      id: 'd' + (i + 1),
      radicado: parseD(frad).getFullYear() + 'EE' + String((n += 137)).padStart(6, '0'),
      vigencia: parseD(frad).getFullYear(),
      ente_id: s[0],
      dependencia_id: s[1],
      asunto: s[2],
      fecha_radicacion: frad,
      fecha_limite: addDays(s[4]),
      estado: closed ? 'cerrado' : 'abierto',
      orfeo_salida: closed ? String(Y) + '4143010000' + String(171 + i * 31).padStart(6, '0') : null,
      fecha_cierre: closed ? addDays(s[5]) : null,
      soporte_path: null,
      soporte_hash: null,
      escalado_at: null
    };
  });
  [
    [Y - 1, 'EE011203', 2, 1, 'Auditoría a la gestión contractual de la vigencia anterior.'],
    [Y - 1, 'EE022410', 3, 5, 'Seguimiento a señalización vial.'],
    [Y - 2, 'EE009812', 2, 3, 'Auditoría a obras de espacio público.']
  ].forEach((p, i) => {
    DEMO.reqs.push({
      id: 'h' + i,
      radicado: p[0] + p[1],
      vigencia: p[0],
      ente_id: p[2],
      dependencia_id: p[3],
      asunto: p[4],
      fecha_radicacion: p[0] + '-03-10',
      fecha_limite: p[0] + '-04-02',
      estado: 'cerrado',
      orfeo_salida: String(p[0]) + '412301000' + String(100 + i * 17).padStart(5, '0'),
      fecha_cierre: p[0] + '-03-30',
      soporte_path: null,
      soporte_hash: null,
      escalado_at: null
    });
  });
  DEMO.profiles = [
    {
      id: 'u1',
      email: 'admin@cali.gov.co',
      nombre: 'Administrador',
      rol: 'admin',
      dependencia_id: null,
      activo: true
    },
    {
      id: 'u2',
      email: 'despacho@cali.gov.co',
      nombre: 'Despacho del Alcalde',
      rol: 'alcalde',
      dependencia_id: null,
      activo: true
    },
    {
      id: 'u3',
      email: 'secretario.educacion@cali.gov.co',
      nombre: 'Secretario Educación',
      rol: 'secretario',
      dependencia_id: 1,
      activo: true
    },
    {
      id: 'u4',
      email: 'enlace.hacienda@cali.gov.co',
      nombre: 'Enlace Hacienda',
      rol: 'enlace',
      dependencia_id: 4,
      activo: true
    },
    {
      id: 'u5',
      email: 'controlinterno@cali.gov.co',
      nombre: 'Control Interno',
      rol: 'control_interno',
      dependencia_id: null,
      activo: true
    }
  ];
  if (ES_PRIVADA) {
    /* Variante privada: el módulo operativo se alimenta con los radicados reales del histórico */
    DEMO.entes = HIST.entes.map((n, i) => ({ id: i + 1, nombre: n, sigla: '', tipo: '', activo: true }));
    DEMO.deps = mainOrgsAll().map((n, i) => ({
      id: i + 1,
      nombre: n,
      secretario_nombre: '',
      correo: '',
      telefono: '',
      activo: true
    }));
    const eId = n => HIST.entes.indexOf(n) + 1,
      dId = n => (DEMO.deps.find(d => d.nombre === n) || {}).id;
    DEMO.reqs = HIST.rows
      .filter(r => MAIN_NIV.includes(r.niv) && r.opo !== 5 && r.fmax)
      .map(r => ({
        id: 'r' + r.i,
        radicado: r.orfE || r.rad || 'SIN-' + r.i,
        vigencia: r.v,
        ente_id: eId(r.ente),
        dependencia_id: dId(r.org),
        asunto: r.asu || '',
        fecha_radicacion: r.rec || r.fmax,
        fecha_limite: r.fmax,
        estado: r.opo === 2 || r.opo === 3 ? 'abierto' : 'cerrado',
        orfeo_salida: r.opo === 2 || r.opo === 3 ? null : r.orfR || null,
        fecha_cierre: r.opo === 2 || r.opo === 3 ? null : r.fresp || null,
        soporte_path: null,
        soporte_hash: null,
        escalado_at: null
      }));
    const dn = n => dId(n) || null;
    DEMO.profiles[2].dependencia_id = dn('Secretaría de Educación');
    DEMO.profiles[3].dependencia_id = dn('Departamento Administrativo de Hacienda Municipal');
  }
}

function diff(a, b) {
  const o = {};
  new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach(k => {
    if (JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]))
      o[k] = { de: (a || {})[k] === undefined ? null : a[k], a: (b || {})[k] === undefined ? null : b[k] };
  });
  return o;
}
async function demoAudit(tabla, accion, regId, payload, usuario, cambios) {
  const prev = DEMO.audit.length ? DEMO.audit[DEMO.audit.length - 1].hash : '0'.repeat(64);
  const ts = new Date().toISOString();
  const row = {
    id: DEMO.audit.length + 1,
    tabla,
    accion,
    registro_id: String(regId),
    usuario: usuario || 'demo@cali.gov.co',
    payload: JSON.parse(JSON.stringify(payload)),
    cambios: cambios || {},
    prev_hash: prev,
    created_at: ts
  };
  row.hash = await sha256Hex(
    [
      prev,
      tabla,
      accion,
      row.registro_id,
      row.usuario,
      ts,
      JSON.stringify(row.payload),
      JSON.stringify(row.cambios)
    ].join('|')
  );
  DEMO.audit.push(row);
}

const db = {
  async catalogs() {
    if (S.demo) {
      S.entes = DEMO.entes.slice();
      S.deps = DEMO.deps.slice();
      S.cfg = { ...DEMO.cfg };
      return;
    }
    const [e, d, c] = await Promise.all([
      sb.from('entes').select('*').order('nombre'),
      sb.from('dependencias').select('*').order('nombre'),
      sb.from('config').select('*').eq('id', 1).maybeSingle()
    ]);
    if (e.error) throw e.error;
    if (d.error) throw d.error;
    S.entes = e.data;
    S.deps = d.data;
    if (c.data) S.cfg = c.data;
  },
  async reqs(vig) {
    if (S.demo) {
      let list = DEMO.reqs.filter(r => r.vigencia === vig);
      if (['secretario', 'enlace'].includes(rol()) && S.profile.dependencia_id)
        list = list.filter(r => r.dependencia_id === S.profile.dependencia_id);
      return list.map(r => ({ ...r }));
    }
    let from = 0,
      out = [];
    for (;;) {
      const { data, error } = await sb
        .from('v_requerimientos')
        .select('*')
        .eq('vigencia', vig)
        .order('fecha_limite')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      out = out.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    return out;
  },
  async createReq(o) {
    if (S.demo) {
      if (DEMO.reqs.some(r => r.radicado === o.radicado))
        throw new Error('El radicado ' + o.radicado + ' ya existe');
      const r = {
        ...o,
        id: 'd' + Date.now(),
        estado: 'abierto',
        orfeo_salida: null,
        fecha_cierre: null,
        soporte_path: null,
        soporte_hash: null,
        escalado_at: null
      };
      DEMO.reqs.push(r);
      await demoAudit('requerimientos', 'INSERT', r.id, r, S.user.email);
      return r;
    }
    const { data, error } = await sb.from('requerimientos').insert(o).select().single();
    if (error) throw dbErr(error);
    return data;
  },
  async closeReq(r, orfeo, fecha, file) {
    let path = null,
      hash = null;
    if (file) {
      hash = await sha256Hex(await file.arrayBuffer());
    }
    if (S.demo) {
      if (DEMO.reqs.some(x => x.orfeo_salida === orfeo))
        throw new Error('El radicado ORFEO ' + orfeo + ' ya fue registrado en otro requerimiento');
      const t = DEMO.reqs.find(x => x.id === r.id);
      const antes = { ...t };
      Object.assign(t, {
        estado: 'cerrado',
        orfeo_salida: orfeo,
        fecha_cierre: fecha,
        soporte_hash: hash,
        soporte_path: file ? file.name : null
      });
      await demoAudit('requerimientos', 'UPDATE', t.id, t, S.user.email, diff(antes, t));
      return { hash };
    }
    if (file) {
      // Los radicados del histórico traen espacios, barras y tildes: el nombre del archivo se limpia
      const seguro = String(r.radicado)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .slice(0, 60);
      path = `${r.vigencia}/${seguro}_${Date.now()}.pdf`;
      const up = await sb.storage
        .from('soportes')
        .upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (up.error) throw new Error('No se pudo subir el PDF: ' + up.error.message);
    }
    const { error } = await sb.rpc('cerrar_requerimiento', {
      p_id: r.id,
      p_orfeo: orfeo,
      p_fecha: fecha,
      p_path: path,
      p_hash: hash
    });
    if (error) {
      if (path) await sb.storage.from('soportes').remove([path]);
      throw dbErr(error);
    }
    return { hash };
  },
  async escalate(r, canal) {
    if (S.demo) {
      const t = DEMO.reqs.find(x => x.id === r.id);
      t.escalado_at = new Date().toISOString();
      DEMO.alertas.push({ requerimiento_id: r.id, canal });
      await demoAudit(
        'alertas_log',
        'INSERT',
        DEMO.alertas.length,
        { requerimiento_id: r.id, canal },
        S.user.email
      );
      return;
    }
    const { error } = await sb.rpc('escalar_requerimiento', { p_id: r.id, p_canal: canal });
    if (error) throw dbErr(error);
  },
  async audit() {
    if (S.demo) return DEMO.audit.slice().reverse().slice(0, 300);
    const { data, error } = await sb
      .from('audit_log')
      .select('*')
      .order('id', { ascending: false })
      .limit(300);
    if (error) throw error;
    return data;
  },
  async verify() {
    if (S.demo) {
      let prev = '0'.repeat(64);
      for (let i = 0; i < DEMO.audit.length; i++) {
        const r = DEMO.audit[i];
        const calc = await sha256Hex(
          [
            prev,
            r.tabla,
            r.accion,
            r.registro_id,
            r.usuario,
            r.created_at,
            JSON.stringify(r.payload),
            JSON.stringify(r.cambios || {})
          ].join('|')
        );
        if (r.prev_hash !== prev || r.hash !== calc) return { ok: false, total: i + 1, primer_id_roto: r.id };
        prev = r.hash;
      }
      return { ok: true, total: DEMO.audit.length, primer_id_roto: null };
    }
    const { data, error } = await sb.rpc('verificar_cadena_auditoria');
    if (error) throw dbErr(error);
    return data[0];
  },
  /* Gestión de cuentas: en línea llama a la Edge Function gestion-cuentas (supabase/functions/);
     en demostración simula el mismo resultado sobre DEMO.profiles. Devuelve {ok, mensaje, id}. */
  async cuenta(accion, datos) {
    if (S.demo) {
      const P = DEMO.profiles,
        correo = String(datos.correo || '')
          .trim()
          .toLowerCase();
      let dep = null;
      if (datos.dependencia) {
        let d = DEMO.deps.find(x => orgKey(x.nombre) === orgKey(datos.dependencia));
        if (!d) {
          d = {
            id: Math.max(0, ...DEMO.deps.map(x => +x.id || 0)) + 1,
            nombre: datos.dependencia,
            secretario_nombre: '',
            correo: '',
            telefono: '',
            activo: true
          };
          DEMO.deps.push(d);
        }
        dep = d.id;
      }
      let r;
      if (accion === 'preparar') {
        let p = P.find(x => x.email === correo);
        if (!p) {
          p = { id: 'u' + (P.length + 1) + '_' + Date.now(), email: correo };
          P.push(p);
        }
        Object.assign(p, {
          nombre: datos.nombre,
          rol: datos.rol || 'secretario',
          dependencia_id: dep,
          activo: false
        });
        r = { ok: true, id: p.id, mensaje: `Cuenta preparada para ${correo}, sin activar (simulado).` };
      } else if (accion === 'activar_invitar') {
        const p = P.find(x => x.id === datos.id);
        if (!p) throw new Error('La cuenta no existe.');
        p.activo = true;
        r = { ok: true, mensaje: `Cuenta activada. Enlace enviado a ${p.email} (simulado).` };
      } else if (accion === 'invitar') {
        let p = P.find(x => x.email === correo);
        if (!p) {
          p = { id: 'u' + (P.length + 1) + '_' + Date.now(), email: correo };
          P.push(p);
        }
        Object.assign(p, {
          nombre: datos.nombre,
          rol: datos.rol || 'secretario',
          dependencia_id: dep,
          activo: true
        });
        r = {
          ok: true,
          id: p.id,
          mensaje: `Invitación enviada a ${correo} (simulada en modo demostración).`
        };
      } else if (accion === 'cambiar_correo') {
        if (P.some(x => x.email === correo && x.id !== datos.id))
          throw new Error('Ese correo ya pertenece a otra cuenta.');
        const p = P.find(x => x.id === datos.id);
        if (!p) throw new Error('La cuenta no existe.');
        Object.assign(p, { email: correo, nombre: datos.nombre, activo: true });
        r = {
          ok: true,
          mensaje: `La cuenta ahora es de ${correo}. El titular anterior ya no puede ingresar (simulado).`
        };
      } else if (accion === 'enlace_clave')
        r = { ok: true, mensaje: `Enlace enviado a ${correo} (simulado).` };
      else if (accion === 'activar' || accion === 'desactivar') {
        const p = P.find(x => x.id === datos.id);
        if (p) p.activo = accion === 'activar';
        r = { ok: true, mensaje: accion === 'activar' ? 'Cuenta activada.' : 'Cuenta desactivada.' };
      } else throw new Error('Acción desconocida.');
      await demoAudit('cuentas_eventos', 'INSERT', accion, { accion, ...datos }, S.user.email);
      return r;
    }
    const { data, error } = await sb.functions.invoke('gestion-cuentas', { body: { accion, ...datos } });
    if (error) {
      let msg = error.message;
      try {
        const j = await error.context.json();
        if (j && j.error) msg = j.error;
      } catch (e) {}
      if (/Failed to send|not found|404/i.test(msg))
        msg =
          'La función gestion-cuentas no está desplegada en Supabase (ver docs/DESPLIEGUE.md, sección Cuentas).';
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  },
  async profiles() {
    if (S.demo) return DEMO.profiles.map(p => ({ ...p }));
    const { data, error } = await sb.from('profiles').select('*').order('email');
    if (error) throw error;
    return data;
  },
  async saveProfile(p) {
    if (S.demo) {
      const t = DEMO.profiles.find(x => x.id === p.id);
      const antes = { ...t };
      Object.assign(t, p);
      await demoAudit('profiles', 'UPDATE', p.id, t, S.user.email, diff(antes, t));
      return;
    }
    const { id, ...rest } = p;
    const { error } = await sb.from('profiles').update(rest).eq('id', id);
    if (error) throw dbErr(error);
  },
  async saveCatalog(table, o) {
    const list = table === 'entes' ? DEMO.entes : DEMO.deps;
    if (S.demo) {
      const isUpd = !!o.id;
      let antes = {};
      if (isUpd) {
        const t = list.find(x => x.id === o.id);
        antes = { ...t };
        Object.assign(t, o);
      } else {
        o.id = Math.max(0, ...list.map(x => x.id)) + 1;
        list.push({ activo: true, ...o });
      }
      await demoAudit(
        table,
        isUpd ? 'UPDATE' : 'INSERT',
        o.id,
        o,
        S.user.email,
        isUpd
          ? diff(
              antes,
              list.find(x => x.id === o.id)
            )
          : {}
      );
      return;
    }
    const q = o.id ? sb.from(table).update(o).eq('id', o.id) : sb.from(table).insert(o);
    const { error } = await q;
    if (error) throw dbErr(error);
  },
  async saveConfig(c) {
    if (S.demo) {
      Object.assign(DEMO.cfg, c);
      return;
    }
    const { error } = await sb.from('config').update(c).eq('id', 1);
    if (error) throw dbErr(error);
  },
  async signedUrl(path) {
    const { data, error } = await sb.storage.from('soportes').createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }
};
function dbErr(e) {
  const m = e && e.message ? e.message : String(e);
  if (/duplicate key.*radicado/i.test(m)) return new Error('Ese radicado ya existe en el sistema');
  if (/duplicate key.*orfeo/i.test(m))
    return new Error('Ese radicado ORFEO ya fue registrado en otro requerimiento');
  if (/row-level security/i.test(m)) return new Error('Tu rol no tiene permiso para esta operación');
  if (/duplicate key/i.test(m)) return new Error('Ya existe un registro con esos datos');
  return new Error(m);
}
