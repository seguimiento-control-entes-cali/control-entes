/**
 * src/js/18-acciones.js
 * Delegación de eventos: un único manejador de clics que despacha cada botón según su atributo data-act. Para agregar un botón nuevo, agrega su case aquí.
 * Depende de: Todas las vistas.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   Acciones (delegación de eventos)
   ===================================================================== */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act,
    id = t.dataset.id;
  /* Planes de mejoramiento: sus botones los atiende 19-planes-de-mejoramiento.js */
  if (a.startsWith('pm')) return pmAct(a, t);
  /* Carga del Excel de control: 20-carga-excel.js */
  if (a.startsWith('ce')) return ceAct(a, t);
  switch (a) {
    case 'go':
      go(t.dataset.view);
      break;
    case 'closeModal':
      closeModal();
      break;
    case 'detail':
      detailModal(id);
      break;
    case 'newReq':
      newReqModal();
      break;
    case 'saveReq':
      saveReq();
      break;
    case 'closeFor':
      e.stopPropagation();
      closeModal();
      S.preselect = id;
      go('carga');
      break;
    case 'openPdf':
      try {
        window.open(await db.signedUrl(t.dataset.path), '_blank', 'noopener');
      } catch (er) {
        toast(er.message, 'err');
      }
      break;
    case 'escalate':
      try {
        await db.escalate(
          S.reqs.find(r => String(r.id) === id),
          'registro'
        );
        toast('Escalamiento registrado');
        await reload();
        render();
      } catch (er) {
        toast(er.message, 'err');
      }
      break;
    case 'escalateAll': {
      const pend = S.reqs.filter(r => r.sem === 'rojo' && !r.escalado_at);
      let n = 0;
      for (const r of pend) {
        try {
          await db.escalate(r, 'registro');
          n++;
        } catch (er) {
          toast(er.message, 'err');
          break;
        }
      }
      if (n) toast(n + ' escalamiento(s) registrado(s)');
      await reload();
      render();
      break;
    }
    case 'log': {
      const r = S.reqs.find(x => String(x.id) === id);
      if (r && canEscalate())
        db.escalate(r, t.dataset.canal)
          .then(async () => {
            await reload();
            render();
          })
          .catch(() => {});
      break;
    }
    case 'editCat':
      catModal(t.dataset.table, id);
      break;
    case 'saveCat':
      saveCat(t.dataset.table, id);
      break;
    case 'csv':
      exportCsv();
      break;
    case 'print':
      window.print();
      break;
    case 'verify':
      verifyChain();
      break;
    case 'tamper':
      if (DEMO.audit.length > 1) {
        DEMO.audit[1].payload.asunto = 'ALTERADO';
        DEMO.audit[1].payload.manipulado = true;
        toast('Se alteró en memoria el evento #2. Verifica la integridad.');
      } else toast('Genera primero algún evento (cierra o crea un requerimiento)', 'err');
      break;
    case 'ctaTitular':
      titularModal(t.dataset.org);
      break;
    case 'ctaTitularGuardar':
      await guardarTitular();
      break;
    case 'ctaInvitar':
      invitarModal();
      break;
    case 'ctaInvitarGuardar':
      await guardarInvitacion();
      break;
    case 'tmVentana':
      TM.ventana = +t.dataset.n;
      lsSet('ce_ventana', String(TM.ventana));
      render();
      break;
    case 'miClave':
      await miCuentaModal();
      break;
    case 'miClaveCambiar':
      claveModal(false);
      break;
    case 'mfaActivar':
      await mfaInscribir(false);
      break;
    case 'mfaConfirmar':
      await mfaConfirmar(t);
      break;
    case 'mfaCancelar':
      await mfaCancelar();
      break;
    case 'mfaQuitar':
      await mfaQuitar(t.dataset.id);
      break;
    case 'mfaVerificar':
      await mfaVerificarCodigo(t);
      break;
    case 'mfaSalir':
      await mfaSalir();
      break;
    case 'saveResumen':
      await guardarResumen();
      break;
    case 'vpSalir':
      await vpAplicar('admin');
      break;
    case 'rpCrear':
      await respaldoCrear(t);
      break;
    case 'archVerificar':
      await archivoVerificar(t);
      break;
    case 'archZip':
      await archivoZip(t);
      break;
    case 'rpDescargar':
      await respaldoDescargar(t.dataset.n);
      break;
    case 'slRevisado':
      await saludRevisado(t.dataset.id);
      break;
    case 'probarResumen':
      await probarResumen(t);
      break;
    case 'miClaveGuardar':
      await guardarClave();
      break;
    case 'ctaCrear': {
      const org = t.dataset.org,
        x = titularDe(org);
      if (!x || !normMail(x.correo) || !fullName(x.nombre)) {
        titularModal(org);
        break;
      }
      t.disabled = true;
      try {
        const r = await db.cuenta('invitar', {
          correo: normMail(x.correo),
          nombre: x.nombre,
          rol: 'secretario',
          dependencia: org
        });
        toast(r.mensaje);
        await refrescarDeps();
        render();
      } catch (e) {
        t.disabled = false;
        toast(e.message, 'err');
      }
      break;
    }
    case 'ctaPreparar':
    case 'ctaPrepararTodas': {
      const lista =
        a === 'ctaPreparar' ? [t.dataset.org] : mainOrgsAll().filter(o => estadoCuenta(o)[0] === 'sin');
      if (a === 'ctaPreparar') {
        const x = titularDe(lista[0]);
        if (!x || !normMail(x.correo) || !fullName(x.nombre)) {
          titularModal(lista[0]);
          break;
        }
      }
      if (
        !lista.length ||
        (a === 'ctaPrepararTodas' &&
          !confirm(
            `Se prepararán ${lista.length} cuenta(s) con el correo institucional de cada titular. Quedarán bloqueadas y NO se enviará ningún correo hasta que usted las active. ¿Continuar?`
          ))
      )
        break;
      t.disabled = true;
      let ok = 0;
      const fallas = [];
      for (const o of lista) {
        const x = titularDe(o);
        try {
          await db.cuenta('preparar', {
            correo: normMail(x.correo),
            nombre: x.nombre,
            rol: 'secretario',
            dependencia: o
          });
          ok++;
        } catch (e) {
          fallas.push(shortOrg(o) + ': ' + e.message);
        }
      }
      await refrescarDeps();
      render();
      toast(
        `${ok} cuenta(s) preparada(s), sin activar y sin enviar correos` +
          (fallas.length ? `. No se pudo en ${fallas.length}: ${fallas.slice(0, 2).join(' · ')}` : ''),
        fallas.length ? 'err' : undefined
      );
      break;
    }
    case 'ctaActivarInvitar': {
      if (
        !confirm(
          `Se activará la cuenta y se enviará a ${t.dataset.correo} el enlace para definir su contraseña. ¿Continuar?`
        )
      )
        break;
      t.disabled = true;
      try {
        const r = await db.cuenta('activar_invitar', { id: t.dataset.id });
        toast(r.mensaje);
        render();
      } catch (e) {
        t.disabled = false;
        toast(e.message, 'err');
      }
      break;
    }
    case 'ctaCrearTodas': {
      const pend = mainOrgsAll().filter(o => estadoCuenta(o)[0] === 'sin');
      if (
        !pend.length ||
        !confirm(
          `Se enviará una invitación al correo institucional del titular de ${pend.length} dependencia(s). ¿Continuar?`
        )
      )
        break;
      t.disabled = true;
      let ok = 0;
      const fallas = [];
      for (const o of pend) {
        const x = titularDe(o);
        try {
          await db.cuenta('invitar', {
            correo: normMail(x.correo),
            nombre: x.nombre,
            rol: 'secretario',
            dependencia: o
          });
          ok++;
        } catch (e) {
          fallas.push(shortOrg(o) + ': ' + e.message);
        }
      }
      await refrescarDeps();
      render();
      toast(
        `${ok} invitación(es) enviada(s)` +
          (fallas.length ? `. No se pudo en ${fallas.length}: ${fallas.slice(0, 2).join(' · ')}` : ''),
        fallas.length ? 'err' : undefined
      );
      break;
    }
    case 'ctaEnlace':
      try {
        const r = await db.cuenta('enlace_clave', { correo: t.dataset.correo });
        toast(r.mensaje);
      } catch (e) {
        toast(e.message, 'err');
      }
      break;
    case 'ctaActivar':
    case 'ctaDesactivar': {
      if (a === 'ctaDesactivar' && !confirm('La persona ya no podrá ingresar. ¿Desactivar la cuenta?')) break;
      try {
        const r = await db.cuenta(a === 'ctaActivar' ? 'activar' : 'desactivar', { id: t.dataset.id });
        toast(r.mensaje);
        render();
      } catch (e) {
        toast(e.message, 'err');
      }
      break;
    }
    case 'olvideClave': {
      const correo = normMail($('#loginEmail').value);
      if (!correo) {
        showLogin('Escribe tu correo institucional y vuelve a pulsar "¿Olvidaste tu contraseña?".');
        break;
      }
      const { error } = await sb.auth.resetPasswordForEmail(correo, {
        redirectTo: location.origin + location.pathname
      });
      showLogin(
        error
          ? 'No se pudo enviar el enlace: ' + error.message
          : 'Si el correo tiene cuenta, recibirás un enlace para definir una contraseña nueva.'
      );
      break;
    }
    case 'saveProfile': {
      const tr = t.closest('tr'),
        g = k => tr.querySelector(`[data-k="${k}"]`).value;
      try {
        await db.saveProfile({
          id,
          rol: g('rol'),
          dependencia_id: g('dependencia_id') ? +g('dependencia_id') : null,
          activo: g('activo') === 'true'
        });
        toast('Cuenta actualizada');
      } catch (er) {
        toast(er.message, 'err');
      }
      break;
    }
    case 'saveCfg':
      try {
        const d = +$('#cfDias').value;
        if (!(d >= 1 && d <= 30)) return toast('Los días deben estar entre 1 y 30', 'err');
        await db.saveConfig({ dias_rojo: d, correo_disciplinario: $('#cfDisc').value.trim() });
        await db.catalogs();
        await reload();
        toast('Parámetros guardados');
        render();
      } catch (er) {
        toast(er.message, 'err');
      }
      break;
    case 'cSort':
      C.sort = t.dataset.s;
      render();
      break;
    case 'drill':
      drillModal(t.dataset.org);
      break;
    case 'cumCsv': {
      const l = sortOrgs(aggOrgs(C.vig, C.niv));
      csvDownload(
        'cumplimiento_por_organismo.csv',
        [
          'Puesto',
          'Organismo',
          'Tipo',
          'Evaluados',
          'A tiempo',
          'Tardías',
          'Sin respuesta vencida',
          'Incumplimientos',
          '% incumplimiento',
          'Semáforo',
          'Retraso promedio (días hábiles)'
        ],
        l.map((o, i) => [
          i + 1,
          o.org,
          o.niv,
          o.ev,
          o.ok,
          o.tar,
          o.sin,
          o.inc,
          pct1(o.tasa),
          o.sem.toUpperCase(),
          o.tar ? o.ret.toFixed(1) : ''
        ])
      );
      break;
    }
    case 'hPage':
      Hs.page = Math.max(0, Hs.page + +t.dataset.d);
      renderHist();
      break;
    case 'histDetail':
      histDetail(+t.dataset.i);
      break;
    case 'cxTab':
      closeModal();
      CRUF.tab = t.dataset.tab;
      CRUF.page = 0;
      if (t.dataset.tab !== 'temas') CRUF.tema = '';
      if (S.view !== 'cruces') go('cruces');
      else render();
      break;
    case 'cxCell':
      CRUF.tab = 'temas';
      CRUF.tema = t.dataset.tema;
      CRUF.fam = t.dataset.fam || '';
      CRUF.page = 0;
      render();
      break;
    case 'cxPage':
      CRUF.page = Math.max(0, CRUF.page + +t.dataset.d);
      render();
      break;
    case 'cxRev': {
      if (!canClasif()) break;
      const cl = t.dataset.clave,
        est = t.dataset.estado;
      try {
        await saveCruceRev(cl, est, '');
        toast(
          est === 'confirmado'
            ? 'Cruce confirmado'
            : est === 'descartado'
              ? 'Cruce descartado'
              : 'Revisión retirada'
        );
        renderNav();
        render();
      } catch (e) {
        toast(e.message, 'err');
      }
      break;
    }
    case 'cxCsv': {
      const d = cruceData(),
        o = scopeOrg();
      const rws = hrows().filter(r => {
        const x = d.info.get(r.i);
        return (
          (CRUF.tab === 'sin' ? x.prim === 'sin' : !CRUF.tema || x.prim === CRUF.tema) &&
          (!CRUF.fam || x.fam === CRUF.fam) &&
          (!CRUF.vig || String(r.v) === CRUF.vig) &&
          (o || !CRUF.org || r.org === CRUF.org)
        );
      });
      csvDownload(
        'temas_y_cruces.csv',
        [
          'Vigencia',
          'Fecha recibo',
          'Ente',
          'Familia del ente',
          'Dependencia',
          'N.º radicación ente',
          'ORFEO entrada',
          'Asunto',
          'Tema principal',
          'Otros temas',
          'Clasificación',
          'Identificadores citados',
          'Cruce exacto con otros entes',
          'Oportunidad'
        ],
        rws.map(r => {
          const x = d.info.get(r.i),
            cs = casoDe(r);
          return [
            r.v,
            fechaOf(r),
            r.ente,
            x.fam,
            r.org,
            r.rad,
            r.orfE,
            maskPII(r.asu),
            TEMA_LBL[x.prim],
            x.temas
              .slice(1)
              .map(k => TEMA_LBL[k])
              .join(' / '),
            x.man ? 'Manual' : 'Automática',
            x.ids.map(idShow).join(' / '),
            cs ? cs.fams.join(' + ') : '',
            OPO_PILL[r.opo][1]
          ];
        })
      );
      break;
    }
    case 'histCsv':
      csvDownload(
        'historico_requerimientos.csv',
        [
          'Vigencia',
          'N.º radicación ente',
          'Ente',
          'ORFEO entrada',
          'Fecha recibo',
          'Organismo',
          'Asunto',
          'Término (días hábiles)',
          'Fecha máxima',
          'ORFEO respuesta',
          'Fecha respuesta',
          '¿Respondió?',
          '¿Tardía?',
          'Oportunidad',
          'Retraso (días hábiles)'
        ],
        histFiltered().map(r => [
          r.v,
          r.rad,
          r.ente,
          r.orfE,
          r.rec,
          r.org,
          maskPII(r.asu),
          r.term,
          r.fmax,
          r.orfR,
          r.fresp,
          r.resp === 1 ? 'Sí' : r.resp === 0 ? 'No' : 'No aplica',
          r.opo === 1 ? 'Sí' : r.opo === 5 ? 'No aplica' : 'No',
          OPO_PILL[r.opo][1],
          r.ret
        ])
      );
      break;
    case 'unmask': {
      const r = hrows().find(x => x.i === +t.dataset.i);
      const dd = $('#asuDd');
      if (r && dd) {
        dd.textContent = r.asu || '—';
        t.remove();
      }
      break;
    }
    case 'acTab':
      AC.tab = t.dataset.t;
      render();
      break;
    case 'rpPdf':
      rpPdf();
      break;
    case 'rpCsv': {
      const m = (RP._last || {}).m;
      if (m)
        csvDownload(
          'informe_datos_' + (HIST.corte || '') + '.csv',
          [
            'Vigencia',
            'Dependencia',
            'Ente',
            'N.º radicación ente',
            'Fecha máxima',
            'Fecha respuesta',
            'ORFEO respuesta',
            'Oportunidad',
            'Retraso (días hábiles)'
          ],
          m.rows.map(r => [r.v, r.org, r.ente, r.rad, r.fmax, r.fresp, r.orfR, OPO_PILL[r.opo][1], r.ret])
        );
      break;
    }
    case 'tmFilter': {
      TM.filter = TM.filter === t.dataset.s ? null : t.dataset.s;
      const box = $('#tm');
      if (box) box.classList.toggle('filtering', !!TM.filter);
      paintTreemap();
      break;
    }
    case 'tmPlay':
      tmPlay();
      break;
    case 'tmSel':
      TM.sel = TM.sel === t.dataset.org ? null : t.dataset.org;
      paintTreemap();
      // En el celular el detalle queda debajo del tablero: se lleva a la vista
      if (TM.sel && innerWidth <= 520) {
        const det = $('#tmDet');
        if (det) det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      break;
    case 'qVig':
      Q.vigs[t.dataset.y] = !Q.vigs[t.dataset.y];
      render();
      break;
    case 'openOrg':
      X.org = t.dataset.org;
      closeModal();
      go('dependencia');
      break;
    case 'notify':
      notifyModal(t.dataset.org);
      break;
    case 'despacho':
      despachoModal();
      break;
    case 'sendWa':
      sendWa();
      break;
    case 'sendMail':
      sendMail();
      break;
    case 'copyMsg': {
      const v = $('#nMsg').value;
      try {
        await navigator.clipboard.writeText(v);
        toast('Mensaje copiado');
      } catch (er) {
        $('#nMsg').select();
        document.execCommand('copy');
        toast('Mensaje copiado');
      }
      break;
    }
    case 'dirSave': {
      const i = +t.dataset.i,
        tr = t.closest('[data-di]'),
        x = DIRLIST[i];
      if (!x || !tr) break;
      const g = k => tr.querySelector(`[data-k="${k}"]`).value.trim().replace(/\s+/g, ' ');
      const tel = g('telefono');
      if (tel && !normPhone(tel)) {
        toast('El celular debe tener 10 dígitos e iniciar en 3', 'err');
        break;
      }
      if (g('nombre') && !fullName(g('nombre'))) {
        toast('Escribe el nombre completo: nombres y apellidos', 'err');
        break;
      }
      if (tel && !g('nombre')) {
        toast('Agrega el nombre completo del responsable antes de guardar el celular', 'err');
        break;
      }
      const mail = g('correo').replace(/\s/g, '').toLowerCase();
      if (mail && !normMail(mail)) {
        toast('El correo debe ser institucional: nombre.apellido@cali.gov.co', 'err');
        break;
      }
      const otroM = DIRLIST.find((y, k) => k !== i && mail && String(y.correo || '').toLowerCase() === mail);
      if (otroM) {
        toast('Ese correo ya está asignado a ' + shortOrg(otroM.organismo), 'err');
        break;
      }
      const otro = DIRLIST.find((y, k) => k !== i && tel && normPhone(y.telefono) === normPhone(tel));
      if (otro) {
        toast('Ese celular ya está asignado a ' + shortOrg(otro.organismo), 'err');
        break;
      }
      const antes = { ...x };
      x.cargo = g('cargo') || x.cargo;
      x.nombre = g('nombre');
      x.telefono = tel ? normPhone(tel) : '';
      x.correo = mail;
      try {
        await saveDirRow(x);
        if (S.demo || !sb) await demoAudit('directorio', 'UPDATE', i, x, S.user.email, diff(antes, x));
        toast('Directorio actualizado');
        render();
      } catch (er) {
        toast(er.message, 'err');
      }
      break;
    }
    case 'dirAdd':
      if (
        !DIRLIST.some(
          x => orgKey(x.organismo) === orgKey(t.dataset.org) && x.cargo === defaultCargo(t.dataset.org)
        )
      )
        DIRLIST.push({
          organismo: t.dataset.org,
          cargo: defaultCargo(t.dataset.org),
          nombre: '',
          telefono: ''
        });
      DIRF.q = '';
      DIRF.f = 'todos';
      render();
      break;
    case 'dirCsv':
      csvDownload(
        'directorio_gabinete.csv',
        ['Dependencia', 'Cargo', 'Nombre', 'Celular'],
        DIRLIST.map(x => [x.organismo, x.cargo, x.nombre, x.telefono])
      );
      break;
    case 'notifCsv':
      csvDownload(
        'notificaciones.csv',
        ['Fecha', 'Dependencia', 'Destinatario', 'Celular', 'Mensaje', 'Casos', 'Enviado por', 'Texto'],
        NOTIF.map(n => [n.ts, n.org, n.nombre, n.tel, (TPL[n.tpl] || [n.tpl])[0], n.n, n.usuario, n.mensaje])
      );
      break;
    case 'depCsv': {
      const org = scopeOrg() || X.org;
      csvDownload(
        'reporte_' + shortOrg(org).replace(/\W+/g, '_') + '.csv',
        [
          'Vigencia',
          'N.º radicación ente',
          'Ente',
          'Asunto',
          'Fecha máxima',
          'Fecha respuesta',
          'ORFEO respuesta',
          'Oportunidad',
          'Retraso (días hábiles)'
        ],
        HIST.rows
          .filter(r => r.org === org)
          .map(r => [r.v, r.rad, r.ente, maskPII(r.asu), r.fmax, r.fresp, r.orfR, OPO_PILL[r.opo][1], r.ret])
      );
      break;
    }
    case 'saveConn':
      lsSet('ce_url', $('#cfUrl').value.trim());
      lsSet('ce_key', $('#cfKey').value.trim());
      location.reload();
      break;
  }
});

