// Integridad y respaldo de archivos (2.x: archivoVerificar y archivoZip de src/js/19-planes-norma-y-memoria.js):
// verifica que cada archivo exista y conserve su huella, y descarga todos en un ZIP con su manifiesto.
import { useState, type ReactNode } from 'react';
import { fechaColombia } from '../../dominio/fechas';
import { huellaArchivo } from '../../dominio/huella-archivo';
import {
  ENCABEZADO_MANIFIESTO,
  crearZip,
  csvManifiesto,
  filaManifiesto,
  utf8,
  type ArchivoInventario
} from '../../dominio/respaldo-archivos';
import { Icono, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const huella = (buf: ArrayBuffer) => huellaArchivo({ arrayBuffer: () => Promise.resolve(buf) });

export function ArchivosRespaldo() {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<ReactNode>(null);

  const verificar = async () => {
    setOcupado(true);
    try {
      const inv = await planes.inventarioArchivos();
      let ok = 0;
      const faltan: string[] = [],
        alterados: string[] = [];
      for (let i = 0; i < inv.length; i++) {
        const it = inv[i] as ArchivoInventario;
        setEstado(`Verificando ${i + 1} de ${inv.length}…`);
        const b = await planes.descargarArchivo(it);
        if (!b) {
          faltan.push(it.nombre);
          continue;
        }
        const sha = await huella(b);
        if (it.sha256 && sha !== it.sha256) alterados.push(it.nombre);
        else ok++;
      }
      setEstado(
        <>
          <b>
            {ok} de {inv.length}
          </b>{' '}
          archivos completos y sin alteraciones.
          {faltan.length > 0 && (
            <>
              <br />
              <span style={{ color: 'var(--redink)' }}>
                Faltan {faltan.length}: {faltan.slice(0, 5).join(', ')}
                {faltan.length > 5 ? '…' : ''}
              </span>
            </>
          )}
          {alterados.length > 0 && (
            <>
              <br />
              <span style={{ color: 'var(--redink)' }}>
                Huella distinta en {alterados.length}: {alterados.slice(0, 5).join(', ')}
              </span>
            </>
          )}
        </>
      );
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  const zip = async () => {
    setOcupado(true);
    try {
      const inv = await planes.inventarioArchivos();
      if (!inv.length) {
        avisar('No hay archivos para respaldar', 'ok');
        return;
      }
      const archivos: { nombre: string; datos: Uint8Array }[] = [];
      const filas: string[][] = [ENCABEZADO_MANIFIESTO];
      for (let i = 0; i < inv.length; i++) {
        const it = inv[i] as ArchivoInventario;
        setEstado(`Descargando ${i + 1} de ${inv.length}…`);
        const b = await planes.descargarArchivo(it);
        if (!b) {
          filas.push(filaManifiesto(it, null));
          continue;
        }
        filas.push(filaManifiesto(it, await huella(b)));
        archivos.push({ nombre: `${it.deposito}/${it.path}`, datos: new Uint8Array(b) });
      }
      archivos.unshift({ nombre: 'MANIFIESTO.csv', datos: utf8(csvManifiesto(filas)) });
      const z = crearZip(archivos, new Date());
      const nom = `archivos_control_entes_${fechaColombia(new Date())}.zip`;
      const u = URL.createObjectURL(new Blob([z], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = u;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
      setEstado(
        <>
          Respaldo de archivos descargado: <b>{archivos.length - 1}</b> archivos y su manifiesto (
          {(z.length / 1048576).toFixed(1)} MB).
        </>
      );
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn sm" disabled={ocupado} onClick={() => void verificar()}>
          <Icono nombre="fa-shield-halved" /> Verificar archivos
        </button>
        <button type="button" className="btn sm" disabled={ocupado} onClick={() => void zip()}>
          <Icono nombre="fa-file-zipper" /> Descargar archivos (ZIP)
        </button>
      </div>
      <div id="respArchivos" className="hint" aria-live="polite">
        {estado}
      </div>
    </>
  );
}
