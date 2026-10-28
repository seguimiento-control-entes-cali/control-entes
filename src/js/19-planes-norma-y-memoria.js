/**
 * src/js/19-planes-norma-y-memoria.js
 * Reglas de las Resoluciones Reglamentarias de la Contraloría General de Santiago de Cali (CGSC) sobre planes
 * de mejoramiento, y memoria documental de la aplicación.
 *
 *  Norma (Res. 1000.30.00.24.043 del 17-jun-2024 y Res. 1000.30.00.24.003 del 16-ene-2024)
 *   - Resolución aplicable a cada plan (art. 19 y 20 de la 24.043) ............................... pmRes
 *   - Escala de calificación por acción: 24.043 → 0 o 2; 24.003 → 0, 1 o 2 (art. 12) ............. PM_RES
 *   - Plazo máximo de cada acción: 24.043 → 6 meses; 24.003 → 1 año (art. 5) ...................... PM_RES
 *   - Presentación del plan: 15 días hábiles desde la radicación del informe final (art. 7) ...... pmPresentacion
 *   - Informes semestrales: 15 días hábiles después del 30-jun y del 31-dic (art. 11) ............. pmInformes
 *   - Prórrogas: de presentación del plan o de un informe semestral (art. 15) y de una acción (16)  pmProrroga*
 *   - Nuevo plan por acciones con calificación inferior a 100 (art. 12, par. 5) .................. pmNuevoPlan*
 *   - Nombre del archivo para el SIA Contralorías (manual de la Oficina de Informática) ........... pmNombreSIA
 *
 *  Memoria
 *   - Archivo documental de cada plan (depósito privado «archivo», huella SHA-256, radicado ORFEO)  pmDoc*
 *   - Papelera: restaurar planes, hallazgos, acciones, traslados y documentos ...................... pmPapelera*
 *   - Integridad y respaldo de archivos (inventario y ZIP con manifiesto) ........................... archivo*
 *
 * Depende de: 02 (sumarHabiles, habilesEntre, sha256Hex), 19-planes-de-mejoramiento (PM, pmSave, pmCanEdit…).
 * Supabase: supabase/20_norma_cgsc_y_memoria.sql (sin ese script la aplicación oculta estas funciones).
 */

/* =====================================================================
   RESOLUCIÓN APLICABLE
   ===================================================================== */
const PM_RES = {
  '24.043': {
    nombre: 'Resolución Reglamentaria 1000.30.00.24.043 del 17 de junio de 2024',
    corta: 'Res. 24.043',
    escala: [2, 0],
    plazoMeses: 6,
    plazoTxt: 'seis (6) meses (art. 5)'
  },
  '24.003': {
    nombre: 'Resolución Reglamentaria 1000.30.00.24.003 del 16 de enero de 2024',
    corta: 'Res. 24.003',
    escala: [2, 1, 0],
    plazoMeses: 12,
    plazoTxt: 'un (1) año (art. 5)'
  },
  anterior: {
    nombre: 'Resolución anterior al 24 de enero de 2024 (verifique la aplicable)',
    corta: 'Resolución anterior',
    escala: [2, 1, 0],
    plazoMeses: null,
    plazoTxt: ''
  }
};
/* Igual a public.pm_resolucion_de() del script 20: planes presentados del 24-ene-2024 al 31-dic-2024 → 24.003;
   desde el 1-ene-2025 → 24.043 (se toma la fecha de suscripción); se puede fijar a mano en el plan. */
function pmRes(p) {
  if (!p || p.formato !== 'PM_01_CGSC') return '';
  if (p.resolucion) return p.resolucion;
  const f = p.fecha_suscripcion;
  if (!f || f >= '2025-01-01') return '24.043';
  if (f >= '2024-01-24') return '24.003';
  return 'anterior';
}
const pmResInfo = p => PM_RES[pmRes(p)] || null;

/* =====================================================================
   PRESENTACIÓN DEL PLAN (art. 7) E INFORMES SEMESTRALES (art. 11)
   ===================================================================== */
const PM_DIAS_PRESENTAR = 15;
const PM_DIAS_INFORME = 15;
const PM_DIAS_PRORROGA_PRESENTAR = 5; /* art. 15: máximo 5 días hábiles, pedida con 5 días hábiles de antelación */
const PM_DIAS_ANTELACION_ACCION = 15; /* art. 16: pedida 15 días hábiles antes del vencimiento */

function pmPresentacion(p) {
  if (!pmRes(p)) return null;
  const r = typeof pmReqDe === 'function' ? pmReqDe(p) : null;
  const base = p.fecha_radicacion_informe || (r && r.fecha_radicacion) || null;
  if (!base) return { base: null };
  const limiteNorma = sumarHabiles(base, PM_DIAS_PRESENTAR);
  const pr =
    (PM.pror || []).find(x => x.plan_id === p.id && x.tipo === 'presentacion' && x.estado !== 'negada') ||
    null;
  const limite = pr && pr.estado === 'concedida' ? pr.fecha_nueva : limiteNorma;
  const presentado = p.estado !== 'formulacion';
  return {
    base,
    limiteNorma,
    limite,
    prorroga: pr,
    presentado,
    tarde: presentado && p.fecha_suscripcion > limite,
    reqLimite: r && r.fecha_limite && r.fecha_limite !== limite ? r.fecha_limite : null
  };
}
/* Cortes del 30 de junio y 31 de diciembre desde la suscripción hasta el primero posterior a «hasta» */
function pmCortes(p, hasta) {
  if (!pmRes(p) || p.estado === 'formulacion' || !pmFecha(p.fecha_suscripcion)) return [];
  const out = [];
  for (let y = +p.fecha_suscripcion.slice(0, 4); y <= +hasta.slice(0, 4) + 1; y++)
    ['06-30', '12-31'].forEach(md => {
      const c = `${y}-${md}`;
      if (c >= p.fecha_suscripcion) out.push(c);
    });
  const i = out.findIndex(c => c > hasta);
  return i < 0 ? out : out.slice(0, i + 1);
}
function pmInformes(p, hoy) {
  hoy = hoy || pmHoy();
  return pmCortes(p, hoy).map(corte => {
    const inf = (PM.inf || []).find(x => x.plan_id === p.id && x.corte === corte) || null;
    const pr = (PM.pror || []).find(
      x => x.plan_id === p.id && x.tipo === 'informe' && x.corte === corte && x.estado !== 'negada'
    );
    const vence = pr && pr.estado === 'concedida' ? pr.fecha_nueva : sumarHabiles(corte, PM_DIAS_INFORME);
    let estado;
    if (inf) estado = inf.fecha_envio > vence ? 'tarde' : 'presentado';
    else if (p.estado === 'cerrado') estado = 'no_aplica';
    else if (corte > hoy) estado = 'futuro';
    else if (vence < hoy) estado = 'vencido';
    else estado = 'pendiente';
    return { corte, vence, inf, prorroga: pr || null, estado };
  });
}
const PM_INF_EST = {
  presentado: ['verde', 'Presentado'],
  tarde: ['amarillo', 'Presentado fuera de término'],
  pendiente: ['amarillo', 'Por presentar'],
  vencido: ['rojo', 'Vencido sin presentar'],
  futuro: ['neutral', 'Próximo corte'],
  no_aplica: ['neutral', 'Plan cerrado']
};

