/**
 * src/js/21-arranque.js
 * Arranque y autenticación: crea el cliente Supabase o entra en modo demostración, inicio de sesión, service worker y gancho de pruebas.
 * Depende de: Todos los anteriores (siempre es el último archivo: arranca la app).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   Arranque y autenticación
   ===================================================================== */
function fillVigencias() {
  const y = new Date().getFullYear();
  $('#selVigencia').innerHTML = [y, y - 1, y - 2]
    .map(v => `<option value="${v}"${v === S.vigencia ? ' selected' : ''}>Vigencia ${v}</option>`)
    .join('');
}
async function enterApp() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  if (lsGet('ce_collapsed') === '1') {
    $('#app').classList.add('collapsed');
    $('#btnCollapse i').className = 'fa-solid fa-angles-right';
  }
  fillVigencias();
  renderMode();
  try {
    if (S.demo || !sb) {
      const a = JSON.parse(lsGet('ce_acc') || '{}');
      a[S.user.email] = new Date().toISOString();
      lsSet('ce_acc', JSON.stringify(a));
    } else {
      sb.from('accesos')
        .insert({})
        .then(
          () => {},
          () => {}
        );
    }
  } catch (e) {}
  if (S.demo) {
    $('#banner').classList.remove('hidden');
    $('#banner').innerHTML = ES_PRIVADA
      ? '<b>Versión privada con datos reales.</b> Radicados reales de las vigencias 2024, 2025 y 2026 con corte al ' +
        fmtD(HIST.corte) +
        ' y directorio real del gabinete. Uso interno del Despacho: no reenviar este archivo.'
      : ES_DEMO_PUBLICA
        ? '<b>Versión de demostración con datos de ejemplo.</b> Los nombres, cifras y radicados son ficticios y no corresponden a la realidad. En la versión institucional los datos reales viven en Supabase y cada usuario solo ve lo que le corresponde.'
        : '<b>Modo demostración.</b> Los datos son de ejemplo y se reinician al recargar. Para conectar tu base real pega la URL y la anon key de Supabase en <b>Configuración</b> (o en el bloque CFG del archivo).';
    const dr = $('#demoRole');
    dr.classList.remove('hidden');
    dr.innerHTML = Object.entries(ROLES)
      .map(([k, v]) => `<option value="${k}">Ver como: ${v}</option>`)
      .join('');
  } else vpOpciones();
  try {
    await db.catalogs();
  } catch (e) {
    toast('No se pudieron cargar los catálogos: ' + e.message, 'err');
  }
  await loadHist();
  await loadDir();
  await loadNotifs();
  await loadCruceMeta();
  if (S.demo) syncDemoDep();
  await pmLoad();
  await reload();
  const v = location.hash.slice(1);
  go(TITLES[v] ? v : defaultView());
}
async function afterLogin(session) {
  const { data: p, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error || !p) {
    await sb.auth.signOut();
    return showLogin('No se pudo cargar tu perfil. Contacta al administrador.');
  }
  if (!p.activo) {
    await sb.auth.signOut();
    return showLogin('Tu cuenta está pendiente de activación por un administrador.');
  }
  /* Verificación en dos pasos: si la cuenta la tiene activa, se pide el código antes de entrar */
  try {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const ok = await mfaPedirCodigo();
      if (!ok) {
        await sb.auth.signOut();
        return showLogin('Ingreso cancelado.');
      }
    }
  } catch (e) {
    console.error(e);
  }
  S.user = { email: session.user.email };
  S.profile = p;
  await enterApp();
  if (LLEGADA_CLAVE) claveModal(true);
  else await mfaRevisarTrasIngreso();
}
function showLogin(msg) {
  $('#app').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
  const e = $('#loginErr');
  if (msg) {
    e.textContent = msg;
    e.classList.remove('hidden');
  } else e.classList.add('hidden');
  const b = $('#loginBtn');
  b.disabled = false;
  b.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Ingresar';
}
$('#loginForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const b = $('#loginBtn');
  b.disabled = true;
  b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando…';
  const { data, error } = await sb.auth.signInWithPassword({
    email: $('#loginEmail').value.trim(),
    password: $('#loginPass').value
  });
  if (error) return showLogin('Correo o contraseña incorrectos.');
  await afterLogin(data.session);
});

$('#loginShield').src = $('.brand .shield img').src;
$('#tbShield').src = $('.brand .shield img').src;
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* Si se llega desde el correo de invitación o de recuperación, se pedirá definir la contraseña.
   Se lee antes de crear el cliente, porque supabase-js limpia el enlace de la barra de direcciones. */
const LLEGADA_CLAVE = /type=(invite|recovery)/.test(location.hash);
(async function boot() {
  const url = CFG.SUPABASE_URL || lsGet('ce_url'),
    key = CFG.SUPABASE_ANON_KEY || lsGet('ce_key');
  if (url && key && window.supabase) {
    try {
      sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
      S.demo = false;
    } catch (e) {
      console.error(e);
    }
  }
  if (S.demo) {
    await loadHist();
    seedDemo();
    S.profile = { ...DEMO.profiles[0] };
    S.user = { email: S.profile.email };
    await demoAudit('requerimientos', 'INSERT', 'seed', { nota: 'Carga inicial de demostración' }, 'sistema');
    return enterApp();
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await afterLogin(data.session);
  else showLogin();
})();
/* Gancho para las pruebas automáticas: solo existe si se construye con --pruebas y se abre con ?cetest */
if (CE_BUILD.pruebas && /[?&]cetest\b/.test(location.search))
  window.__CE_TEST = {
    go: v => go(v),
    NAV,
    rol: () => rol(),
    view: () => S.view,
    closeModal: () => closeModal(),
    dir: () => DIRLIST,
    contactsOf: o => contactsOf(o),
    orgs: () => mainOrgsAll(),
    estado: () => ({ S, HIST, sb, PM }),
    qrSeguro: q => qrSeguro(q)
  };
