import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { prepararImagen, olvidarMiniatura } from '../utils/imagenes';
import { useUi } from '../context/UiContext';
import { VisorImagenesLista } from './VisorImagenesLista';

const MAX_IMAGENES = 6;

// Gestión de imágenes de un producto (dentro de "Editar producto"). Son
// solo para el vendedor: no salen en comprobantes ni presupuestos.
// Se pueden subir con el botón o arrastrando fotos al recuadro.
export default function ImagenesProducto({ productoId, onCambio }) {
  const { toast, confirm } = useUi();
  const [imagenes, setImagenes] = useState(null);
  const [subiendo, setSubiendo] = useState(0); // cuántas faltan subir
  const [arrastrando, setArrastrando] = useState(false);
  const [ampliada, setAmpliada] = useState(null); // índice
  const inputRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    api.get(`/productos/${productoId}/imagenes`)
      .then((data) => { if (vivo) setImagenes(data.imagenes); })
      .catch((err) => { if (vivo) { toast(err.message, { type: 'error' }); setImagenes([]); } });
    return () => { vivo = false; };
  }, [productoId, toast]);

  function cambio(lista) {
    olvidarMiniatura(productoId);
    onCambio?.(lista.length);
  }

  async function subirArchivos(archivos) {
    const fotos = archivos.filter((a) => a.type.startsWith('image/'));
    if (fotos.length === 0) return;
    const lugar = MAX_IMAGENES - (imagenes?.length || 0);
    if (lugar <= 0) {
      toast(`Máximo ${MAX_IMAGENES} imágenes por producto`, { type: 'error' });
      return;
    }
    const aSubir = fotos.slice(0, lugar);
    setSubiendo(aSubir.length);
    let lista = [...(imagenes || [])];
    try {
      for (const archivo of aSubir) {
        const datos = await prepararImagen(archivo);
        const nueva = await api.post(`/productos/${productoId}/imagenes`, datos);
        lista = [...lista, nueva];
        setImagenes(lista);
        setSubiendo((n) => n - 1);
      }
      if (fotos.length > lugar) toast(`Se subieron solo ${lugar} (máximo ${MAX_IMAGENES})`, { type: 'error' });
      else toast(aSubir.length > 1 ? 'Imágenes agregadas ✓' : 'Imagen agregada ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setSubiendo(0);
      cambio(lista);
    }
  }

  async function eliminar(img) {
    const ok = await confirm('¿Borrar esta imagen?', { danger: true, confirmLabel: 'Borrar' });
    if (!ok) return;
    try {
      await api.delete(`/productos/${productoId}/imagenes/${img.id}`);
      const lista = imagenes.filter((i) => i.id !== img.id);
      setImagenes(lista);
      cambio(lista);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  async function hacerPrincipal(img) {
    try {
      await api.put(`/productos/${productoId}/imagenes/${img.id}/principal`, {});
      const lista = [img, ...imagenes.filter((i) => i.id !== img.id)];
      setImagenes(lista);
      cambio(lista);
      toast('Imagen principal cambiada ✓');
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  const cerrarVisor = useCallback(() => setAmpliada(null), []);
  const lleno = (imagenes?.length || 0) >= MAX_IMAGENES;

  return (
    <div
      className={`galeria-producto${arrastrando ? ' arrastrando' : ''}`}
      onDragOver={(e) => { if (!lleno) { e.preventDefault(); setArrastrando(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false); }}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); subirArchivos([...(e.dataTransfer.files || [])]); }}
    >
      {imagenes === null ? (
        <p className="muted" style={{ margin: 0 }}>Cargando...</p>
      ) : (
        <div className="galeria-grid">
          {imagenes.map((img, i) => (
            <div key={img.id} className="galeria-item">
              <button type="button" className="galeria-foto" onClick={() => setAmpliada(i)} title="Ver grande">
                <img src={img.miniatura} alt="" />
              </button>
              {i === 0 && <span className="galeria-chip">Principal</span>}
              <div className="galeria-acciones">
                {i !== 0 && (
                  <button type="button" onClick={() => hacerPrincipal(img)} title="Usar como principal" aria-label="Usar como principal">★</button>
                )}
                <button type="button" className="peligro" onClick={() => eliminar(img)} title="Borrar" aria-label="Borrar">🗑</button>
              </div>
            </div>
          ))}
          {Array.from({ length: subiendo }).map((_, i) => (
            <div key={`sub-${i}`} className="galeria-item galeria-subiendo"><span className="spinner-chico" /></div>
          ))}
          {!lleno && !subiendo && (
            <button type="button" className="galeria-agregar" onClick={() => inputRef.current?.click()}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
              <span>Agregar foto</span>
            </button>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; subirArchivos(f); }} />
      <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
        Hasta {MAX_IMAGENES} fotos. Podés arrastrarlas acá. Solo las ves vos (no salen en comprobantes ni facturas); la principal es la que aparece en las búsquedas.
      </p>
      {ampliada != null && imagenes?.[ampliada] && (
        <VisorImagenesLista imagenes={imagenes} inicial={ampliada} onCerrar={cerrarVisor} />
      )}
    </div>
  );
}