$('#btnCollapse').addEventListener('click', () => {
  const app = $('#app');
  app.classList.toggle('collapsed');
  lsSet('ce_collapsed', app.classList.contains('collapsed') ? '1' : '0');
  $('#btnCollapse i').className =
    'fa-solid ' + (app.classList.contains('collapsed') ? 'fa-angles-right' : 'fa-angles-left');
});
$('#btnBurger').addEventListener('click', () => $('#app').classList.add('open'));
$('#mobileOv').addEventListener('click', () => $('#app').classList.remove('open'));
$('#btnLogout').addEventListener('click', async () => {
  if (S.demo) {
    location.reload();
    return;
  }
  await sb.auth.signOut();
  location.reload();
});
$('#selVigencia').addEventListener('change', async e => {
  S.vigencia = +e.target.value;
  await reload();
  render();
});
function syncDemoDep() {
  const sel = $('#demoDep'),
    scoped = ['secretario', 'enlace'].includes(rol());
  sel.classList.toggle('hidden', !scoped);
  if (scoped) {
    if (!S.deps.some(d => d.id === S.profile.dependencia_id && HIST.rows.some(r => r.org === d.nombre))) {
      const f = S.deps.find(d => HIST.rows.some(r => r.org === d.nombre));
      if (f) S.profile.dependencia_id = f.id;
    }
    S.profile.org = (S.deps.find(d => d.id === S.profile.dependencia_id) || {}).nombre;
    sel.innerHTML = S.deps
      .filter(d => HIST.rows.some(r => r.org === d.nombre))
      .map(
        d =>
          `<option value="${d.id}"${d.id === S.profile.dependencia_id ? ' selected' : ''}>${esc(shortOrg(d.nombre))}</option>`
      )
      .join('');
  }
}
$('#demoRole').addEventListener('change', async e => {
  if (!S.demo) return vpAplicar(e.target.value, null);
  const p = { ...DEMO.profiles.find(x => x.rol === e.target.value) };
  S.profile = p;
  S.user = { email: p.email };
  syncDemoDep();
  await reload();
  await pmLoad();
  go(S.view);
});
$('#demoDep').addEventListener('change', async e => {
  if (!S.demo) return vpAplicar(S.profile.rol, +e.target.value);
  const d = S.deps.find(x => x.id === +e.target.value);
  if (!d) return;
  S.profile = { ...S.profile, dependencia_id: d.id, org: d.nombre };
  await reload();
  await pmLoad();
  go(S.view);
});
window.addEventListener('resize', onResizeTm);
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (v && TITLES[v] && S.profile) go(v);
});

