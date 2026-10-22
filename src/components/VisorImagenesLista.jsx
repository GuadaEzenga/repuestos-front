import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Visor a pantalla completa para una lista de imágenes ya cargada.
export function VisorImagenesLista({ imagenes, inicial = 0, titulo = '', onCerrar }) {
  const [actual, setActual] = useState(inicial);
  const total = imagenes.length;
  const mover = useCallback((d) => setActual((i) => (i + d + total) % total), [total]);

  useEffect(() => {
    function alTeclado(e) {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight') mover(1);
      if (e.key === 'ArrowLeft') mover(-1);
    }
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [onCerrar, mover]);

  return createPortal(
    <div className="lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="lightbox-barra">
        <span className="lightbox-titulo">{titulo}</span>
        {total > 1 && <span className="lightbox-contador">{actual + 1} / {total}</span>}
        <button type="button" className="lightbox-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
      </div>
      <div className="lightbox-centro" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <img className="lightbox-img" src={imagenes[actual]?.imagen} alt="" />
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