/* Tarjeta de plazos de la norma en el encabezado del plan */
function pmNormaHtml(p) {
  const ri = pmResInfo(p);
  if (!ri || !PM.v20) return '';
  const pres = pmPresentacion(p);
  const filas = [];
  if (pres && pres.base) {
    let txt = `Radicación del informe ${fmtD(pres.base)} · límite <b>${fmtD(pres.limite)}</b> (15 días hábiles, art. 7)`;
    if (pres.prorroga)
      txt +=
        pres.prorroga.estado === 'concedida'
          ? ` · prórroga concedida (art. 15; sin ella: ${fmtD(pres.limiteNorma)})`
          : ' · prórroga solicitada, pendiente de respuesta';
    let est;
    if (pres.presentado)
      est = pres.tarde
        ? '<span class="pill amarillo">Suscrito fuera de término</span>'
        : '<span class="pill verde">Presentado</span>';
    else {
      const d = daysUntil(pres.limite);
      est = `<span class="pill ${d < 0 ? 'rojo' : d <= 5 ? 'amarillo' : 'neutral'}">${d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : `Faltan ${d} d`}</span>`;
    }
    filas.push(
      `<div class="pm-norma-r"><span><small>Presentación del plan</small>${txt}${pres.reqLimite ? `<span class="pm-chip y">El oficio tiene registrada otra fecha límite: ${fmtD(pres.reqLimite)}</span>` : ''}</span>${est}${!pres.presentado && pmCanEdit() && !pres.prorroga ? `<button class="btn sm" data-act="pmProrPresentar">Prórroga</button>` : ''}${pres.prorroga && pres.prorroga.estado === 'solicitada' && pmCanEdit() ? `<button class="btn sm" data-act="pmProrResolver" data-id="${esc(pres.prorroga.id)}">Resolver prórroga</button>` : ''}</div>`
    );
  } else if (pres && !pres.base)
    filas.push(
      `<div class="pm-norma-r"><span><small>Presentación del plan</small>Registre la fecha de radicación del informe final (Editar plan) para controlar los 15 días hábiles del art. 7.</span></div>`
    );
  const infs = pmInformes(p).slice(-3);
  if (infs.length)
    filas.push(
      `<div class="pm-norma-r"><span><small>Informes semestrales de avance (art. 11)</small>${infs
        .map(i => {
          const [c, t] = PM_INF_EST[i.estado];
          return `<span class="pm-inf"><span class="pill ${c}">${t}</span> Corte ${fmtD(i.corte)} · vence ${fmtD(i.vence)}${i.inf ? ` · enviado ${fmtD(i.inf.fecha_envio)}${i.inf.radicado_orfeo ? ' · <span class="mono">' + esc(i.inf.radicado_orfeo) + '</span>' : ''}` : ''}${i.prorroga ? ` · prórroga ${i.prorroga.estado}` : ''}</span>`;
        })
        .join(
          ''
        )}</span>${pmCanEdit() ? `<button class="btn sm" data-act="pmInfModal">Registrar informe</button>` : ''}</div>`
    );
  return `<div class="pm-norma"><div class="pm-norma-h"><b>${esc(ri.nombre)}</b>${p.resolucion ? '' : '<span class="muted">aplicada según la fecha de suscripción</span>'}</div>${filas.join('')}</div>`;
}

/* Planes con informe semestral por presentar o vencido (pantalla principal) */
function pmInformesPendientes() {
  const hoy = pmHoy();
  const out = [];
  PM.planes.forEach(p =>
    pmInformes(p, hoy).forEach(i => {
      if (i.estado === 'vencido' || i.estado === 'pendiente') out.push({ p, ...i });
    })
  );
  return out.sort((a, b) => a.vence.localeCompare(b.vence));
}
function pmInformesHomeHtml() {
  if (!PM.v20 || pmScoped()) return '';
  const l = pmInformesPendientes();
  if (!l.length) return '';
  return `<div class="card"><h3>Informes semestrales de avance</h3><div class="sub">Se presentan dentro de los 15 días hábiles siguientes al 30 de junio y al 31 de diciembre (art. 11)</div>${l
    .map(
      i =>
        `<div class="list-row"><div style="flex:1;min-width:0"><b>${esc(shortTxt(i.p.ejercicio, 90))}</b><div class="muted" style="font-size:.76rem">Corte ${fmtD(i.corte)} · vence ${fmtD(i.vence)}</div></div><span class="pill ${PM_INF_EST[i.estado][0]}">${PM_INF_EST[i.estado][1]}</span><button class="btn sm" data-act="pmOpen" data-id="${esc(i.p.id)}">Abrir</button></div>`
    )
    .join('')}</div>`;
}