/* =====================================================================
   VISTA PREVIA POR ROL (versión real, solo Super administrador)
   Muestra la app exactamente como la vería otro rol o una dependencia, filtrando en este navegador
   lo mismo que la base de datos filtraría para esa persona. Es de solo lectura: mientras está activa,
   cualquier intento de guardar, cargar o enviar se bloquea antes de llegar a la base de datos.
   ===================================================================== */
const VP = { real: null, hist: null, notif: null, guard: false };
const vpActiva = () => !!VP.real;
const VP_MSG = 'Vista previa por rol: es solo de lectura. Vuelva a "Mi vista" para hacer cambios.';
function vpOpciones() {
  if (S.demo || !S.profile || S.profile.rol !== 'admin') return;
  const dr = $('#demoRole');
  dr.classList.remove('hidden');
  dr.title = 'Vista previa por rol (solo lectura)';
  dr.innerHTML = Object.entries(ROLES)
    .map(
      ([k, v]) => `<option value="${k}">${k === 'admin' ? 'Mi vista: ' + v : 'Vista previa: ' + v}</option>`
    )
    .join('');
}
/* Cualquier escritura queda bloqueada mientras dura la vista previa */
function vpBloquear() {
  if (VP.guard || !sb) return;
  VP.guard = true;
  const res = () => Promise.resolve({ data: null, error: { message: VP_MSG } });
  const bloqueado = new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? (a, b) => res().then(a, b) : () => bloqueado),
    apply: () => bloqueado
  });
  const from = sb.from.bind(sb),
    rpc = sb.rpc.bind(sb),
    invoke = sb.functions.invoke.bind(sb.functions),
    storageFrom = sb.storage.from.bind(sb.storage);
  sb.from = t => {
    const q = from(t);
    if (!vpActiva()) return q;
    ['insert', 'update', 'upsert', 'delete'].forEach(m => (q[m] = () => bloqueado));
    return q;
  };
  sb.rpc = (n, a, o) => (vpActiva() ? bloqueado : rpc(n, a, o));
  sb.functions.invoke = (n, o) => (vpActiva() ? res() : invoke(n, o));
  sb.storage.from = b => {
    const st = storageFrom(b);
    if (!vpActiva()) return st;
    ['upload', 'update', 'remove', 'move', 'copy'].forEach(m => (st[m] = () => res()));
    return st;
  };
}
function vpBanner() {
  const b = $('#banner');
  if (!vpActiva()) {
    b.classList.add('hidden');
    b.innerHTML = '';
    return;
  }
  const dep = S.profile.org ? ' · ' + esc(shortOrg(S.profile.org)) : '';
  b.classList.remove('hidden');
  b.innerHTML = `<b>Vista previa: ${esc(ROLES[S.profile.rol] || S.profile.rol)}${dep}.</b> Así ve la app esta persona. Es solo de lectura: no se guarda ni se envía nada. <a href="#" data-act="vpSalir">Volver a mi vista</a>`;
}
function vpDeps() {
  const sel = $('#demoDep'),
    scoped = ['secretario', 'enlace'].includes(S.profile.rol);
  sel.classList.toggle('hidden', !scoped);
  if (!scoped) return;
  const filas = VP.hist || HIST.rows;
  sel.innerHTML = S.deps
    .filter(d => filas.some(r => r.org === d.nombre))
    .map(
      d =>
        `<option value="${d.id}"${d.id === S.profile.dependencia_id ? ' selected' : ''}>${esc(shortOrg(d.nombre))}</option>`
    )
    .join('');
}
async function vpAplicar(rolSel, depId) {
  if (S.demo || (!VP.real && (!S.profile || S.profile.rol !== 'admin'))) return;
  vpBloquear();
  if (!VP.real) {
    VP.real = S.profile;
    VP.hist = HIST.rows;
    VP.notif = NOTIF;
  }
  if (!rolSel || rolSel === 'admin') {
    S.profile = VP.real;
    HIST.rows = VP.hist;
    NOTIF = VP.notif;
    VP.real = VP.hist = VP.notif = null;
    $('#demoDep').classList.add('hidden');
    $('#demoRole').value = 'admin';
  } else {
    const scoped = ['secretario', 'enlace'].includes(rolSel);
    const dep = scoped
      ? S.deps.find(d => d.id === depId) || S.deps.find(d => VP.hist.some(r => r.org === d.nombre))
      : null;
    S.profile = {
      ...VP.real,
      rol: rolSel,
      dependencia_id: dep ? dep.id : null,
      org: dep ? dep.nombre : null
    };
    HIST.rows = dep ? VP.hist.filter(r => r.org === dep.nombre) : VP.hist;
    NOTIF = dep ? VP.notif.filter(n => n.org === dep.nombre) : VP.notif;
    vpDeps();
  }
  vpBanner();
  await reload();
  await pmLoad();
  go(S.view); /* si el rol no tiene esa pantalla, go() abre la suya por defecto */
}
