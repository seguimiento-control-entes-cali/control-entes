// ARCHIVO GENERADO por frontend/scripts/tipos-bd.mjs (npm run tipos:bd). NO EDITAR A MANO.
// Fuente: supabase/00_instalar_todo.sql instalado en PGlite (sin conectarse a Supabase). Diferencias con producción: F4.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      accesos: {
        Row: {
          id: number;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id?: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      alertas_log: {
        Row: {
          id: number;
          requerimiento_id: string;
          canal: string;
          enviado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          requerimiento_id: string;
          canal: string;
          enviado_por?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          requerimiento_id?: string;
          canal?: string;
          enviado_por?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      archivo_documentos: {
        Row: {
          id: string;
          plan_id: string | null;
          requerimiento_id: string | null;
          tipo: string;
          nombre: string;
          path: string;
          mime: string;
          tamano: number;
          sha256: string;
          radicado_orfeo: string;
          observaciones: string;
          subido_por: string | null;
          subido_email: string;
          created_at: string;
          eliminado_at: string | null;
          eliminado_por: string | null;
        };
        Insert: {
          id?: string;
          plan_id?: string | null;
          requerimiento_id?: string | null;
          tipo: string;
          nombre: string;
          path: string;
          mime?: string;
          tamano?: number;
          sha256: string;
          radicado_orfeo?: string;
          observaciones?: string;
          subido_por?: string | null;
          subido_email?: string;
          created_at?: string;
          eliminado_at?: string | null;
          eliminado_por?: string | null;
        };
        Update: {
          id?: string;
          plan_id?: string | null;
          requerimiento_id?: string | null;
          tipo?: string;
          nombre?: string;
          path?: string;
          mime?: string;
          tamano?: number;
          sha256?: string;
          radicado_orfeo?: string;
          observaciones?: string;
          subido_por?: string | null;
          subido_email?: string;
          created_at?: string;
          eliminado_at?: string | null;
          eliminado_por?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          tabla: string;
          registro_id: string;
          accion: string;
          usuario: string;
          payload: Json;
          cambios: Json;
          prev_hash: string;
          hash: string;
          created_at: string;
          txid: number | null;
        };
        Insert: {
          id?: never;
          tabla: string;
          registro_id: string;
          accion: string;
          usuario: string;
          payload: Json;
          cambios?: Json;
          prev_hash: string;
          hash: string;
          created_at?: string;
          txid?: number | null;
        };
        Update: {
          id?: never;
          tabla?: string;
          registro_id?: string;
          accion?: string;
          usuario?: string;
          payload?: Json;
          cambios?: Json;
          prev_hash?: string;
          hash?: string;
          created_at?: string;
          txid?: number | null;
        };
        Relationships: [];
      };
      config: {
        Row: {
          id: number;
          dias_rojo: number;
          correo_disciplinario: string;
          resumen_activo: boolean;
          resumen_ultimo: string | null;
          resumen_ultimo_detalle: string;
          respaldo_ultimo: string | null;
          respaldo_ultimo_detalle: string;
          avisos_activo: boolean;
          avisos_copia_correo: string;
          avisos_ultimo: string | null;
          avisos_ultimo_detalle: string;
        };
        Insert: {
          id?: number;
          dias_rojo?: number;
          correo_disciplinario?: string;
          resumen_activo?: boolean;
          resumen_ultimo?: string | null;
          resumen_ultimo_detalle?: string;
          respaldo_ultimo?: string | null;
          respaldo_ultimo_detalle?: string;
          avisos_activo?: boolean;
          avisos_copia_correo?: string;
          avisos_ultimo?: string | null;
          avisos_ultimo_detalle?: string;
        };
        Update: {
          id?: number;
          dias_rojo?: number;
          correo_disciplinario?: string;
          resumen_activo?: boolean;
          resumen_ultimo?: string | null;
          resumen_ultimo_detalle?: string;
          respaldo_ultimo?: string | null;
          respaldo_ultimo_detalle?: string;
          avisos_activo?: boolean;
          avisos_copia_correo?: string;
          avisos_ultimo?: string | null;
          avisos_ultimo_detalle?: string;
        };
        Relationships: [];
      };
      cruce_revision: {
        Row: {
          clave: string;
          estado: string;
          nota: string;
          usuario: string | null;
          updated_at: string;
          id: number;
        };
        Insert: {
          clave: string;
          estado: string;
          nota?: string;
          usuario?: string | null;
          updated_at?: string;
          id?: never;
        };
        Update: {
          clave?: string;
          estado?: string;
          nota?: string;
          usuario?: string | null;
          updated_at?: string;
          id?: never;
        };
        Relationships: [];
      };
      cuentas_eventos: {
        Row: {
          id: number;
          accion: string;
          actor: string;
          detalle: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          accion: string;
          actor: string;
          detalle?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          accion?: string;
          actor?: string;
          detalle?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      dependencias: {
        Row: {
          id: number;
          nombre: string;
          secretario_nombre: string;
          correo: string;
          telefono: string;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: never;
          nombre: string;
          secretario_nombre?: string;
          correo?: string;
          telefono?: string;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: never;
          nombre?: string;
          secretario_nombre?: string;
          correo?: string;
          telefono?: string;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      directorio: {
        Row: {
          id: number;
          organismo: string;
          cargo: string;
          nombre: string;
          telefono: string;
          updated_by: string | null;
          updated_at: string;
          correo: string;
        };
        Insert: {
          id?: never;
          organismo: string;
          cargo: string;
          nombre?: string;
          telefono?: string;
          updated_by?: string | null;
          updated_at?: string;
          correo?: string;
        };
        Update: {
          id?: never;
          organismo?: string;
          cargo?: string;
          nombre?: string;
          telefono?: string;
          updated_by?: string | null;
          updated_at?: string;
          correo?: string;
        };
        Relationships: [];
      };
      entes: {
        Row: {
          id: number;
          nombre: string;
          sigla: string;
          tipo: string;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id?: never;
          nombre: string;
          sigla?: string;
          tipo?: string;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: never;
          nombre?: string;
          sigla?: string;
          tipo?: string;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      eventos_sistema: {
        Row: {
          id: number;
          created_at: string;
          origen: string;
          nivel: string;
          mensaje: string;
          detalle: Json;
          usuario: string | null;
          revisado: boolean;
        };
        Insert: {
          id?: never;
          created_at?: string;
          origen: string;
          nivel: string;
          mensaje: string;
          detalle?: Json;
          usuario?: string | null;
          revisado?: boolean;
        };
        Update: {
          id?: never;
          created_at?: string;
          origen?: string;
          nivel?: string;
          mensaje?: string;
          detalle?: Json;
          usuario?: string | null;
          revisado?: boolean;
        };
        Relationships: [];
      };
      historico_cargas: {
        Row: {
          id: number;
          created_at: string;
          usuario: string;
          archivos: string[];
          vigencias: number[];
          registros: number;
          corte: string | null;
          resultado: Json;
        };
        Insert: {
          id?: never;
          created_at?: string;
          usuario?: string;
          archivos?: string[];
          vigencias: number[];
          registros: number;
          corte?: string | null;
          resultado?: Json;
        };
        Update: {
          id?: never;
          created_at?: string;
          usuario?: string;
          archivos?: string[];
          vigencias?: number[];
          registros?: number;
          corte?: string | null;
          resultado?: Json;
        };
        Relationships: [];
      };
      historico_requerimientos: {
        Row: {
          id: number;
          vigencia: number;
          radicacion_ente: string | null;
          ente: string | null;
          orfeo_entrada: string | null;
          fecha_recibo: string | null;
          organismo: string;
          tipo_organismo: string | null;
          asunto: string | null;
          termino_dias_habiles: number | null;
          fecha_maxima: string | null;
          orfeo_respuesta: string | null;
          fecha_respuesta: string | null;
          respondio: string | null;
          tardia: string | null;
          oportunidad: string;
          retraso_dias_habiles: number | null;
          dias_habiles_responder: number | null;
          estado_excel: string | null;
          observaciones: string | null;
          fila_excel: number | null;
          hoja_excel: string;
        };
        Insert: {
          id?: never;
          vigencia: number;
          radicacion_ente?: string | null;
          ente?: string | null;
          orfeo_entrada?: string | null;
          fecha_recibo?: string | null;
          organismo: string;
          tipo_organismo?: string | null;
          asunto?: string | null;
          termino_dias_habiles?: number | null;
          fecha_maxima?: string | null;
          orfeo_respuesta?: string | null;
          fecha_respuesta?: string | null;
          respondio?: string | null;
          tardia?: string | null;
          oportunidad: string;
          retraso_dias_habiles?: number | null;
          dias_habiles_responder?: number | null;
          estado_excel?: string | null;
          observaciones?: string | null;
          fila_excel?: number | null;
          hoja_excel?: string;
        };
        Update: {
          id?: never;
          vigencia?: number;
          radicacion_ente?: string | null;
          ente?: string | null;
          orfeo_entrada?: string | null;
          fecha_recibo?: string | null;
          organismo?: string;
          tipo_organismo?: string | null;
          asunto?: string | null;
          termino_dias_habiles?: number | null;
          fecha_maxima?: string | null;
          orfeo_respuesta?: string | null;
          fecha_respuesta?: string | null;
          respondio?: string | null;
          tardia?: string | null;
          oportunidad?: string;
          retraso_dias_habiles?: number | null;
          dias_habiles_responder?: number | null;
          estado_excel?: string | null;
          observaciones?: string | null;
          fila_excel?: number | null;
          hoja_excel?: string;
        };
        Relationships: [];
      };
      informes: {
        Row: {
          id: number;
          generado_por: string;
          alcance: string;
          vigencias: string;
          corte: string | null;
          n_registros: number;
          huella: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          generado_por?: string;
          alcance: string;
          vigencias: string;
          corte?: string | null;
          n_registros?: number;
          huella: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          generado_por?: string;
          alcance?: string;
          vigencias?: string;
          corte?: string | null;
          n_registros?: number;
          huella?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      notificaciones: {
        Row: {
          id: number;
          organismo: string;
          destinatario: string;
          telefono: string;
          plantilla: string;
          n_items: number;
          canal: string;
          mensaje: string;
          enviado_por: string | null;
          created_at: string;
          correo: string;
        };
        Insert: {
          id?: never;
          organismo: string;
          destinatario?: string;
          telefono?: string;
          plantilla: string;
          n_items?: number;
          canal?: string;
          mensaje: string;
          enviado_por?: string | null;
          created_at?: string;
          correo?: string;
        };
        Update: {
          id?: never;
          organismo?: string;
          destinatario?: string;
          telefono?: string;
          plantilla?: string;
          n_items?: number;
          canal?: string;
          mensaje?: string;
          enviado_por?: string | null;
          created_at?: string;
          correo?: string;
        };
        Relationships: [];
      };
      pm_acciones: {
        Row: {
          id: string;
          plan_id: string;
          hallazgo_id: string;
          dependencia_id: number | null;
          responsable: string;
          accion: string;
          proposito: string;
          actividad: string;
          meta: string;
          unidad_medida: string;
          cantidad: number;
          fuente_verificacion: string;
          lugar_verificacion: string;
          fecha_inicio: string;
          fecha_fin: string;
          avance: number;
          fecha_corte: string | null;
          orden: number;
          created_at: string;
          updated_at: string;
          cal_cumplimiento: number | null;
          cal_efectividad: number | null;
          obs_ci: string;
          obs_ci_estado: string;
          obs_ci_at: string | null;
          fecha_fin_original: string | null;
        };
        Insert: {
          id?: string;
          plan_id: string;
          hallazgo_id: string;
          dependencia_id?: number | null;
          responsable?: string;
          accion: string;
          proposito?: string;
          actividad?: string;
          meta?: string;
          unidad_medida?: string;
          cantidad?: number;
          fuente_verificacion?: string;
          lugar_verificacion?: string;
          fecha_inicio: string;
          fecha_fin: string;
          avance?: number;
          fecha_corte?: string | null;
          orden?: number;
          created_at?: string;
          updated_at?: string;
          cal_cumplimiento?: number | null;
          cal_efectividad?: number | null;
          obs_ci?: string;
          obs_ci_estado?: string;
          obs_ci_at?: string | null;
          fecha_fin_original?: string | null;
        };
        Update: {
          id?: string;
          plan_id?: string;
          hallazgo_id?: string;
          dependencia_id?: number | null;
          responsable?: string;
          accion?: string;
          proposito?: string;
          actividad?: string;
          meta?: string;
          unidad_medida?: string;
          cantidad?: number;
          fuente_verificacion?: string;
          lugar_verificacion?: string;
          fecha_inicio?: string;
          fecha_fin?: string;
          avance?: number;
          fecha_corte?: string | null;
          orden?: number;
          created_at?: string;
          updated_at?: string;
          cal_cumplimiento?: number | null;
          cal_efectividad?: number | null;
          obs_ci?: string;
          obs_ci_estado?: string;
          obs_ci_at?: string | null;
          fecha_fin_original?: string | null;
        };
        Relationships: [];
      };
      pm_avances: {
        Row: {
          id: string;
          accion_id: string;
          plan_id: string;
          dependencia_id: number | null;
          fecha_corte: string;
          cantidad: number;
          descripcion: string;
          radicado_orfeo: string;
          soporte_path: string | null;
          soporte_hash: string | null;
          estado: string;
          observacion: string;
          reportado_por: string | null;
          reportado_email: string;
          revisado_por: string | null;
          revisado_email: string;
          revisado_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          accion_id: string;
          plan_id: string;
          dependencia_id?: number | null;
          fecha_corte: string;
          cantidad: number;
          descripcion: string;
          radicado_orfeo?: string;
          soporte_path?: string | null;
          soporte_hash?: string | null;
          estado?: string;
          observacion?: string;
          reportado_por?: string | null;
          reportado_email?: string;
          revisado_por?: string | null;
          revisado_email?: string;
          revisado_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          accion_id?: string;
          plan_id?: string;
          dependencia_id?: number | null;
          fecha_corte?: string;
          cantidad?: number;
          descripcion?: string;
          radicado_orfeo?: string;
          soporte_path?: string | null;
          soporte_hash?: string | null;
          estado?: string;
          observacion?: string;
          reportado_por?: string | null;
          reportado_email?: string;
          revisado_por?: string | null;
          revisado_email?: string;
          revisado_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pm_avisos: {
        Row: {
          id: number;
          accion_id: string;
          tipo: string;
          fecha_fin: string;
          dependencia_id: number | null;
          correo: string;
          copia: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          accion_id: string;
          tipo: string;
          fecha_fin: string;
          dependencia_id?: number | null;
          correo?: string;
          copia?: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          accion_id?: string;
          tipo?: string;
          fecha_fin?: string;
          dependencia_id?: number | null;
          correo?: string;
          copia?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      pm_hallazgos: {
        Row: {
          id: string;
          plan_id: string;
          numero: string;
          descripcion: string;
          causa: string;
          efecto: string;
          connotaciones: string[];
          cuantia: number | null;
          macroproceso: string;
          orden: number;
          created_at: string;
          updated_at: string;
          dependencia_id: number | null;
          dependencia_texto: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          numero: string;
          descripcion: string;
          causa?: string;
          efecto?: string;
          connotaciones?: string[];
          cuantia?: number | null;
          macroproceso?: string;
          orden?: number;
          created_at?: string;
          updated_at?: string;
          dependencia_id?: number | null;
          dependencia_texto?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          numero?: string;
          descripcion?: string;
          causa?: string;
          efecto?: string;
          connotaciones?: string[];
          cuantia?: number | null;
          macroproceso?: string;
          orden?: number;
          created_at?: string;
          updated_at?: string;
          dependencia_id?: number | null;
          dependencia_texto?: string;
        };
        Relationships: [];
      };
      pm_informes_avance: {
        Row: {
          id: string;
          plan_id: string;
          corte: string;
          fecha_envio: string;
          radicado_orfeo: string;
          documento_id: string | null;
          observaciones: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          corte: string;
          fecha_envio: string;
          radicado_orfeo?: string;
          documento_id?: string | null;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          corte?: string;
          fecha_envio?: string;
          radicado_orfeo?: string;
          documento_id?: string | null;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pm_planes: {
        Row: {
          id: string;
          formato: string;
          ente_id: number | null;
          contraloria: string;
          entidad: string;
          nit: string;
          representante_legal: string;
          ordenador_gasto: string;
          ejercicio: string;
          tipo_ejercicio: string;
          modalidad: string;
          vigencia_pvcft: string;
          periodo_auditado: string;
          numero_informe: string;
          radicado_orfeo: string;
          fecha_informe: string | null;
          fecha_suscripcion: string;
          estado: string;
          observaciones: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          requerimiento_id: string | null;
          direccion_tecnica: string;
          resolucion: string;
          fecha_radicacion_informe: string | null;
          plan_origen_id: string | null;
        };
        Insert: {
          id?: string;
          formato: string;
          ente_id?: number | null;
          contraloria: string;
          entidad?: string;
          nit?: string;
          representante_legal?: string;
          ordenador_gasto?: string;
          ejercicio: string;
          tipo_ejercicio?: string;
          modalidad?: string;
          vigencia_pvcft?: string;
          periodo_auditado?: string;
          numero_informe?: string;
          radicado_orfeo?: string;
          fecha_informe?: string | null;
          fecha_suscripcion: string;
          estado?: string;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          requerimiento_id?: string | null;
          direccion_tecnica?: string;
          resolucion?: string;
          fecha_radicacion_informe?: string | null;
          plan_origen_id?: string | null;
        };
        Update: {
          id?: string;
          formato?: string;
          ente_id?: number | null;
          contraloria?: string;
          entidad?: string;
          nit?: string;
          representante_legal?: string;
          ordenador_gasto?: string;
          ejercicio?: string;
          tipo_ejercicio?: string;
          modalidad?: string;
          vigencia_pvcft?: string;
          periodo_auditado?: string;
          numero_informe?: string;
          radicado_orfeo?: string;
          fecha_informe?: string | null;
          fecha_suscripcion?: string;
          estado?: string;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          requerimiento_id?: string | null;
          direccion_tecnica?: string;
          resolucion?: string;
          fecha_radicacion_informe?: string | null;
          plan_origen_id?: string | null;
        };
        Relationships: [];
      };
      pm_prorrogas: {
        Row: {
          id: string;
          plan_id: string;
          accion_id: string | null;
          tipo: string;
          corte: string | null;
          fecha_solicitud: string;
          radicado_solicitud: string;
          fecha_vencimiento_anterior: string;
          fecha_nueva: string;
          estado: string;
          radicado_respuesta: string;
          fecha_respuesta: string | null;
          observaciones: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          accion_id?: string | null;
          tipo: string;
          corte?: string | null;
          fecha_solicitud: string;
          radicado_solicitud?: string;
          fecha_vencimiento_anterior: string;
          fecha_nueva: string;
          estado?: string;
          radicado_respuesta?: string;
          fecha_respuesta?: string | null;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          accion_id?: string | null;
          tipo?: string;
          corte?: string | null;
          fecha_solicitud?: string;
          radicado_solicitud?: string;
          fecha_vencimiento_anterior?: string;
          fecha_nueva?: string;
          estado?: string;
          radicado_respuesta?: string;
          fecha_respuesta?: string | null;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pm_restauraciones: {
        Row: {
          audit_id: number;
          restaurado_por: string | null;
          restaurado_at: string;
        };
        Insert: {
          audit_id: number;
          restaurado_por?: string | null;
          restaurado_at?: string;
        };
        Update: {
          audit_id?: number;
          restaurado_por?: string | null;
          restaurado_at?: string;
        };
        Relationships: [];
      };
      pm_traslados: {
        Row: {
          id: string;
          plan_id: string;
          hallazgo_id: string;
          tipo: string;
          destino: string;
          radicado: string;
          fecha: string | null;
          estado: string;
          observaciones: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          hallazgo_id: string;
          tipo: string;
          destino: string;
          radicado?: string;
          fecha?: string | null;
          estado?: string;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          hallazgo_id?: string;
          tipo?: string;
          destino?: string;
          radicado?: string;
          fecha?: string | null;
          estado?: string;
          observaciones?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          nombre: string | null;
          rol: string;
          dependencia_id: number | null;
          activo: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          nombre?: string | null;
          rol?: string;
          dependencia_id?: number | null;
          activo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          nombre?: string | null;
          rol?: string;
          dependencia_id?: number | null;
          activo?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      requerimientos: {
        Row: {
          id: string;
          radicado: string;
          vigencia: number;
          ente_id: number;
          dependencia_id: number;
          asunto: string;
          fecha_radicacion: string;
          fecha_limite: string;
          estado: string;
          orfeo_salida: string | null;
          fecha_cierre: string | null;
          soporte_path: string | null;
          soporte_hash: string | null;
          escalado_at: string | null;
          created_by: string | null;
          created_at: string;
          hist_key: string | null;
        };
        Insert: {
          id?: string;
          radicado: string;
          vigencia: number;
          ente_id: number;
          dependencia_id: number;
          asunto: string;
          fecha_radicacion?: string;
          fecha_limite: string;
          estado?: string;
          orfeo_salida?: string | null;
          fecha_cierre?: string | null;
          soporte_path?: string | null;
          soporte_hash?: string | null;
          escalado_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          hist_key?: string | null;
        };
        Update: {
          id?: string;
          radicado?: string;
          vigencia?: number;
          ente_id?: number;
          dependencia_id?: number;
          asunto?: string;
          fecha_radicacion?: string;
          fecha_limite?: string;
          estado?: string;
          orfeo_salida?: string | null;
          fecha_cierre?: string | null;
          soporte_path?: string | null;
          soporte_hash?: string | null;
          escalado_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          hist_key?: string | null;
        };
        Relationships: [];
      };
      tema_manual: {
        Row: {
          row_key: string;
          tema: string;
          usuario: string | null;
          updated_at: string;
          id: number;
        };
        Insert: {
          row_key: string;
          tema: string;
          usuario?: string | null;
          updated_at?: string;
          id?: never;
        };
        Update: {
          row_key?: string;
          tema?: string;
          usuario?: string | null;
          updated_at?: string;
          id?: never;
        };
        Relationships: [];
      };
    };
    Views: {
      v_cumplimiento_organismo: {
        Row: {
          organismo: string | null;
          vigencia: number | null;
          a_tiempo: number | null;
          tardias: number | null;
          sin_respuesta: number | null;
          incumplimientos: number | null;
          evaluables: number | null;
          pct_incumplimiento: number | null;
          semaforo: string | null;
        };
        Relationships: [];
      };
      v_directorio_verificacion: {
        Row: {
          problema: string | null;
          dependencia: string | null;
          detalle: string | null;
        };
        Relationships: [];
      };
      v_requerimientos: {
        Row: {
          id: string | null;
          radicado: string | null;
          vigencia: number | null;
          ente_id: number | null;
          dependencia_id: number | null;
          asunto: string | null;
          fecha_radicacion: string | null;
          fecha_limite: string | null;
          estado: string | null;
          orfeo_salida: string | null;
          fecha_cierre: string | null;
          soporte_path: string | null;
          soporte_hash: string | null;
          escalado_at: string | null;
          created_by: string | null;
          created_at: string | null;
          ente: string | null;
          ente_sigla: string | null;
          dependencia: string | null;
          dias_restantes: number | null;
          semaforo: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      audit_hash: {
        Args: {
          p_prev: string;
          p_tabla: string;
          p_accion: string;
          p_registro: string;
          p_usuario: string;
          p_ts: string;
          p_payload: Json;
          p_cambios: Json;
        };
        Returns: string;
      };
      cargar_historico: {
        Args: {
          p: Json;
        };
        Returns: Json;
      };
      cerrar_requerimiento: {
        Args: {
          p_id: string;
          p_orfeo: string;
          p_fecha: string;
          p_path: string;
          p_hash: string;
        };
        Returns: Database['public']['Tables']['requerimientos']['Row'];
      };
      current_dep: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      current_dep_name: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_rol: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      escalar_requerimiento: {
        Args: {
          p_id: string;
          p_canal: string;
        };
        Returns: undefined;
      };
      fecha_colombia: {
        Args: {
          p_ts: string;
        };
        Returns: string;
      };
      hoy_colombia: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      org_key: {
        Args: {
          t: string;
        };
        Returns: string;
      };
      org_oficial: {
        Args: {
          t: string;
        };
        Returns: string;
      };
      pm_eliminar_plan: {
        Args: {
          p_id: string;
        };
        Returns: undefined;
      };
      pm_importar: {
        Args: {
          p: Json;
        };
        Returns: string;
      };
      pm_misma_operacion: {
        Args: {
          a: Database['public']['Tables']['audit_log']['Row'];
          b: Database['public']['Tables']['audit_log']['Row'];
        };
        Returns: boolean;
      };
      pm_papelera: {
        Args: Record<PropertyKey, never>;
        Returns: {
          audit_id: number;
          tabla: string;
          registro_id: string;
          plan_id: string;
          descripcion: string;
          eliminado_por: string;
          eliminado_at: string;
          dependientes: number;
        }[];
      };
      pm_reinsertar: {
        Args: {
          p_tabla: string;
          p_payload: Json;
        };
        Returns: undefined;
      };
      pm_reportar_avance: {
        Args: {
          p_accion: string;
          p_fecha: string;
          p_cantidad: number;
          p_descripcion: string;
          p_orfeo: string;
          p_path: string;
          p_hash: string;
          p_validar: boolean;
        };
        Returns: string;
      };
      pm_resolucion_de: {
        Args: {
          p_formato: string;
          p_resolucion: string;
          p_fecha: string;
        };
        Returns: string;
      };
      pm_resolver_prorroga: {
        Args: {
          p_id: string;
          p_estado: string;
          p_radicado: string;
          p_fecha: string;
        };
        Returns: undefined;
      };
      pm_restaurar: {
        Args: {
          p_audit_id: number;
        };
        Returns: string;
      };
      pm_revisar_avance: {
        Args: {
          p_id: string;
          p_estado: string;
          p_observacion: string;
        };
        Returns: undefined;
      };
      registrar_error_app: {
        Args: {
          p_mensaje: string;
          p_detalle: Json;
        };
        Returns: undefined;
      };
      respaldo_lote: {
        Args: {
          p_tabla: string;
          p_orden: string;
          p_desde: number;
          p_cantidad: number;
        };
        Returns: string;
      };
      sembrar_desde_historico: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      verificar_cadena_auditoria: {
        Args: Record<PropertyKey, never>;
        Returns: { ok: boolean; total: number; primer_id_roto: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
