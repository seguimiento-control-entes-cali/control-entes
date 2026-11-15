// Exportar el plan en el formato de la contraloría (2.x: pmExportModal, pmAvisoFaltantes y pmDoExport de
// src/js/19-planes-de-mejoramiento.js). Mismo HTML y clases (field, warn-card, hint). Pendiente para la entrega 4:
// guardar una copia en el archivo documental del plan (en la 2.x, solo con el script 20).
import { useState } from 'react';
import { fechaColombia } from '../../dominio/fechas';
import { fechaPlan, type Accion, type DatosPlanes, type Plan } from '../../dominio/planes';
import {
  faltantesExport,
  hojaAvanceSemestral,
  hojaPM01,
  hojaPM02,
  hojasF14,
  nombreF14,
  nombreSIA
} from '../../dominio/planes-exportar';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { cargarSheetJS } from '../configuracion/leer-excel';

const corto = (t: string) => (t.length > 70 ? t.slice(0, 70) + '…' : t);

export function VentanaExportar({
  p,
  d,
  dep,
  usuario,
  corteInicial,
  edita,
  completar,
  alCerrar
}: {
  p: Plan;
  d: DatosPlanes;
  dep: (id: number | null | undefined) => string;
  usuario: string;
  corteInicial: string;
  edita: boolean;
  completar: (a: Accion) => void;
  alCerrar: () => void;
}) {
  const avisar = useAvisos();
  const [fmt, setFmt] = useState(p.formato === 'F14_CGR' ? 'F14_CGR' : 'PM_01_CGSC');
  const [corte, setCorte] = useState(corteInicial);
  const [ocupado, setOcupado] = useState(false);
  const f = faltantesExport(p, d);
  const descargar = async () => {
    if (!fechaPlan(corte)) return avisar('Indica la fecha de corte', 'error');
    setOcupado(true);
    try {
      const X = await cargarSheetJS();
      const ctx = { d, dep, usuario, v19: d.v19 !== false };
      const wb = X.utils.book_new();
      if (fmt === 'F14_CGR') {
        const [w1, w2] = hojasF14(X, p, corte, ctx);
        X.utils.book_append_sheet(wb, w1, 'Informe Plan de mejoramiento ');
        X.utils.book_append_sheet(wb, w2, 'Avance Plan de Mejoramiento');
      } else if (fmt === 'PM_01_AVANCE') {
        X.utils.book_append_sheet(wb, hojaAvanceSemestral(X, p, corte, ctx), 'Formato PM_01 CGSC - AVANCE ');
      } else {
        X.utils.book_append_sheet(wb, hojaPM01(X, p, corte, ctx), 'Formato PM_01 CGSC - PLAN ');
        if (p.formato === 'PM_01_CGSC')
          X.utils.book_append_sheet(wb, hojaPM02(X, p, corte, ctx), 'Formato PM_02 CGSC - AVANCE ');
      }
      // CGSC: nombre exigido por el SIA Contralorías (manual «Subida de planes de mejoramiento»)
      const nom =
        fmt === 'F14_CGR'
          ? nombreF14(p, corte)
          : nombreSIA(p, fechaColombia(new Date()), {
              avance: fmt === 'PM_01_AVANCE',
              corte: fmt === 'PM_01_AVANCE' ? corte : null
            });
      X.writeFile(wb, nom, { compression: true });
      alCerrar();
      avisar('Formato descargado: ' + nom, 'ok');
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal
      abierto
      titulo="Exportar en el formato de la contraloría"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void descargar()}>
            <Icono nombre="fa-download" /> Descargar Excel
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pmEFmt">Formato</label>
        <select id="pmEFmt" value={fmt} onChange={e => setFmt(e.target.value)}>
          <option value="PM_01_CGSC">PM_01 CGSC · formulación y avance (Contraloría de Cali)</option>
          {p.formato === 'PM_01_CGSC' && (
            <option value="PM_01_AVANCE">
              PM_01 CGSC · informe semestral de avance (art. 11: columnas 16, 17 y 18)
            </option>
          )}
          <option value="F14_CGR">Formularios 14 y 14.1 · suscripción y seguimiento (CGR)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="pmECorte">Fecha de corte / evaluación</label>
        <input id="pmECorte" type="date" value={corte} onChange={e => setCorte(e.target.value)} />
        <div className="hint">
          Se toma el último avance VALIDADO hasta esta fecha. Los avances por validar no se incluyen.
        </div>
      </div>
      {(f.plan.length > 0 || f.acciones.length > 0) && (
        <div className="card warn-card" id="pmEAviso" style={{ margin: '8px 0', padding: '10px 12px' }}>
          <b>
            <Icono nombre="fa-triangle-exclamation" /> Hay datos incompletos.
          </b>{' '}
          Puede exportar igual: lo que falta queda como celda vacía.
          <ul style={{ margin: '6px 0 4px 18px' }}>
            {f.plan.map(t => (
              <li key={t}>Plan: sin {t}</li>
            ))}
            {f.acciones.map(a => {
              const t = [
                a.faltan.length ? 'falta ' + a.faltan.join(', ') : '',
                a.cero ? 'cantidad 0: en el F14 el porcentaje de avance mostrará #DIV/0!' : ''
              ]
                .filter(Boolean)
                .join(' · ');
              const acc = d.acciones.find(x => x.id === a.id);
              return (
                <li key={a.id}>
                  Hallazgo {a.hallazgo} · «{corto(a.accion)}»: {t}
                  {edita && acc && (
                    <>
                      {' '}
                      <button type="button" className="btn sm" onClick={() => completar(acc)}>
                        Completar
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="hint">
            El F14 usa la fecha de suscripción, las fechas de inicio y de terminación y la cantidad; PM_01 y
            PM_02 usan la fecha de terminación.
          </div>
        </div>
      )}
      <div className="hint">
        Para la CGSC, el archivo se nombra como lo exige el SIA Contralorías (FORMATO_202001_PM_CGSC_…); para
        el informe semestral use como corte el 30 de junio o el 31 de diciembre. El archivo de la CGR trae los
        cálculos del Formulario 14.1 como fórmulas de Excel. Revíselo antes de firmarlo y cargarlo en el
        aplicativo de la contraloría.
      </div>
    </Modal>
  );
}
