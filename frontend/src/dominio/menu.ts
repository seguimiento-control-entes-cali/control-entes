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
