import { useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { prepararImagen, olvidarMiniatura } from '../utils/imagenes';
import { useUi } from '../context/UiContext';

const MAX_IMAGENES = 6;

// Gestión de imágenes de un producto (dentro de "Editar producto"). Son
// solo para el vendedor: no salen en comprobantes ni presupuestos.
export default function ImagenesProducto({ productoId, onCambio }) {
  const { toast, confirm } = useUi();
  const [imagenes, setImagenes] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ampliada, setAmpliada] = useState(null);
  const inputRef = useRef(null);

  async function cargar() {
    try {
      const data = await api.get(`/productos/${productoId}/imagenes`);
      setImagenes(data.imagenes);
    } catch (err) {
      toast(err.message, { type: 'error' });
      setImagenes([]);
    }
  }

  useEffect(() => { cargar(); }, [productoId]); // eslint-disable-line react-hooks/exhaustive-deps

  function cambio(lista) {
    olvidarMiniatura(productoId);
    onCambio?.(lista.length);
  }

  async function subir(e) {
    const archivos = [...(e.target.files || [])];
    e.target.value = '';
    if (archivos.length === 0) return;
    const lugar = MAX_IMAGENES - (imagenes?.length || 0);
    if (lugar <= 0) {
      toast(`Máximo ${MAX_IMAGENES} imágenes por producto`, { type: 'error' });
      return;
    }
    setSubiendo(true);
    let lista = [...(imagenes || [])];
    try {
      for (const archivo of archivos.slice(0, lugar)) {
        const datos = await prepararImagen(archivo);
        const nueva = await api.post(`/productos/${productoId}/imagenes`, datos);
        lista = [...lista, nueva];
        setImagenes(lista);
      }
      toast(archivos.length > 1 ? 'Imágenes agregadas ✓' : 'Imagen agregada ✓');
      if (archivos.length > lugar) toast(`Se subieron solo ${lugar} (máximo ${MAX_IMAGENES})`, { type: 'error' });
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setSubiendo(false);
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
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
        Solo las ves vos (al buscar y vender). No salen en comprobantes ni facturas. La primera es la que aparece en las búsquedas.
      </p>
      {imagenes === null ? (
        <p className="muted">Cargando...</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {imagenes.map((img, i) => (
            <div key={img.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button type="button" className="miniatura" style={{ width: 72, height: 72, padding: 0 }} onClick={() => setAmpliada(img)} title="Ver grande">
                <img src={img.miniatura} alt="" />
              </button>
              <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                {i === 0 ? <span className="muted">principal</span> : <button type="button" className="btn-link" style={{ padding: 0, fontSize: 11 }} onClick={() => hacerPrincipal(img)}>principal</button>}
                <button type="button" className="btn-link-danger" style={{ padding: 0, fontSize: 11 }} onClick={() => eliminar(img)}>borrar</button>
              </div>
            </div>
          ))}
          {imagenes.length < MAX_IMAGENES && (
            <button type="button" className="btn-secondary" style={{ width: 72, height: 72 }} onClick={() => inputRef.current?.click()} disabled={subiendo}>
              {subiendo ? '...' : '+ Foto'}
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={subir} />
        </div>
      )}
      {ampliada && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setAmpliada(null); }}>
          <div className="modal-ventana modal-ventana-ancha">
            <div className="modal-header">
              <span />
              <button type="button" className="modal-cerrar" onClick={() => setAmpliada(null)} aria-label="Cerrar">×</button>
            </div>
            <img src={ampliada.imagen} alt="" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
}
