// Menú por rol. Porte de NAV en src/js/03-estado-y-permisos.js de la 2.x (mismos grupos, pantallas, textos y
// roles; la paridad se comprueba en pruebas/paridad-2x.test.ts). Solo decide qué se muestra: la seguridad real
// la dan las políticas RLS de la base de datos.
import { esSupervision, type Rol } from './roles';

export interface OpcionMenu {
  id: string;
  texto: string;
}
export interface GrupoMenu {
  grupo: string;
  opciones: OpcionMenu[];
}

interface Definicion {
  id: string;
  texto: string;
  /** Texto para secretario y enlace, que solo ven su dependencia (labelScoped de la 2.x). */
  textoPropio?: string;
  roles: readonly Rol[];
}

const TODOS: readonly Rol[] = ['admin', 'alcalde', 'control_interno', 'secretario', 'enlace'];
const SUPERVISION: readonly Rol[] = ['admin', 'alcalde', 'control_interno'];

export const MENU: readonly { grupo: string; opciones: readonly Definicion[] }[] = [
  {
    grupo: 'Centro de mando',
    opciones: [
      { id: 'mando', texto: 'Centro de mando', roles: SUPERVISION },
      { id: 'dependencia', texto: 'Expediente de dependencia', textoPropio: 'Mi dependencia', roles: TODOS },
      { id: 'notificaciones', texto: 'Notificaciones WhatsApp', roles: SUPERVISION },
      { id: 'informe', texto: 'Informe ejecutivo', textoPropio: 'Informe de mi dependencia', roles: TODOS }
    ]
  },
  {
    grupo: 'Operación',
    opciones: [
      { id: 'tablero', texto: 'Tablero y métricas', roles: TODOS },
      { id: 'requerimientos', texto: 'Requerimientos', roles: TODOS },
      { id: 'carga', texto: 'Cargar respuesta ORFEO', roles: ['admin', 'secretario', 'enlace'] },
      {
        id: 'alertas',
        texto: 'Alertas y escalamiento',
        roles: ['admin', 'alcalde', 'control_interno', 'enlace']
      }
    ]
  },
  {
    grupo: 'Mejoramiento',
    opciones: [
      { id: 'planes', texto: 'Planes de mejoramiento', textoPropio: 'Mis acciones de mejora', roles: TODOS }
    ]
  },
  {
    grupo: 'Directorio',
    opciones: [
      { id: 'entes', texto: 'Entes de control', roles: SUPERVISION },
      { id: 'dependencias', texto: 'Dependencias', roles: SUPERVISION },
      { id: 'directorio', texto: 'Directorio del gabinete', roles: SUPERVISION }
    ]
  },
  {
    grupo: 'Analítica',
    opciones: [
      { id: 'cumplimiento', texto: 'Cumplimiento por secretaría', roles: SUPERVISION },
      { id: 'cruces', texto: 'Cruces y temas', textoPropio: 'Temas y cruces', roles: TODOS },
      { id: 'historico', texto: 'Histórico de radicados', roles: TODOS },
      { id: 'reportes', texto: 'Reportes y exportación', roles: SUPERVISION }
    ]
  },
  {
    grupo: 'Seguridad',
    opciones: [
      { id: 'actividad', texto: 'Actividad y cambios', roles: SUPERVISION },
      { id: 'auditoria', texto: 'Auditoría', roles: SUPERVISION },
      { id: 'cuentas', texto: 'Cuentas y roles', roles: ['admin'] }
    ]
  },
  { grupo: 'Sistema', opciones: [{ id: 'config', texto: 'Configuración', roles: ['admin'] }] }
];

/** Grupos y opciones que ve un rol, sin grupos vacíos. */
export function menuDe(rol: Rol): GrupoMenu[] {
  const propio = !esSupervision(rol);
  return MENU.map(g => ({
    grupo: g.grupo,
    opciones: g.opciones
      .filter(o => o.roles.includes(rol))
      .map(o => ({ id: o.id, texto: propio && o.textoPropio ? o.textoPropio : o.texto }))
  })).filter(g => g.opciones.length > 0);
}

/** Primera pantalla del rol (la 2.x abre el Centro de mando a supervisión y "Mi dependencia" a los demás). */
export function pantallaInicial(rol: Rol): string {
  return menuDe(rol)[0]?.opciones[0]?.id ?? 'dependencia';
}

/** Ícono de Font Awesome de cada pantalla (icon de NAV en la 2.x). */
export const ICONO: Readonly<Record<string, string>> = {
  mando: 'fa-satellite-dish',
  dependencia: 'fa-building-columns',
  notificaciones: 'fa-paper-plane',
  informe: 'fa-file-pdf',
  tablero: 'fa-chart-pie',
  requerimientos: 'fa-file-lines',
  carga: 'fa-file-circle-check',
  alertas: 'fa-bell',
  planes: 'fa-list-check',
  entes: 'fa-landmark',
  dependencias: 'fa-sitemap',
  directorio: 'fa-address-book',
  cumplimiento: 'fa-ranking-star',
  cruces: 'fa-code-merge',
  historico: 'fa-database',
  reportes: 'fa-chart-column',
  actividad: 'fa-clock-rotate-left',
  auditoria: 'fa-fingerprint',
  cuentas: 'fa-users-gear',
  config: 'fa-gear'
};

/** Título y subtítulo de la barra superior (TITLES de la 2.x). */
export const TITULO: Readonly<Record<string, readonly [string, string]>> = {
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

/** Barra inferior del celular (renderTabbar de la 2.x): hasta 4 pantallas preferidas del rol y "Menú". */
export const TEXTO_CORTO: Readonly<Record<string, string>> = {
  mando: 'Mando',
  notificaciones: 'Avisos',
  informe: 'Informe',
  requerimientos: 'Requerim.',
  carga: 'ORFEO',
  alertas: 'Alertas',
  cruces: 'Cruces',
  planes: 'Mejora',
  cumplimiento: 'Ranking',
  tablero: 'Tablero'
};
export function pestanasDe(rol: Rol): { id: string; texto: string }[] {
  const propio = !esSupervision(rol);
  const permitidas = new Set(menuDe(rol).flatMap(g => g.opciones.map(o => o.id)));
  const preferidas = propio
    ? ['dependencia', 'requerimientos', 'carga', 'informe']
    : ['mando', 'dependencia', 'notificaciones', 'informe', 'alertas', 'cumplimiento'];
  return preferidas
    .filter(id => permitidas.has(id))
    .slice(0, 4)
    .map(id => ({
      id,
      texto: id === 'dependencia' ? (propio ? 'Mi dependencia' : 'Expediente') : (TEXTO_CORTO[id] ?? id)
    }));
}
