/**
 * src/js/03-estado-y-permisos.js
 * Estado global de la sesión (S), roles (ROLES), menú y permisos por pantalla (NAV) y títulos (TITLES). NAV es la fuente única de qué ve cada rol.
 * Depende de: 02-utilidades.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* ---------- estado ---------- */
const S = {
  demo: true,
  user: null,
  profile: null,
  vigencia: new Date().getFullYear(),
  reqs: [],
  entes: [],
  deps: [],
  cfg: { dias_rojo: 5, correo_disciplinario: '' },
  view: 'tablero',
  f: { q: '', sem: '', ente: '', dep: '' },
  preselect: null
};
let sb = null;

/* ---------- permisos por rol (espejo de las políticas RLS) ---------- */
const ALL = ['admin', 'alcalde', 'control_interno', 'secretario', 'enlace'];
const SUPERV = ['admin', 'alcalde', 'control_interno'];
const NAV = [
  {
    g: 'Centro de mando',
    items: [
      { id: 'mando', label: 'Centro de mando', icon: 'fa-satellite-dish', roles: SUPERV },
      {
        id: 'dependencia',
        label: 'Expediente de dependencia',
        labelScoped: 'Mi dependencia',
        icon: 'fa-building-columns',
        roles: ALL
      },
      { id: 'notificaciones', label: 'Notificaciones WhatsApp', icon: 'fa-paper-plane', roles: SUPERV },
      {
        id: 'informe',
        label: 'Informe ejecutivo',
        labelScoped: 'Informe de mi dependencia',
        icon: 'fa-file-pdf',
        roles: ALL
      }
    ]
  },
  {
    g: 'Operación',
    items: [
      { id: 'tablero', label: 'Tablero y métricas', icon: 'fa-chart-pie', roles: ALL },
      { id: 'requerimientos', label: 'Requerimientos', icon: 'fa-file-lines', roles: ALL },
      {
        id: 'carga',
        label: 'Cargar respuesta ORFEO',
        icon: 'fa-file-circle-check',
        roles: ['admin', 'secretario', 'enlace']
      },
      {
        id: 'alertas',
        label: 'Alertas y escalamiento',
        icon: 'fa-bell',
        roles: ['admin', 'alcalde', 'control_interno', 'enlace'],
        badge: true
      }
    ]
  },
  {
    g: 'Mejoramiento',
    items: [
      {
        id: 'planes',
        label: 'Planes de mejoramiento',
        labelScoped: 'Mis acciones de mejora',
        icon: 'fa-list-check',
        roles: ALL,
        badgeFn: () => pmBadge()
      }
    ]
  },
  {
    g: 'Directorio',
    items: [
      { id: 'entes', label: 'Entes de control', icon: 'fa-landmark', roles: SUPERV },
      { id: 'dependencias', label: 'Dependencias', icon: 'fa-sitemap', roles: SUPERV },
      { id: 'directorio', label: 'Directorio del gabinete', icon: 'fa-address-book', roles: SUPERV }
    ]
  },
  {
    g: 'Analítica',
    items: [
      { id: 'cumplimiento', label: 'Cumplimiento por secretaría', icon: 'fa-ranking-star', roles: SUPERV },
      {
        id: 'cruces',
        label: 'Cruces y temas',
        labelScoped: 'Temas y cruces',
        icon: 'fa-code-merge',
        roles: ALL,
        badgeFn: () => cruceAlertCount()
      },
      { id: 'historico', label: 'Histórico de radicados', icon: 'fa-database', roles: ALL },
      { id: 'reportes', label: 'Reportes y exportación', icon: 'fa-chart-column', roles: SUPERV }
    ]
  },
  {
    g: 'Seguridad',
    items: [
      { id: 'actividad', label: 'Actividad y cambios', icon: 'fa-clock-rotate-left', roles: SUPERV },
      { id: 'auditoria', label: 'Auditoría', icon: 'fa-fingerprint', roles: SUPERV },
      { id: 'cuentas', label: 'Cuentas y roles', icon: 'fa-users-gear', roles: ['admin'] }
    ]
  },
  { g: 'Sistema', items: [{ id: 'config', label: 'Configuración', icon: 'fa-gear', roles: ['admin'] }] }
];
const TITLES = {
  cruces: [
    'Cruces y temas',
    'Clasificación por tema y alertas cuando varios entes piden sobre el mismo caso'
  ],
  planes: ['Planes de mejoramiento', 'Hallazgos de las contralorías, acciones, avances y cumplimiento'],
  mando: ['Centro de mando', 'Visibilidad total del cumplimiento frente a los entes de control'],
  dependencia: ['Expediente de dependencia', 'Desempeño, pendientes y tendencia'],
  notificaciones: ['Notificaciones WhatsApp', 'Bitácora de avisos a secretarios y directores'],
  directorio: ['Directorio del gabinete', 'Secretarios y directores: nombre y celular'],
  informe: ['Informe ejecutivo', 'Documento descargable con gráficos y huella de verificación'],
  actividad: ['Actividad y cambios', 'Quién modificó, notificó e ingresó'],
  tablero: ['Tablero y métricas', 'Semáforo de cumplimiento por vigencia'],
  requerimientos: ['Requerimientos', 'Solicitudes de los entes de control'],
  carga: ['Cargar respuesta ORFEO', 'Cierre de requerimientos con soporte verificado'],
  alertas: ['Alertas y escalamiento', 'Requerimientos críticos y vencidos'],
  entes: ['Entes de control', 'Directorio de organismos de vigilancia'],
  dependencias: ['Dependencias', 'Secretarías y departamentos responsables'],
  cumplimiento: ['Cumplimiento por secretaría', 'Tablero de alerta: quién responde tarde o incumple'],
  historico: ['Histórico de radicados', 'Vigencias 2024, 2025 y 2026 (Excel consolidados)'],
  reportes: ['Reportes y exportación', 'Consolidado por vigencia'],
  auditoria: ['Auditoría', 'Pista inmutable con firma SHA-256'],
  cuentas: ['Cuentas y roles', 'Control de acceso por perfil'],
  config: ['Configuración', 'Conexión y parámetros del sistema']
};
const rol = () => (S.profile ? S.profile.rol : null);
const canRole = list => list.includes(rol());
const canWrite = () => canRole(['admin', 'enlace']);
const canClose = () => canRole(['admin', 'secretario', 'enlace']);
const canEscalate = () => canRole(['admin', 'alcalde', 'control_interno', 'enlace']);
