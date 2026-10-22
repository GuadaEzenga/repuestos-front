import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/client';
import { obtenerMiniatura, suscribirMiniaturas } from '../utils/imagenes';

// Miniatura de la primera imagen del producto (solo para el vendedor).
// Si el producto no tiene imágenes (cantidad_imagenes = 0) no pide nada.
// Click: abre las imágenes en grande.
export default function Miniatura({ productoId, cantidadImagenes, tam = 36, descripcion = '' }) {
  const tiene = Number(cantidadImagenes) > 0;
  const [, forzar] = useState(0);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!tiene) return undefined;
    return suscribirMiniaturas(() => forzar((n) => n + 1));
  }, [tiene]);

  if (!tiene) return <span style={{ display: 'inline-block', width: tam, height: tam, flexShrink: 0 }} />;
  const src = obtenerMiniatura(productoId);

  return (
    <>
      <span
        className="miniatura"
        style={{ width: tam, height: tam }}
        title="Ver imágenes"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
      >
        {src ? <img src={src} alt="" /> : null}
      </span>
      {abierto && <VisorImagenes productoId={productoId} descripcion={descripcion} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

export function VisorImagenes({ productoId, descripcion, onCerrar }) {
  const [imagenes, setImagenes] = useState(null);
  const [actual, setActual] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get(`/productos/${productoId}/imagenes`)
      .then((data) => { if (vivo) setImagenes(data.imagenes); })
      .catch((err) => { if (vivo) setError(err.message); });
    function alEscape(e) { if (e.key === 'Escape') onCerrar(); }
    window.addEventListener('keydown', alEscape);
    return () => { vivo = false; window.removeEventListener('keydown', alEscape); };
  }, [productoId, onCerrar]);

  // Portal al body + preventDefault en mousedown: así abrirlo desde el
  // buscador de Nueva venta no le saca el foco al buscador (que cerraría la
  // lista de resultados y con ella este visor).
  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (e.target === e.currentTarget) onCerrar(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-ventana modal-ventana-ancha">
        <div className="modal-header">
          <h2 style={{ fontSize: 16 }}>{descripcion || 'Imágenes'}</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        {error && <div className="error-box">{error}</div>}
        {!imagenes && !error && <p className="muted">Cargando...</p>}
        {imagenes && imagenes.length === 0 && <p className="muted">Este producto no tiene imágenes.</p>}
        {imagenes && imagenes.length > 0 && (
          <>
            <img src={imagenes[actual]?.imagen} alt="" style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8, background: '#f3f4f6' }} />
            {imagenes.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {imagenes.map((img, i) => (
                  <button key={img.id} type="button" onClick={() => setActual(i)} className="miniatura" style={{ width: 52, height: 52, padding: 0, outline: i === actual ? '2px solid var(--primary)' : 'none' }}>
                    <img src={img.miniatura} alt="" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
