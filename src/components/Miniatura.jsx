import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/client';
import { obtenerMiniatura, suscribirMiniaturas } from '../utils/imagenes';

function IconoImagen({ tam }) {
  const t = Math.round(tam * 0.45);
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-8 8" />
    </svg>
  );
}

// Miniatura de la primera imagen del producto (solo para el vendedor).
// - Sin imágenes: un cuadrito gris con un ícono (así todo queda alineado).
//   Si se pasa onSinImagen, al tocarlo se llama (ej. abrir Editar para subir).
// - Con imagen: al pasar el mouse muestra una vista previa más grande, y al
//   hacer click abre el visor con todas las fotos.
export default function Miniatura({ productoId, cantidadImagenes, tam = 36, descripcion = '', onSinImagen }) {
  const tiene = Number(cantidadImagenes) > 0;
  const [, forzar] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [preview, setPreview] = useState(null); // { top, left }

  useEffect(() => {
    if (!tiene) return undefined;
    return suscribirMiniaturas(() => forzar((n) => n + 1));
  }, [tiene]);

  const cerrar = useCallback(() => setAbierto(false), []);

  if (!tiene) {
    return (
      <span
        className={`miniatura miniatura-vacia${onSinImagen ? ' miniatura-clickeable' : ''}`}
        style={{ width: tam, height: tam }}
        title={onSinImagen ? 'Sin imagen — tocá para agregar' : 'Sin imagen'}
        onClick={onSinImagen ? (e) => { e.stopPropagation(); onSinImagen(); } : undefined}
      >
        <IconoImagen tam={tam} />
      </span>
    );
  }

  const src = obtenerMiniatura(productoId);

  function mostrarPreview(e) {
    if (!src || window.matchMedia('(hover: none)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const lado = 220;
    let left = r.right + 10;
    if (left + lado > window.innerWidth - 8) left = r.left - lado - 10;
    let top = r.top + r.height / 2 - lado / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - lado - 8));
    setPreview({ top, left });
  }

  return (
    <>
      <span
        className={`miniatura${src ? '' : ' miniatura-cargando'}`}
        style={{ width: tam, height: tam }}
        onMouseEnter={mostrarPreview}
        onMouseLeave={() => setPreview(null)}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); setPreview(null); setAbierto(true); }}
      >
        {src ? <img src={src} alt="" loading="lazy" /> : null}
      </span>
      {preview && src && createPortal(
        <div className="miniatura-preview" style={{ top: preview.top, left: preview.left }}>
          <img src={src} alt="" />
        </div>,
        document.body
      )}
      {abierto && <VisorImagenes productoId={productoId} descripcion={descripcion} onCerrar={cerrar} />}
    </>
  );
}

// Visor a pantalla completa (fondo oscuro, flechas, teclado ← →, Esc).
export function VisorImagenes({ productoId, descripcion, onCerrar }) {
  const [imagenes, setImagenes] = useState(null);
  const [actual, setActual] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get(`/productos/${productoId}/imagenes`)
      .then((data) => { if (vivo) setImagenes(data.imagenes); })
      .catch((err) => { if (vivo) setError(err.message); });
    return () => { vivo = false; };
  }, [productoId]);

  const total = imagenes?.length || 0;
  const mover = useCallback((delta) => {
    if (!total) return;
    setActual((i) => (i + delta + total) % total);
  }, [total]);

  useEffect(() => {
    function alTeclado(e) {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight') mover(1);
      if (e.key === 'ArrowLeft') mover(-1);
    }
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [onCerrar, mover]);

  // Portal al body + preventDefault en mousedown: así abrirlo desde el
  // buscador de Nueva venta no le saca el foco al buscador (que cerraría la
  // lista de resultados y con ella este visor).
  return createPortal(
    <div
      className="lightbox"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (e.target === e.currentTarget) onCerrar(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="lightbox-barra">
        <span className="lightbox-titulo">{descripcion}</span>
        {total > 1 && <span className="lightbox-contador">{actual + 1} / {total}</span>}
        <button type="button" className="lightbox-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>

      <div className="lightbox-centro" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
        {!imagenes && !error && <span className="spinner" />}
        {imagenes && total === 0 && <p style={{ color: '#d1d5db' }}>Este producto no tiene imágenes.</p>}
        {total > 0 && <img className="lightbox-img" src={imagenes[actual]?.imagen} alt="" />}
        {total > 1 && (
          <>
            <button type="button" className="lightbox-flecha izq" onClick={() => mover(-1)} aria-label="Anterior">‹</button>
            <button type="button" className="lightbox-flecha der" onClick={() => mover(1)} aria-label="Siguiente">›</button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="lightbox-tiras">
          {imagenes.map((img, i) => (
            <button key={img.id} type="button" className={`lightbox-tira${i === actual ? ' activa' : ''}`} onClick={() => setActual(i)}>
              <img src={img.miniatura} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
