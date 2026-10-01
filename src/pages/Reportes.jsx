import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';

const PAGE_SIZE = 10;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

// Paginacion simple sobre un array ya cargado (estos reportes no son tan
// grandes como para justificar paginar del lado del servidor).
function usePaginado(items) {
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [items]);
  const totalPaginas = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visibles = useMemo(() => items.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE), [items, pagina]);
  return { pagina, setPagina, totalPaginas, visibles };
}

function Paginador({ pagina, totalPaginas, onCambiar }) {
  if (totalPaginas <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <button type="button" className="btn-secondary" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>Anterior</button>
      <span className="muted" style={{ fontSize: 12 }}>Página {pagina} de {totalPaginas}</span>
      <button type="button" className="btn-secondary" disabled={pagina >= totalPaginas} onClick={() => onCambiar(pagina + 1)}>Siguiente</button>
    </div>
  );
}

export default function Reportes() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState(hoyISO());
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [stock, setStock] = useState([]);
  const [filtroStock, setFiltroStock] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function cargar(desdeParam, hastaParam, cantidadStock) {
    setLoading(true);
    setError(null);
    try {
      const [dataClientes, dataProductos, dataStock] = await Promise.all([
        api.get('/reportes/mejores-clientes', { desde: desdeParam || undefined, hasta: hastaParam || undefined }),
        api.get('/reportes/productos-mas-vendidos', { desde: desdeParam || undefined, hasta: hastaParam || undefined }),
        api.get('/reportes/stock', cantidadStock !== '' ? { cantidad: cantidadStock } : {}),
      ]);
      setClientes(dataClientes.clientes);
      setProductos(dataProductos.productos);
      setStock(dataStock.productos);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(desde, hasta, filtroStock); }, []);

  function aplicarFiltro(e) {
    e.preventDefault();
    cargar(desde, hasta, filtroStock);
  }

  function aplicarFiltroStock(e) {
    e.preventDefault();
    const valor = parseNumero(filtroStock);
    cargar(desde, hasta, valor == null ? '' : valor);
  }

  const paginadoClientes = usePaginado(clientes);
  const paginadoProductos = usePaginado(productos);
  const paginadoStock = usePaginado(stock);

  return (
    <div className="page">
      <h1>Reportes</h1>

      <form className="date-filters" onSubmit={aplicarFiltro} style={{ marginBottom: 20 }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span className="muted">a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button type="submit" className="primary">Filtrar</button>
        <span className="muted" style={{ fontSize: 12 }}>(vacío = desde siempre)</span>
      </form>

      {error && <div className="error-box">{error}</div>}
      {loading ? (
        <div className="loading">Cargando...</div>
      ) : (
        <div className="charts-grid-3">
          <div className="panel">
            <h2>Mejores clientes</h2>
            <table className="simple-table">
              <thead><tr><th>Cliente</th><th>Compras</th><th>Gastado</th></tr></thead>
              <tbody>
                {clientes.length === 0 && <tr><td colSpan={3} className="muted">Sin datos en el período</td></tr>}
                {paginadoClientes.visibles.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre} {c.apellido}</td>
                    <td>{c.cantidad_compras}</td>
                    <td>{formatoMoneda(c.total_gastado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador pagina={paginadoClientes.pagina} totalPaginas={paginadoClientes.totalPaginas} onCambiar={paginadoClientes.setPagina} />
          </div>

          <div className="panel">
            <h2>Productos más vendidos</h2>
            <table className="simple-table">
              <thead><tr><th>Producto</th><th>Unidades</th><th>Ingresos</th></tr></thead>
              <tbody>
                {productos.length === 0 && <tr><td colSpan={3} className="muted">Sin datos en el período</td></tr>}
                {paginadoProductos.visibles.map((p) => (
                  <tr key={p.producto_id}>
                    <td>{p.descripcion}</td>
                    <td>{p.unidades}</td>
                    <td>{formatoMoneda(p.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador pagina={paginadoProductos.pagina} totalPaginas={paginadoProductos.totalPaginas} onCambiar={paginadoProductos.setPagina} />
          </div>

          <div className="panel">
            <h2 style={{ marginBottom: 10 }}>Stock</h2>
            <form onSubmit={aplicarFiltroStock} className="form-row" style={{ marginBottom: 12 }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Filtrar por cantidad exacta (ej: 0)"
                value={filtroStock}
                onChange={(e) => setFiltroStock(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-secondary">Filtrar</button>
              {filtroStock !== '' && (
                <button type="button" className="btn-secondary" onClick={() => { setFiltroStock(''); cargar(desde, hasta, ''); }}>
                  Ver todo
                </button>
              )}
            </form>
            <table className="simple-table">
              <thead><tr><th>Producto</th><th>Stock</th></tr></thead>
              <tbody>
                {stock.length === 0 && <tr><td colSpan={2} className="muted">Sin productos</td></tr>}
                {paginadoStock.visibles.map((p) => (
                  <tr key={p.id}>
                    <td>{p.descripcion}</td>
                    <td style={{ color: Number(p.stock) <= 0 ? 'var(--danger)' : 'inherit' }}>{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador pagina={paginadoStock.pagina} totalPaginas={paginadoStock.totalPaginas} onCambiar={paginadoStock.setPagina} />
          </div>
        </div>
      )}
    </div>
  );
}
