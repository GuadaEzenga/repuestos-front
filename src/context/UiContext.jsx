import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Contexto chico para dos cosas que se repiten en toda la app:
//  - toast(mensaje, opciones): un aviso flotante que se autodestruye solo,
//    para reemplazar los guardados "silenciosos" (onBlur, etc.) donde antes
//    no había ninguna señal de que algo se guardó (o falló).
//  - confirm(mensaje, opciones): una ventana de confirmación propia en vez
//    de window.confirm(), reusando el mismo estilo de modal que "Recarga".
const UiContext = createContext(null);

let idSeq = 0;

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null); // { mensaje, opciones, resolve }
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const resolverRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Aviso global de "sin conexión": el navegador avisa cuando se cae o
  // vuelve el wifi/datos, así no hay que adivinar por qué nada se guarda.
  useEffect(() => {
    function marcarOnline() { setOnline(true); }
    function marcarOffline() { setOnline(false); }
    window.addEventListener('online', marcarOnline);
    window.addEventListener('offline', marcarOffline);
    return () => {
      window.removeEventListener('online', marcarOnline);
      window.removeEventListener('offline', marcarOffline);
    };
  }, []);

  const toast = useCallback((mensaje, opciones = {}) => {
    const { type = 'success', duration = 3000 } = opciones;
    const id = ++idSeq;
    setToasts((prev) => [...prev, { id, mensaje, type }]);
    if (duration) {
      setTimeout(() => dismissToast(id), duration);
    }
    return id;
  }, [dismissToast]);

  const confirm = useCallback((mensaje, opciones = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({ mensaje, opciones });
    });
  }, []);

  function resolverConfirm(valor) {
    setConfirmState(null);
    if (resolverRef.current) {
      resolverRef.current(valor);
      resolverRef.current = null;
    }
  }

  // Escape cierra el modal de confirmación (como cancelar), igual que el
  // click afuera o la X — es el gesto que cualquiera espera.
  useEffect(() => {
    if (!confirmState) return;
    function alEscape(e) {
      if (e.key === 'Escape') resolverConfirm(false);
    }
    window.addEventListener('keydown', alEscape);
    return () => window.removeEventListener('keydown', alEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}

      {!online && (
        <div className="offline-bar">Sin conexión a internet — los cambios no se van a guardar hasta que vuelva</div>
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
            {t.mensaje}
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) resolverConfirm(false); }}>
          <div className="modal-ventana modal-ventana-vertical">
            <div className="modal-header">
              <h2>{confirmState.opciones.titulo || 'Confirmar'}</h2>
              <button type="button" className="modal-cerrar" onClick={() => resolverConfirm(false)} aria-label="Cerrar">×</button>
            </div>
            <p style={{ marginTop: 0 }}>{confirmState.mensaje}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn-secondary" onClick={() => resolverConfirm(false)}>Cancelar</button>
              <button
                type="button"
                className={confirmState.opciones.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => resolverConfirm(true)}
                autoFocus
              >
                {confirmState.opciones.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi debe usarse dentro de <UiProvider>');
  return ctx;
}
