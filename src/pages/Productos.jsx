import { useState } from 'react';
import ProductosLista from './ProductosLista';
import HistorialStock from './HistorialStock';

// Productos se divide en dos vistas, elegibles arriba: la lista de productos
// de siempre y el historial de cada ingreso de stock (alta, restock, ajuste).
// La vista elegida se recuerda para la proxima vez que se entre.
const CLAVE = 'productos_vista';

export default function Productos() {
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem(CLAVE) === 'historial' ? 'historial' : 'productos'; } catch { return 'productos'; }
  });

  function elegir(v) {
    setVista(v);
    try { localStorage.setItem(CLAVE, v); } catch { /* sin storage: no pasa nada */ }
  }

  return (
    <>
      <div className="vista-tabs-barra">
        <div className="vista-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={vista === 'productos'} className={vista === 'productos' ? 'activo' : ''} onClick={() => elegir('productos')}>Productos</button>
          <button type="button" role="tab" aria-selected={vista === 'historial'} className={vista === 'historial' ? 'activo' : ''} onClick={() => elegir('historial')}>Historial de stock</button>
        </div>
      </div>
      {vista === 'productos' ? <ProductosLista /> : <HistorialStock />}
    </>
  );
}