/* Registrar el envío de un informe semestral, con su archivo en el archivo documental */
function pmInfModal(p) {
  const pend = pmInformes(p).filter(i => !i.inf && i.estado !== 'futuro' && i.estado !== 'no_aplica');
  if (!pend.length) return toast('No hay informes semestrales por registrar en este plan');
  openModal({
    title: 'Registrar informe semestral de avance',
    body: `
      <div class="row2">
        ${pmF('pmInfCorte', 'Corte *', `<select id="pmInfCorte">${pend.map(i => `<option value="${i.corte}">${fmtD(i.corte)} (vence ${fmtD(i.vence)})</option>`).join('')}</select>`)}
        ${pmF('pmInfFecha', 'Fecha de envío *', pmIn('pmInfFecha', pmHoy(), `type="date" max="${pmHoy()}"`))}
      </div>
      <div class="row2">
        ${pmF('pmInfOrf', 'Radicado ORFEO del envío', pmIn('pmInfOrf', '', 'inputmode="numeric"'))}
        ${pmF('pmInfFile', 'Informe enviado (PDF o Excel)', '<input id="pmInfFile" type="file" accept=".pdf,.xlsx,.xls,application/pdf">')}
      </div>
      ${pmF('pmInfObs', 'Observaciones', pmTa('pmInfObs', '', 2))}
      <div class="hint">El archivo queda guardado en el archivo documental del plan, con su huella digital.</div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmInfGuardar" data-id="${esc(p.id)}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  });
}
async function pmInfGuardar(planId, btn) {
  const corte = $('#pmInfCorte').value,
    fecha = pmVal('pmInfFecha'),
    orf = pmVal('pmInfOrf').replace(/\D/g, ''),
    file = $('#pmInfFile').files[0];
  if (!pmFecha(fecha)) return toast('Indique la fecha de envío', 'err');
  if (fecha > pmHoy()) return toast('La fecha de envío no puede ser futura', 'err');
  if (orf && (orf.length < 10 || orf.length > 20))
    return toast('El radicado ORFEO debe tener entre 10 y 20 dígitos', 'err');
  if (btn) btn.disabled = true;
  try {
    let docId = null;
    if (file)
      docId = await pmDocSubir(file, {
        plan_id: planId,
        tipo: 'informe_avance',
        radicado_orfeo: orf,
        observaciones: 'Informe semestral con corte ' + fmtD(corte)
      });
    await pmSave(
      'inf',
      {
        plan_id: planId,
        corte,
        fecha_envio: fecha,
        radicado_orfeo: orf,
        documento_id: docId,
        observaciones: pmVal('pmInfObs')
      },
      null
    );
    closeModal();
    toast('Informe semestral registrado');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =====================================================================
   PRÓRROGAS (arts. 15 y 16). La aplicación verifica los requisitos y registra; la decisión es de la CGSC.
   ===================================================================== */
/* Requisitos de cada tipo de prórroga: [{ok, txt}] */
function pmProrRequisitos(tipo, ctx, f) {
  const r = [];
  const sol = f.fecha_solicitud,
    nueva = f.fecha_nueva;
  if (tipo === 'accion') {
    const a = ctx.a;
    const previa = (PM.pror || []).some(x => x.accion_id === a.id && x.estado !== 'negada');
    r.push({ ok: !previa, txt: 'Se solicita por una sola vez (art. 16)' });
    const pct = pmPct(a);
    r.push({
      ok: pct > 0.5,
      txt: `Más de la mitad de la meta cumplida con avance validado (hoy: ${pmPctTxt(pct)})`
    });
    const fin = a.fecha_fin_original || a.fecha_fin;
    const dias = Math.max(0, Math.round((parseD(fin) - parseD(a.fecha_inicio)) / 86400000));
    const max = iso(new Date(parseD(fin).getTime() + Math.ceil(dias * 0.3) * 86400000));
    r.push({
      ok: pmFecha(nueva) && nueva > a.fecha_fin && nueva <= max,
      txt: `Nueva fecha posterior a ${fmtD(a.fecha_fin)} y no mayor al 30 % del plazo inicial (máximo ${fmtD(max)})`
    });
    r.push({
      ok: pmFecha(sol) && habilesEntre(sol, a.fecha_fin) >= PM_DIAS_ANTELACION_ACCION,
      txt: `Solicitada al menos 15 días hábiles antes del vencimiento (${fmtD(a.fecha_fin)}): ${pmFecha(sol) ? habilesEntre(sol, a.fecha_fin) + ' días hábiles' : '—'}`
    });
  } else {
    const venc = ctx.venc;
    const previa = (PM.pror || []).some(
      x =>
        x.plan_id === ctx.p.id &&
        x.tipo === tipo &&
        x.estado !== 'negada' &&
        (tipo !== 'informe' || x.corte === ctx.corte)
    );
    const max = sumarHabiles(venc, PM_DIAS_PRORROGA_PRESENTAR);
    r.push({ ok: !previa, txt: 'Se solicita por una sola vez (art. 15)' });
    r.push({
      ok: pmFecha(sol) && habilesEntre(sol, venc) >= PM_DIAS_PRORROGA_PRESENTAR,
      txt: `Solicitada con al menos 5 días hábiles de antelación al vencimiento (${fmtD(venc)}): ${pmFecha(sol) ? habilesEntre(sol, venc) + ' días hábiles' : '—'}`
    });
    r.push({
      ok: pmFecha(nueva) && nueva > venc && nueva <= max,
      txt: `Prórroga de máximo 5 días hábiles (hasta ${fmtD(max)})`
    });
  }
  return r;
}
function pmProrModal(tipo, ctx) {
  const venc = tipo === 'accion' ? ctx.a.fecha_fin : ctx.venc;
  const titulo = {
    accion: 'Prórroga de la fecha de finalización (art. 16)',
    presentacion: 'Prórroga de presentación del plan (art. 15)',
    informe: 'Prórroga del informe semestral (art. 15)'
  }[tipo];
  PM.prorCtx = { tipo, ...ctx, venc };
  openModal({
    title: titulo,
    body: `
      ${tipo === 'accion' ? `<div class="muted" style="margin-bottom:8px">${esc(shortTxt(ctx.a.accion, 160))}</div>` : ''}
      <div class="row2">
        ${pmF('pmPrSol', 'Fecha de la solicitud *', pmIn('pmPrSol', pmHoy(), 'type="date"'))}
        ${pmF('pmPrNueva', 'Nueva fecha solicitada *', pmIn('pmPrNueva', '', 'type="date"'))}
      </div>
      ${pmF('pmPrRad', 'Radicado ORFEO de la solicitud', pmIn('pmPrRad', '', 'inputmode="numeric"'))}
      ${pmF('pmPrObs', 'Justificación', pmTa('pmPrObs', '', 2))}
      <div id="pmPrReq" class="pm-req-list"></div>
      <div class="hint">La aplicación verifica los requisitos y registra la solicitud; la decisión es de la Dirección Técnica de la CGSC y se registra después con «Resolver».</div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmProrGuardar"><i class="fa-solid fa-floppy-disk"></i> Registrar solicitud</button>`
  });
  const pinta = () => {
    const req = pmProrRequisitos(tipo, PM.prorCtx, {
      fecha_solicitud: pmVal('pmPrSol'),
      fecha_nueva: pmVal('pmPrNueva')
    });
    $('#pmPrReq').innerHTML = req
      .map(
        x =>
          `<div class="${x.ok ? 'ok' : 'no'}"><i class="fa-solid ${x.ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${esc(x.txt)}</div>`
      )
      .join('');
  };
  ['pmPrSol', 'pmPrNueva'].forEach(id => $('#' + id).addEventListener('input', pinta));
  pinta();
}
async function pmProrGuardar(btn) {
  const c = PM.prorCtx;
  if (!c) return;
  const f = { fecha_solicitud: pmVal('pmPrSol'), fecha_nueva: pmVal('pmPrNueva') };
  const req = pmProrRequisitos(c.tipo, c, f);
  const falla = req.filter(x => !x.ok);
  if (falla.length) return toast('No cumple: ' + falla.map(x => x.txt).join(' · '), 'err');
  const rad = pmVal('pmPrRad').replace(/\D/g, '');
  if (rad && (rad.length < 10 || rad.length > 20))
    return toast('El radicado ORFEO debe tener entre 10 y 20 dígitos', 'err');
  if (btn) btn.disabled = true;
  try {
    await pmSave(
      'pror',
      {
        plan_id: c.tipo === 'accion' ? c.a.plan_id : c.p.id,
        accion_id: c.tipo === 'accion' ? c.a.id : null,
        tipo: c.tipo,
        corte: c.tipo === 'informe' ? c.corte : null,
        fecha_solicitud: f.fecha_solicitud,
        radicado_solicitud: rad,
        fecha_vencimiento_anterior: c.venc,
        fecha_nueva: f.fecha_nueva,
        estado: 'solicitada',
        observaciones: pmVal('pmPrObs')
      },
      null
    );
    closeModal();
    toast('Solicitud de prórroga registrada');
    await pmRefresh();
  } catch (e) {
    toast(
      /una_accion|una_present|una_informe|duplicate/i.test(e.message)
        ? 'Ya existe una prórroga para este caso: solo se permite una vez'
        : e.message,
      'err'
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}
function pmProrResolverModal(pr) {
  openModal({
    title: 'Resolver la solicitud de prórroga',
    body: `<div class="muted" style="margin-bottom:8px">Solicitada el ${fmtD(pr.fecha_solicitud)}: de ${fmtD(pr.fecha_vencimiento_anterior)} a ${fmtD(pr.fecha_nueva)}.</div>
      <div class="row2">
        ${pmF('pmPrREst', 'Decisión de la CGSC *', '<select id="pmPrREst"><option value="concedida">Concedida</option><option value="negada">Negada</option></select>')}
        ${pmF('pmPrRFec', 'Fecha de la respuesta', pmIn('pmPrRFec', pmHoy(), `type="date" max="${pmHoy()}"`))}
      </div>
      ${pmF('pmPrRRad', 'Radicado ORFEO de la respuesta', pmIn('pmPrRRad', '', 'inputmode="numeric"'))}
      <div class="hint">Si se concede una prórroga de acción, la fecha de terminación cambia y se conserva la original.</div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmProrResolverOk" data-id="${esc(pr.id)}"><i class="fa-solid fa-check"></i> Guardar</button>`
  });
}
async function pmProrResolver(id, btn) {
  const estado = $('#pmPrREst').value,
    fecha = pmVal('pmPrRFec') || pmHoy(),
    rad = pmVal('pmPrRRad').replace(/\D/g, '');
  if (!pmCanEdit()) return toast('Solo Control Interno o el Super administrador registran prórrogas', 'err');
  if (btn) btn.disabled = true;
  try {
    if (S.demo || !sb) {
      const st = pmDemoStore(),
        pr = (st.pror || []).find(x => x.id === id);
      if (!pr || pr.estado !== 'solicitada') throw new Error('La prórroga ya fue resuelta');
      if (estado === 'concedida' && pr.tipo === 'accion') {
        const a = st.acc.find(x => x.id === pr.accion_id);
        const req = pmProrRequisitos(
          'accion',
          { a: { ...a } },
          { fecha_solicitud: pr.fecha_solicitud, fecha_nueva: pr.fecha_nueva }
        );
        if (!req[1].ok)
          throw new Error(
            'Artículo 16: la prórroga exige haber cumplido más de la mitad de la meta (avance validado)'
          );
        if (!req[2].ok)
          throw new Error(
            'Artículo 16: el nuevo plazo no puede superar el 30 % del inicialmente establecido'
          );
        a.fecha_fin_original = a.fecha_fin_original || a.fecha_fin;
        a.fecha_fin = pr.fecha_nueva;
      }
      Object.assign(pr, { estado, radicado_respuesta: rad, fecha_respuesta: fecha });
      await demoAudit('pm_prorrogas', 'UPDATE', id, pr, pmUser());
      pmDemoSave();
    } else {
      const { error } = await sb.rpc('pm_resolver_prorroga', {
        p_id: id,
        p_estado: estado,
        p_radicado: rad,
        p_fecha: fecha
      });
      if (error) throw pmErr(error);
    }
    closeModal();
    toast(estado === 'concedida' ? 'Prórroga concedida registrada' : 'Prórroga negada registrada');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
/* Línea de la prórroga en la fila de una acción */
function pmProrLinea(a) {
  const pr = (PM.pror || [])
    .filter(x => x.accion_id === a.id)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
  if (!pr) return '';
  const t =
    pr.estado === 'concedida'
      ? `Prórroga concedida (art. 16): termina ${fmtD(a.fecha_fin)}; fecha original ${fmtD(a.fecha_fin_original || pr.fecha_vencimiento_anterior)}`
      : pr.estado === 'negada'
        ? `Prórroga negada (solicitada hasta ${fmtD(pr.fecha_nueva)})`
        : `Prórroga solicitada hasta ${fmtD(pr.fecha_nueva)}, pendiente de respuesta de la CGSC`;
  return `<div class="pm-a-l"><i class="fa-solid fa-calendar-plus"></i> ${esc(t)}${pr.estado === 'solicitada' && pmCanEdit() ? ` <button class="btn sm" data-act="pmProrResolver" data-id="${esc(pr.id)}">Resolver</button>` : ''}</div>`;
}
const pmPuedeProrrogar = a => {
  const p = PM.planes.find(x => x.id === a.plan_id);
  return (
    pmCanEdit() &&
    PM.v20 &&
    pmRes(p) &&
    p.estado === 'en_ejecucion' &&
    pmPct(a) < 1 &&
    !(PM.pror || []).some(x => x.accion_id === a.id && x.estado !== 'negada')
  );
};

/* =====================================================================
   NUEVO PLAN POR ACCIONES CON CALIFICACIÓN INFERIOR A 100 (art. 12, par. 5)
   ===================================================================== */
/* Una acción obtiene 100 puntos solo con cumplimiento 2 y efectividad 2 */
function pmAccionesBajo100(p) {
  const fev = PM.eval || pmHoy();
  return PM.acc.filter(a => {
    if (a.plan_id !== p.id) return false;
    const r = pmCalAcc(a, fev);
    return r.c != null && r.e != null && !(r.c === 2 && r.e === 2);
  });
}
function pmNuevoPlanModal(p) {
  const l = pmAccionesBajo100(p);
  if (!l.length) return toast('No hay acciones calificadas con menos de 100 puntos');
  const res = pmRes(p);
  const hoy = pmHoy();
  const dur = a =>
    Math.max(
      1,
      Math.round((parseD(a.fecha_fin_original || a.fecha_fin) - parseD(a.fecha_inicio)) / 86400000)
    );
  const nuevaFin = a => iso(new Date(parseD(hoy).getTime() + Math.ceil(dur(a) * 0.3) * 86400000));
  openModal({
    title: 'Nuevo plan por acciones con calificación inferior a 100 (art. 12, par. 5)',
    wide: true,
    body: `<div class="pm-note ${res === '24.043' ? 'b' : 'y'}">${
      res === '24.043'
        ? 'Resolución 24.043: el nuevo plan se suscribe con el 30 % del tiempo inicialmente dispuesto para cada acción. Las fechas propuestas ya aplican esa regla.'
        : 'Resolución 24.003: el nuevo plan se suscribe con la Oficina de Control Interno, conforme al mecanismo adoptado internamente. Revise las fechas propuestas.'
    }</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Hallazgo</th><th>Acción</th><th>Cumpl.</th><th>Efect.</th><th>Nueva fecha de terminación</th></tr></thead><tbody>${l
        .map(a => {
          const h = pmHallOf(a.hallazgo_id),
            r = pmCalAcc(a, PM.eval || hoy);
          return `<tr><td class="mono">${esc(h ? h.numero : '')}</td><td class="asunto">${esc(shortTxt(a.accion, 110))}</td><td class="mono">${r.c}</td><td class="mono">${r.e}</td><td>${res === '24.043' ? fmtD(nuevaFin(a)) + ` <span class="muted">(30 % de ${dur(a)} días)</span>` : fmtD(iso(new Date(parseD(hoy).getTime() + dur(a) * 86400000)))}</td></tr>`;
        })
        .join('')}</tbody></table></div>
      <div class="hint">Se crea un plan «En formulación» enlazado a este, con los hallazgos y las acciones copiados para que Control Interno los ajuste, apruebe y suscriba.</div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmNuevoPlanOk" data-id="${esc(p.id)}"><i class="fa-solid fa-copy"></i> Crear el nuevo plan</button>`
  });
}
async function pmNuevoPlanCrear(planId, btn) {
  const p = pmPlanOf(planId);
  const l = pmAccionesBajo100(p);
  const res = pmRes(p),
    hoy = pmHoy();
  const dur = a =>
    Math.max(
      1,
      Math.round((parseD(a.fecha_fin_original || a.fecha_fin) - parseD(a.fecha_inicio)) / 86400000)
    );
  const fin = a =>
    iso(new Date(parseD(hoy).getTime() + (res === '24.043' ? Math.ceil(dur(a) * 0.3) : dur(a)) * 86400000));
  const porHall = {};
  l.forEach(a => (porHall[a.hallazgo_id] = porHall[a.hallazgo_id] || []).push(a));
  const payload = {
    archivo: 'nuevo plan (art. 12, par. 5)',
    plan: {
      formato: p.formato,
      contraloria: p.contraloria,
      ente_id: p.ente_id || null,
      entidad: p.entidad,
      nit: p.nit || '',
      representante_legal: p.representante_legal || '',
      ordenador_gasto: p.ordenador_gasto || '',
      ejercicio: 'Nuevo plan (art. 12, par. 5) · ' + p.ejercicio,
      tipo_ejercicio: p.tipo_ejercicio || '',
      modalidad: p.modalidad || '',
      vigencia_pvcft: p.vigencia_pvcft || '',
      periodo_auditado: p.periodo_auditado || '',
      numero_informe: p.numero_informe || '',
      radicado_orfeo: '',
      fecha_informe: p.fecha_informe || null,
      fecha_suscripcion: hoy,
      estado: 'formulacion',
      resolucion: p.resolucion || '',
      plan_origen_id: p.id,
      direccion_tecnica: p.direccion_tecnica || '',
      observaciones: `Acciones con calificación inferior a 100 puntos en el plan «${p.ejercicio}».`
    },
    hallazgos: Object.keys(porHall).map(hid => {
      const h = pmHallOf(hid);
      return {
        numero: h.numero,
        descripcion: h.descripcion,
        causa: h.causa || '',
        efecto: h.efecto || '',
        connotaciones: h.connotaciones || [],
        cuantia: h.cuantia,
        macroproceso: h.macroproceso || '',
        dependencia_id: h.dependencia_id || null,
        dependencia_texto: h.dependencia_texto || '',
        acciones: porHall[hid].map(a => ({
          dependencia_id: a.dependencia_id || null,
          responsable: a.responsable || '',
          accion: a.accion,
          proposito: a.proposito || '',
          actividad: a.actividad || '',
          meta: a.meta || '',
          unidad_medida: a.unidad_medida || 'Unidades',
          cantidad: a.cantidad,
          fuente_verificacion: a.fuente_verificacion || '',
          lugar_verificacion: a.lugar_verificacion || '',
          fecha_inicio: hoy,
          fecha_fin: fin(a),
          avance: null,
          fecha_corte: null,
          descripcion_avance: '',
          obs_ci: ''
        }))
      };
    })
  };
  if (btn) btn.disabled = true;
  try {
    const id = await pmImportar(payload);
    closeModal();
    toast('Nuevo plan creado en formulación');
    PM.plan = id;
    PM.tab = 'acciones';
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =====================================================================
   NOMBRE DEL ARCHIVO PARA EL SIA CONTRALORÍAS
   Manual «Subida de planes de mejoramiento» (CGSC, Oficina de Informática): el anexo se sube con la estructura
   FORMATO_202001_PM_CGSC_Nombre_anexo; si el nombre no la sigue, no aparece en el período 202001.
   ===================================================================== */
function pmSiglaTipo(p) {
  const t = pmKey((p.tipo_ejercicio || '') + ' ' + (p.ejercicio || ''));
  if (/aef ?df|denuncia/.test(t)) return 'AEFDF';
  if (/aef ?ta|tema o asunto/.test(t)) return 'AEFTA';
  if (/actuacion especial/.test(t)) return 'AEF';
  if (/abreviada|afgra/.test(t)) return 'AFGRA';
  if (/financiera/.test(t)) return 'AFGR';
  if (/desempeno/.test(t)) return 'AD';
  if (/cumplimiento/.test(t)) return 'AC';
  if (/cierre fiscal/.test(t)) return 'CIERRE';
  return 'PM';
}
function pmNombreSIA(p, opts) {
  opts = opts || {};
  const base = opts.corte || p.fecha_suscripcion || pmHoy();
  const ym = base.slice(0, 4) + base.slice(5, 7);
  /* número de la actuación y su año: «Denuncia Fiscal Nº 896, vigencia 2025» o «896-2025» → _896_2025 */
  const t = pmTxt(p.ejercicio) + ' ' + pmTxt(p.vigencia_pvcft);
  let num = '';
  for (const m of t.matchAll(/\b(\d{1,5})\b/g)) {
    if (/^20\d{2}$/.test(m[1])) continue;
    const y = /\b(20\d{2})\b/.exec(t.slice(m.index + m[0].length, m.index + m[0].length + 60));
    if (y) {
      num = `_${m[1]}_${y[1]}`;
      break;
    }
  }
  const sufijo = opts.avance ? '_AVANCE' : '';
  return `FORMATO_202001_PM_CGSC_${ym}_${pmSiglaTipo(p)}${num}${sufijo}.xlsx`.replace(/[^A-Za-z0-9_.-]/g, '');
}

/* =====================================================================
   INFORME SEMESTRAL DE AVANCE (art. 11): columnas 1 a 15 del art. 5 y 16, 17 y 18
   ===================================================================== */
function pmSheetAvanceSemestral(X, p, corte) {
  const datos = pmPlanData(p);
  const aoa = [
    ['CONTRALORÍA GENERAL DE SANTIAGO DE CALI'],
    ['FORMATO PM_01 CGSC - PLAN DE MEJORAMIENTO · INFORME SEMESTRAL DE AVANCE'],
    [],
    ['Entidad auditada (1): ' + (p.entidad || '')],
    ['Nombre de la actuación de control fiscal (2): ' + (p.ejercicio || '')],
    ['Tipo de actuación de control fiscal (3): ' + (p.tipo_ejercicio || '')],
    [
      'Fecha de suscripción (4): ' + fmtD(p.fecha_suscripcion),
      '',
      '',
      '',
      '',
      '',
      '',
      'Vigencia PVCFT (5)',
      p.vigencia_pvcft || ''
    ],
    [],
    [
      'FORMULACIÓN DEL PLAN DE MEJORAMIENTO',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'AVANCE DEL PLAN DE MEJORAMIENTO'
    ],
    [
      'N° hallazgo (6)',
      'Descripción de la condición y causa del hallazgo (7)',
      'Connotación del hallazgo (8)',
      'Macroproceso, criterio u otro (9)',
      'Acción correctiva (10)',
      'Meta (11)',
      'Fuente de verificación (12)',
      'Lugar de verificación (13)',
      'Fecha terminación de la actividad (14)',
      'Responsable (Nombre y Cargo) (15)',
      'Descripción del avance de ejecución (16)',
      'Fecha de corte del avance (17)',
      'Porcentaje de avance (18)'
    ]
  ];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 9 } },
    { s: { r: 8, c: 10 }, e: { r: 8, c: 12 } }
  ];
  const fechas = [],
    pcts = [];
  datos.forEach(({ h, acc }) => {
    const r0 = aoa.length;
    (acc.length ? acc : [null]).forEach(a => {
      const av = a ? pmAvAl(a, corte) : null;
      if (a) fechas.push([aoa.length, 8]);
      if (a) fechas.push([aoa.length, 11]);
      if (a) pcts.push([aoa.length, 12]);
      aoa.push([
        h.numero,
        [
          pmTxt(h.descripcion),
          h.causa && !pmKey(h.descripcion).includes(pmKey(h.causa).slice(0, 40)) ? 'Causa: ' + h.causa : ''
        ]
          .filter(Boolean)
          .join('\n'),
        pmConnPM01(h),
        h.macroproceso || '',
        a ? a.accion : '',
        a ? pmMetaTxt(a) : '',
        a ? a.fuente_verificacion || '' : '',
        a ? a.lugar_verificacion || '' : '',
        a && pmFecha(a.fecha_fin) ? pmXDate(a.fecha_fin) : '',
        a ? pmRespTxt(a) : '',
        av ? av.descripcion || '' : '',
        a ? pmXDate(corte) : '',
        a ? (av ? pmPct(a, av.cantidad) : 0) : ''
      ]);
    });
    if (aoa.length - r0 > 1)
      for (let c = 0; c <= 3; c++) merges.push({ s: { r: r0, c }, e: { r: aoa.length - 1, c } });
  });
  aoa.push([], [], ['______________________________', '', '', '', '', '', '______________________________']);
  aoa.push([p.representante_legal || '', '', '', '', '', '', p.ordenador_gasto || '']);
  aoa.push([
    'Nombre y firma del Representante Legal',
    '',
    '',
    '',
    '',
    '',
    'Jefe de Control Interno (copia, art. 11)'
  ]);
  const ws = X.utils.aoa_to_sheet(aoa);
  fechas.forEach(([r, c]) => {
    const k = X.utils.encode_cell({ r, c });
    if (ws[k] && ws[k].v !== '') Object.assign(ws[k], { t: 'n', z: 'dd/mm/yyyy' });
  });
  pcts.forEach(([r, c]) => {
    const k = X.utils.encode_cell({ r, c });
    if (ws[k] && ws[k].v !== '') Object.assign(ws[k], { t: 'n', z: '0%' });
  });
  ws['!merges'] = merges;
  ws['!cols'] = [10, 60, 22, 18, 45, 28, 28, 22, 14, 32, 50, 14, 12].map(w => ({ wch: w }));
  return ws;
}

/* =====================================================================
   ARCHIVO DOCUMENTAL (memoria de cada plan)
   ===================================================================== */
const PM_DOC_TIPOS = {
  informe_final: 'Informe final',
  plan_excel: 'Plan en Excel',
  formato_exportado: 'Formato exportado',
  informe_avance: 'Informe semestral de avance',
  oficio: 'Oficio',
  soporte: 'Soporte',
  otro: 'Otro'
};
const PM_DOC_MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv'
};
const PM_DOC_MAX = 50 * 1024 * 1024;
/* contenido de los documentos en la demostración (no se guardan en ningún servidor) */
const PM_DEMO_ARCHIVOS = {};
const pmDocNombreSeguro = n =>
  pmTxt(n)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(-120) || 'documento';
/* Sube un archivo (File o Blob con nombre) al depósito «archivo» y lo registra con su huella SHA-256 */
async function pmDocSubir(file, meta) {
  if (!PM.v20) return null;
  const nombre = meta.nombre || file.name || 'documento';
  const ext = (nombre.split('.').pop() || '').toLowerCase();
  const mime = PM_DOC_MIME[ext];
  if (!mime) throw new Error('Tipo de archivo no permitido: use PDF, Excel, Word o CSV');
  if (file.size > PM_DOC_MAX) throw new Error('El archivo supera 50 MB');
  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const yo = (S.user || {}).email || '';
  const path = `${meta.plan_id || 'general'}/${pmHoy().slice(0, 4)}/${Date.now().toString(36)}-${pmDocNombreSeguro(nombre)}`;
  const fila = {
    plan_id: meta.plan_id || null,
    requerimiento_id: meta.requerimiento_id || null,
    tipo: meta.tipo || 'otro',
    nombre,
    path,
    mime,
    tamano: file.size,
    sha256: sha,
    radicado_orfeo: meta.radicado_orfeo || '',
    observaciones: meta.observaciones || '',
    subido_email: yo
  };
  if (S.demo || !sb) {
    PM_DEMO_ARCHIVOS[path] = new Blob([buf], { type: mime });
    return await pmSave('doc', fila, null);
  }
  const { error: eUp } = await sb.storage
    .from('archivo')
    .upload(path, new Blob([buf], { type: mime }), { contentType: mime, upsert: false });
  if (eUp) throw new Error('No se pudo guardar el archivo: ' + eUp.message);
  try {
    return await pmSave('doc', fila, null);
  } catch (e) {
    await sb.storage.from('archivo').remove([path]);
    throw e;
  }
}
/* Guarda una copia sin interrumpir lo principal: si falla, avisa pero no deshace la operación */
async function pmDocCopia(file, meta) {
  try {
    if (file && PM.v20) await pmDocSubir(file, meta);
  } catch (e) {
    toast(
      'La operación se hizo, pero no se pudo guardar la copia en el archivo documental: ' + e.message,
      'err'
    );
  }
}
async function pmDocBlob(d) {
  if (S.demo || !sb) {
    const b = PM_DEMO_ARCHIVOS[d.path];
    if (!b) throw new Error('En la demostración, el contenido solo existe durante la sesión');
    return b;
  }
  const { data, error } = await sb.storage.from('archivo').download(d.path);
  if (error) throw new Error('No se pudo descargar: ' + error.message);
  return data;
}
async function pmDocDescargar(id) {
  const d = (PM.docs || []).find(x => x.id === id);
  if (!d) return;
  try {
    const b = await pmDocBlob(d);
    const sha = await sha256Hex(await b.arrayBuffer());
    if (sha !== d.sha256)
      toast('Atención: la huella digital del archivo no coincide con la registrada', 'err');
    const u = URL.createObjectURL(b);
    const aEl = document.createElement('a');
    aEl.href = u;
    aEl.download = d.nombre;
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch (e) {
    toast(e.message, 'err');
  }
}
function pmTabDocumentos(p) {
  if (!PM.v20)
    return `<div class="card"><div class="empty"><i class="fa-solid fa-box-archive"></i>El archivo documental estará disponible al ejecutar el script <span class="mono">20_norma_cgsc_y_memoria.sql</span>.</div></div>`;
  const l = (PM.docs || [])
    .filter(d => d.plan_id === p.id && !d.eliminado_at)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return `<div class="card">
    <div class="toolbar"><div class="sub" style="flex:1">Copias de trabajo con su huella digital (SHA-256). El archivo oficial sigue siendo ORFEO; cada documento conserva su radicado.</div>${pmCanEdit() ? `<button class="btn sm primary" data-act="pmDocNuevo"><i class="fa-solid fa-upload"></i> Subir documento</button>` : ''}</div>
    ${
      l.length
        ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo</th><th>Documento</th><th>Radicado</th><th>Guardado</th><th>Huella</th><th></th></tr></thead><tbody>${l
            .map(
              d =>
                `<tr><td>${esc(PM_DOC_TIPOS[d.tipo] || d.tipo)}</td><td class="asunto">${esc(d.nombre)}${d.observaciones ? `<div class="muted" style="font-size:.72rem">${esc(shortTxt(d.observaciones, 90))}</div>` : ''}</td><td class="mono">${esc(d.radicado_orfeo || '—')}</td><td>${fmtTs(d.created_at)}<div class="muted" style="font-size:.72rem">${esc(d.subido_email || '')}</div></td><td class="mono" title="${esc(d.sha256)}">${esc(d.sha256.slice(0, 12))}…</td><td style="white-space:nowrap"><button class="btn sm" data-act="pmDocBajar" data-id="${esc(d.id)}"><i class="fa-solid fa-download"></i> Descargar</button>${pmCanEdit() ? ` <button class="icon-btn" data-act="pmDocPapelera" data-id="${esc(d.id)}" title="Enviar a la papelera" aria-label="Enviar a la papelera"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        : '<div class="empty"><i class="fa-solid fa-box-archive"></i>Aún no hay documentos. Al importar el informe o el plan, y al exportar el formato, se guarda una copia aquí.</div>'
    }</div>`;
}
function pmDocNuevoModal(p) {
  openModal({
    title: 'Subir documento al archivo del plan',
    body: `
      <div class="row2">
        ${pmF(
          'pmDocTipo',
          'Tipo *',
          `<select id="pmDocTipo">${Object.entries(PM_DOC_TIPOS)
            .map(([k, v]) => `<option value="${k}"${k === 'oficio' ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>`
        )}
        ${pmF('pmDocOrf', 'Radicado ORFEO', pmIn('pmDocOrf', '', 'inputmode="numeric"'))}
      </div>
      ${pmF('pmDocFile', 'Archivo (PDF, Excel, Word o CSV; máx. 50 MB) *', '<input id="pmDocFile" type="file" accept=".pdf,.xlsx,.xls,.docx,.csv">')}
      ${pmF('pmDocObs', 'Descripción', pmTa('pmDocObs', '', 2))}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmDocGuardar" data-id="${esc(p.id)}"><i class="fa-solid fa-upload"></i> Subir</button>`
  });
}
async function pmDocGuardar(planId, btn) {
  const f = $('#pmDocFile').files[0];
  if (!f) return toast('Elija el archivo', 'err');
  const orf = pmVal('pmDocOrf').replace(/\D/g, '');
  if (orf && (orf.length < 10 || orf.length > 20))
    return toast('El radicado ORFEO debe tener entre 10 y 20 dígitos', 'err');
  if (btn) btn.disabled = true;
  try {
    await pmDocSubir(f, {
      plan_id: planId,
      tipo: $('#pmDocTipo').value,
      radicado_orfeo: orf,
      observaciones: pmVal('pmDocObs')
    });
    closeModal();
    toast('Documento guardado en el archivo del plan');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function pmDocMover(id, aPapelera) {
  try {
    await pmSave('doc', { eliminado_at: aPapelera ? new Date().toISOString() : null }, id);
    toast(aPapelera ? 'Documento enviado a la papelera' : 'Documento restaurado');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}
/* Borrado definitivo: solo el Super administrador y solo desde la papelera */
async function pmDocPurgar(id) {
  const d = (PM.docs || []).find(x => x.id === id);
  if (!d || !d.eliminado_at) return;
  if (rol() !== 'admin')
    return toast('Solo el Super administrador elimina documentos definitivamente', 'err');
  if (!confirm(`¿Eliminar definitivamente «${d.nombre}»? No se podrá recuperar desde la aplicación.`)) return;
  try {
    if (S.demo || !sb) {
      const st = pmDemoStore();
      st.docs = (st.docs || []).filter(x => x.id !== id);
      delete PM_DEMO_ARCHIVOS[d.path];
      await demoAudit('archivo_documentos', 'DELETE', id, d, pmUser());
      pmDemoSave();
    } else {
      const { error } = await sb.from('archivo_documentos').delete().eq('id', id);
      if (error) throw pmErr(error);
      await sb.storage.from('archivo').remove([d.path]);
    }
    toast('Documento eliminado definitivamente');
    await pmRefresh();
    pmPapeleraModal();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* =====================================================================
   PAPELERA
   ===================================================================== */
const PM_PAP_TIPO = {
  pm_planes: 'Plan',
  pm_hallazgos: 'Hallazgo',
  pm_acciones: 'Acción',
  pm_traslados: 'Traslado'
};
async function pmPapeleraCargar() {
  if (S.demo || !sb) {
    const st = pmDemoStore();
    return (st.papelera || []).filter(x => !x.restaurado);
  }
  const { data, error } = await sb.rpc('pm_papelera');
  if (error) throw pmErr(error);
  return data || [];
}
async function pmPapeleraModal() {
  if (!pmCanEdit()) return;
  let l = [];
  try {
    l = await pmPapeleraCargar();
  } catch (e) {
    return toast(e.message, 'err');
  }
  const docs = (PM.docs || []).filter(d => d.eliminado_at);
  openModal({
    title: 'Papelera',
    wide: true,
    body: `<div class="hint" style="margin-bottom:10px">Lo eliminado se puede restaurar: un plan vuelve con sus hallazgos, acciones, avances y traslados. La bitácora de auditoría conserva todo.</div>
      <h4 style="margin:6px 0">Planes, hallazgos, acciones y traslados</h4>
      ${
        l.length
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo</th><th>Elemento</th><th>Eliminado</th><th>Incluye</th><th></th></tr></thead><tbody>${l
              .map(
                x =>
                  `<tr><td>${esc(PM_PAP_TIPO[x.tabla] || x.tabla)}</td><td class="asunto">${esc(shortTxt(x.descripcion || '', 140))}</td><td>${fmtTs(x.eliminado_at)}</td><td class="mono">${x.dependientes ? x.dependientes + ' registros' : '—'}</td><td><button class="btn sm primary" data-act="pmRestaurar" data-id="${esc(String(x.audit_id))}"><i class="fa-solid fa-rotate-left"></i> Restaurar</button></td></tr>`
              )
              .join('')}</tbody></table></div>`
          : '<div class="muted" style="padding:6px 0">Nada eliminado.</div>'
      }
      <h4 style="margin:14px 0 6px">Documentos del archivo</h4>
      ${
        docs.length
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Documento</th><th>Plan</th><th>Enviado a la papelera</th><th></th></tr></thead><tbody>${docs
              .map(d => {
                const p = pmPlanOf(d.plan_id);
                return `<tr><td class="asunto">${esc(d.nombre)}</td><td class="asunto">${esc(p ? shortTxt(p.ejercicio, 70) : '—')}</td><td>${fmtTs(d.eliminado_at)}</td><td style="white-space:nowrap"><button class="btn sm primary" data-act="pmDocRestaurar" data-id="${esc(d.id)}"><i class="fa-solid fa-rotate-left"></i> Restaurar</button>${rol() === 'admin' ? ` <button class="btn sm danger" data-act="pmDocPurgar" data-id="${esc(d.id)}">Eliminar definitivamente</button>` : ''}</td></tr>`;
              })
              .join('')}</tbody></table></div>`
          : '<div class="muted" style="padding:6px 0">No hay documentos en la papelera.</div>'
      }`,
    footer: `<button class="btn" data-act="closeModal">Cerrar</button>`
  });
}
async function pmRestaurar(auditId, btn) {
  if (!confirm('¿Restaurar este elemento con todo lo que se eliminó junto con él?')) return;
  if (btn) btn.disabled = true;
  try {
    let msg;
    if (S.demo || !sb) {
      const st = pmDemoStore();
      const x = (st.papelera || []).find(r => String(r.audit_id) === String(auditId));
      if (!x || x.restaurado) throw new Error('Este elemento ya fue restaurado');
      if (x.tabla !== 'pm_planes' && !st.planes.some(p => p.id === x.plan_id))
        throw new Error('Primero restaure el plan al que pertenece');
      let n = 0;
      x.filas.forEach(([lista, fila]) => {
        st[lista] = st[lista] || [];
        st[lista].push({ ...fila });
        n++;
      });
      x.restaurado = true;
      await demoAudit(x.tabla, 'INSERT', x.registro_id, { restaurado: true }, pmUser());
      pmDemoSave();
      msg = n + ' registro(s) restaurado(s)';
    } else {
      const { data, error } = await sb.rpc('pm_restaurar', { p_audit_id: Number(auditId) });
      if (error) throw pmErr(error);
      msg = data;
    }
    toast('Restaurado: ' + msg);
    await pmRefresh();
    pmPapeleraModal();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
/* En la demostración, cada eliminación guarda lo que se borró para poder restaurarlo */
function pmDemoPapelera(kind, id) {
  const st = pmDemoStore();
  st.papelera = st.papelera || [];
  const filas = [];
  const add = (lista, f) => filas.push([lista, { ...f }]);
  let fila, tabla, desc;
  if (kind === 'plan') {
    fila = st.planes.find(x => x.id === id);
    if (!fila) return;
    tabla = 'pm_planes';
    desc = fila.ejercicio;
    add('planes', fila);
    st.hall.filter(x => x.plan_id === id).forEach(x => add('hall', x));
    st.acc.filter(x => x.plan_id === id).forEach(x => add('acc', x));
    st.av.filter(x => x.plan_id === id).forEach(x => add('av', x));
    (st.tras || []).filter(x => x.plan_id === id).forEach(x => add('tras', x));
    (st.pror || []).filter(x => x.plan_id === id).forEach(x => add('pror', x));
    (st.inf || []).filter(x => x.plan_id === id).forEach(x => add('inf', x));
  } else if (kind === 'hall') {
    fila = st.hall.find(x => x.id === id);
    if (!fila) return;
    tabla = 'pm_hallazgos';
    desc = 'Hallazgo ' + fila.numero + ': ' + shortTxt(fila.descripcion, 140);
    add('hall', fila);
    st.acc
      .filter(x => x.hallazgo_id === id)
      .forEach(a => {
        add('acc', a);
        st.av.filter(v => v.accion_id === a.id).forEach(v => add('av', v));
      });
    (st.tras || []).filter(x => x.hallazgo_id === id).forEach(x => add('tras', x));
  } else if (kind === 'acc') {
    fila = st.acc.find(x => x.id === id);
    if (!fila) return;
    tabla = 'pm_acciones';
    desc = shortTxt(fila.accion, 160);
    add('acc', fila);
    st.av.filter(v => v.accion_id === id).forEach(v => add('av', v));
  } else if (kind === 'tras') {
    fila = (st.tras || []).find(x => x.id === id);
    if (!fila) return;
    tabla = 'pm_traslados';
    desc = 'Traslado ' + fila.tipo + ' a ' + fila.destino;
    add('tras', fila);
  } else return;
  st.papelera.push({
    audit_id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    tabla,
    registro_id: id,
    plan_id: fila.plan_id || id,
    descripcion: desc,
    eliminado_at: new Date().toISOString(),
    dependientes: filas.length - 1,
    filas
  });
}

/* =====================================================================
   INTEGRIDAD Y RESPALDO DE ARCHIVOS (Configuración → Copias de seguridad)
   Inventario: soportes de respuestas y de avances (depósito «soportes») y documentos del archivo
   (depósito «archivo»), con la huella SHA-256 registrada en la base de datos.
   ===================================================================== */
async function archivoInventario() {
  const out = [];
  if (S.demo || !sb) {
    Object.keys(PM_DEMO_ARCHIVOS).forEach(path => {
      const d = (PM.docs || []).find(x => x.path === path);
      out.push({
        deposito: 'archivo',
        path,
        nombre: d ? d.nombre : path,
        sha256: d ? d.sha256 : '',
        origen: 'Archivo documental'
      });
    });
    return out;
  }
  const lee = async (tabla, cols) => {
    let from = 0,
      all = [];
    for (;;) {
      const { data, error } = await sb
        .from(tabla)
        .select(cols)
        .range(from, from + 999);
      if (error) return all;
      all = all.concat(data || []);
      if (!data || data.length < 1000) return all;
      from += 1000;
    }
  };
  (await lee('requerimientos', 'radicado, soporte_path, soporte_hash')).forEach(r => {
    if (r.soporte_path)
      out.push({
        deposito: 'soportes',
        path: r.soporte_path,
        nombre: 'Respuesta ' + r.radicado + '.pdf',
        sha256: r.soporte_hash || '',
        origen: 'Respuesta de requerimiento'
      });
  });
  (await lee('pm_avances', 'id, soporte_path, soporte_hash')).forEach(v => {
    if (v.soporte_path)
      out.push({
        deposito: 'soportes',
        path: v.soporte_path,
        nombre: 'Avance ' + v.id + '.pdf',
        sha256: v.soporte_hash || '',
        origen: 'Soporte de avance'
      });
  });
  (await lee('archivo_documentos', 'path, nombre, sha256, eliminado_at')).forEach(d =>
    out.push({
      deposito: 'archivo',
      path: d.path,
      nombre: d.nombre,
      sha256: d.sha256,
      origen: d.eliminado_at ? 'Archivo documental (en la papelera)' : 'Archivo documental'
    })
  );
  return out;
}
async function archivoDescargarUno(it) {
  if (S.demo || !sb) return PM_DEMO_ARCHIVOS[it.path] || null;
  const { data, error } = await sb.storage.from(it.deposito).download(it.path);
  return error ? null : data;
}
/* Verifica que cada archivo exista y conserve su huella; muestra el resultado */
async function archivoVerificar(btn) {
  if (btn) btn.disabled = true;
  const out = $('#respArchivos');
  try {
    const inv = await archivoInventario();
    let ok = 0,
      faltan = [],
      alterados = [];
    for (let i = 0; i < inv.length; i++) {
      if (out) out.textContent = `Verificando ${i + 1} de ${inv.length}…`;
      const b = await archivoDescargarUno(inv[i]);
      if (!b) {
        faltan.push(inv[i]);
        continue;
      }
      const sha = await sha256Hex(await b.arrayBuffer());
      if (inv[i].sha256 && sha !== inv[i].sha256) alterados.push(inv[i]);
      else ok++;
    }
    if (out)
      out.innerHTML = `<b>${ok} de ${inv.length}</b> archivos completos y sin alteraciones.${
        faltan.length
          ? `<br><span style="color:var(--redink)">Faltan ${faltan.length}: ${faltan
              .slice(0, 5)
              .map(x => esc(x.nombre))
              .join(', ')}${faltan.length > 5 ? '…' : ''}</span>`
          : ''
      }${
        alterados.length
          ? `<br><span style="color:var(--redink)">Huella distinta en ${alterados.length}: ${alterados
              .slice(0, 5)
              .map(x => esc(x.nombre))
              .join(', ')}</span>`
          : ''
      }`;
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
/* ZIP sin compresión (método «stored»), con manifiesto CSV: se abre con cualquier descompresor */
const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLA[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipCrear(archivos) {
  const enc = new TextEncoder();
  const partes = [],
    central = [];
  let off = 0;
  const d = new Date(),
    hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    fecha = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  archivos.forEach(({ nombre, datos }) => {
    const n = enc.encode(nombre),
      crc = crc32(datos),
      h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true);
    h.setUint16(10, hora, true);
    h.setUint16(12, fecha, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, datos.length, true);
    h.setUint32(22, datos.length, true);
    h.setUint16(26, n.length, true);
    h.setUint16(28, 0, true);
    partes.push(new Uint8Array(h.buffer), n, datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, fecha, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + datos.length;
  });
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, archivos.length, true);
  e.setUint16(10, archivos.length, true);
  e.setUint32(12, tamCentral, true);
  e.setUint32(16, off, true);
  return new Blob([...partes, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
async function archivoZip(btn) {
  if (btn) btn.disabled = true;
  const out = $('#respArchivos');
  try {
    const inv = await archivoInventario();
    if (!inv.length) return toast('No hay archivos para respaldar');
    const archivos = [],
      filas = [['deposito', 'ruta', 'nombre', 'origen', 'sha256_registrado', 'sha256_descargado', 'estado']];
    for (let i = 0; i < inv.length; i++) {
      if (out) out.textContent = `Descargando ${i + 1} de ${inv.length}…`;
      const it = inv[i];
      const b = await archivoDescargarUno(it);
      if (!b) {
        filas.push([it.deposito, it.path, it.nombre, it.origen, it.sha256, '', 'FALTA']);
        continue;
      }
      const u8 = new Uint8Array(await b.arrayBuffer());
      const sha = await sha256Hex(u8);
      filas.push([
        it.deposito,
        it.path,
        it.nombre,
        it.origen,
        it.sha256,
        sha,
        it.sha256 && sha !== it.sha256 ? 'HUELLA DISTINTA' : 'OK'
      ]);
      archivos.push({ nombre: `${it.deposito}/${it.path}`, datos: u8 });
    }
    const csv = filas.map(f => f.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    archivos.unshift({ nombre: 'MANIFIESTO.csv', datos: new TextEncoder().encode('\ufeff' + csv) });
    const z = zipCrear(archivos);
    const nom = `archivos_control_entes_${pmHoy()}.zip`;
    const u = URL.createObjectURL(z);
    const aEl = document.createElement('a');
    aEl.href = u;
    aEl.download = nom;
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
    if (out)
      out.innerHTML = `Respaldo de archivos descargado: <b>${archivos.length - 1}</b> archivos y su manifiesto (${(z.size / 1048576).toFixed(1)} MB).`;
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}
