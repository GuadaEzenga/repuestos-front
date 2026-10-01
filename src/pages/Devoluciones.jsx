import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';

const PAGE_SIZE = 30;
const PAGE_SIZE_VENTAS = 10;

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

function redondear(valor, unidad) {
  return Math.round(valor / unidad) * unidad;
}

export default function Devoluciones() {
  // --- Tabla de ventas para elegir cuál devolver/cambiar (igual que en
  // Ventas: tabla con detalle expandible, click para seleccionar la venta) ---
  const [ventasTabla, setVentasTabla] = useState([]);
  const [totalVentasTabla, setTotalVentasTabla] = useState(0);
  const [pageVentasTabla, setPageVentasTabla] = useState(1);
  const [loadingVentasTabla, setLoadingVentasTabla] = useState(true);
  const [busquedaVenta, setBusquedaVenta] = useState('');
  const [abiertoDetalleVenta, setAbiertoDetalleVenta] = useState(null);
  const [detalleVentaTabla, setDetalleVentaTabla] = useState(null);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);

  // --- Formulario de devolucion/cambio ---
  const [itemId, setItemId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState('reembolso');
  const [busquedaProductoNuevo, setBusquedaProductoNuevo] = useState('');
  const [resultadosProductoNuevo, setResultadosProductoNuevo] = useState([]);
  const [productoNuevo, setProductoNuevo] = useState(null);
  const [cantidadNueva, setCantidadNueva] = useState('1');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const [config, setConfig] = useState(null);

  // --- Historial ---
  const [historial, setHistorial] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingHistorial, setLoadingHistorial] = useState(true);

  useEffect(() => { api.get('/config').then(setConfig); }, []);

  async function cargarHistorial(paginaParam) {
    setLoadingHistorial(true);
    try {
      const data = await api.get('/devoluciones', { page: paginaParam, pageSize: PAGE_SIZE });
      setHistorial(data.devoluciones);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingHistorial(false);
    }
  }

  useEffect(() => { cargarHistorial(1); }, []);

  async function cargarVentasTabla(paginaParam) {
    setLoadingVentasTabla(true);
    setError(null);
    try {
      const data = await api.get('/ventas', { page: paginaParam, pageSize: PAGE_SIZE_VENTAS });
      setVentasTabla(data.ventas);
      setTotalVentasTabla(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingVentasTabla(false);
    }
  }

  useEffect(() => { cargarVentasTabla(1); }, []);

  function cambiarPaginaVentasTabla(p) {
    setPageVentasTabla(p);
    cargarVentasTabla(p);
  }

  // Búsqueda local por N° de venta o nombre de cliente (misma lógica de
  // "coincide por sustring" que el resto del sistema), sobre lo ya cargado --
  // si no encuentra nada en la página actual, sugiere usar el buscador de
  // Ventas para ubicarla y volver.
  const ventasFiltradas = busquedaVenta.trim()
    ? ventasTabla.filter((v) => {
        const texto = busquedaVenta.trim().toUpperCase();
        return (
          String(v.numero).includes(texto) ||
          `${v.cliente_nombre || ''} ${v.cliente_apellido || ''}`.toUpperCase().includes(texto)
        );
      })
    : ventasTabla;

  async function toggleDetalleVenta(id) {
    if (abiertoDetalleVenta === id) { setAbiertoDetalleVenta(null); setDetalleVentaTabla(null); return; }
    setAbiertoDetalleVenta(id);
    const data = await api.get(`/ventas/${id}`);
    setDetalleVentaTabla(data);
  }

  async function elegirVenta(id) {
    const data = await api.get(`/ventas/${id}`);
    setVentaSeleccionada(data);
    setAbiertoDetalleVenta(null);
    setDetalleVentaTabla(null);
    setItemId('');
    setCantidad('');
    setProductoNuevo(null);
    setBusquedaProductoNuevo('');
    setUltimoResultado(null);
  }

  async function buscarProductoNuevo(texto) {
    setBusquedaProductoNuevo(texto);
    if (!texto.trim()) { setResultadosProductoNuevo([]); return; }
    const data = await api.get('/productos', { q: texto, pageSize: 10 });
    setResultadosProductoNuevo(data.productos);
  }

  async function confirmar(e) {
    e.preventDefault();
    if (!itemId || !cantidad) return;
    if (tipo === 'cambio' && !productoNuevo) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = await api.post('/devoluciones', {
        venta_id: ventaSeleccionada.id,
        venta_item_id: Number(itemId),
        cantidad: parseNumero(cantidad),
        tipo,
        producto_nuevo_id: tipo === 'cambio' ? productoNuevo.id : null,
        cantidad_nueva: tipo === 'cambio' ? parseNumero(cantidadNueva) : null,
        notas: notas || null,
      });
      setUltimoResultado(resultado);
      setVentaSeleccionada(null);
      setItemId('');
      setCantidad('');
      setProductoNuevo(null);
      setNotas('');
      cargarHistorial(1);
      setPage(1);
      cargarVentasTabla(pageVentasTabla);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function cambiarPagina(p) {
    setPage(p);
    cargarHistorial(p);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Vista previa EN VIVO de la diferencia a favor/en contra: se recalcula
  // apenas se elige producto+cantidad(+producto nuevo/cantidad nueva si es
  // cambio), sin esperar a confirmar. Misma lógica que el backend
  // (devoluciones.js): respeta el factor de descuento real de la venta
  // (total/subtotal original), no el precio de lista.
  const itemSeleccionado = ventaSeleccionada?.items.find((it) => String(it.id) === String(itemId)) || null;
  const unidadRedondeo = Number(config?.redondeo_unidad || 10);
  const cantidadNum = parseNumero(cantidad);
  const cantidadNuevaNum = parseNumero(cantidadNueva);

  const previewDiferencia = useMemo(() => {
    if (!ventaSeleccionada || !itemSeleccionado) return null;
    if (cantidadNum == null || cantidadNum <= 0 || cantidadNum > Number(itemSeleccionado.cantidad)) return null;
    const subtotalVenta = Number(ventaSeleccionada.subtotal) || 0;
    const factor = subtotalVenta > 0 ? Number(ventaSeleccionada.total) / subtotalVenta : 1;
    const montoDevuelto = Number(itemSeleccionado.precio_unitario) * factor * cantidadNum;

    let montoDiferencia;
    if (tipo === 'cambio') {
      if (!productoNuevo || cantidadNuevaNum == null || cantidadNuevaNum <= 0) return null;
      const precioOriginalNuevo = Number(productoNuevo.precio || 0);
      const montoNuevo = precioOriginalNuevo * factor * cantidadNuevaNum;
      montoDiferencia = redondear(montoNuevo - montoDevuelto, unidadRedondeo);
    } else {
      montoDiferencia = redondear(-montoDevuelto, unidadRedondeo);
    }
    const nuevoTotal = redondear(Number(ventaSeleccionada.total) + montoDiferencia, unidadRedondeo);
    return { montoDiferencia, nuevoTotal };
  }, [ventaSeleccionada, itemSeleccionado, cantidadNum, tipo, productoNuevo, cantidadNuevaNum, unidadRedondeo]);

  return (
    <div className="page">
      <h1>Devoluciones y cambios</h1>

      {error && <div className="error-box">{error}</div>}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Nueva devolución o cambio</h2>

        {!ventaSeleccionada ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Elegí la venta: mirá el detalle si hace falta y clickeá "Seleccionar" para elegir qué producto devolver o cambiar.
            </p>
            <input
              placeholder="Filtrar por N° o nombre de cliente (en esta página)..."
              value={busquedaVenta}
              onChange={(e) => setBusquedaVenta(e.target.value)}
              style={{ width: '100%', maxWidth: 320, marginBottom: 10 }}
            />
            {loadingVentasTabla ? (
              <div className="loading">Cargando...</div>
            ) : (
              <>
                <table className="simple-table">
                  <thead>
                    <tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pago</th><th /></tr>
                  </thead>
                  <tbody>
                    {ventasFiltradas.length === 0 && (
                      <tr><td colSpan={6} className="muted">Sin ventas que coincidan</td></tr>
                    )}
                    {ventasFiltradas.map((v) => (
                      <>
                        <tr key={v.id}>
                          <td>{v.numero}</td>
                          <td>{String(v.fecha).slice(0, 10)}</td>
                          <td>{v.cliente_nombre ? `${v.cliente_nombre} ${v.cliente_apellido || ''}` : 'Consumidor final'}</td>
                          <td>{formatoMoneda(v.total)}</td>
                          <td>{v.metodo_pago}</td>
                          <td style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button type="button" className="btn-link" onClick={() => toggleDetalleVenta(v.id)}>
                              {abiertoDetalleVenta === v.id ? 'Ocultar' : 'Ver'}
                            </button>
                            <button type="button" className="btn-primary" onClick={() => elegirVenta(v.id)}>Seleccionar</button>
                          </td>
                        </tr>
                        {abiertoDetalleVenta === v.id && detalleVentaTabla && (
                          <tr key={`${v.id}-detalle`}>
                            <td colSpan={6} style={{ background: 'var(--bg)' }}>
                              <table className="simple-table">
                                <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unit.</th><th>Subtotal</th></tr></thead>
                                <tbody>
                                  {detalleVentaTabla.items.map((it) => (
                                    <tr key={it.id}>
                                      <td>{it.descripcion}</td>
                                      <td>{it.cantidad}</td>
                                      <td>{formatoMoneda(it.precio_unitario)}</td>
                                      <td>{formatoMoneda(it.subtotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span className="muted" style={{ fontSize: 13 }}>{totalVentasTabla} venta{totalVentasTabla === 1 ? '' : 's'}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="btn-secondary" disabled={pageVentasTabla <= 1} onClick={() => cambiarPaginaVentasTabla(pageVentasTabla - 1)}>Anterior</button>
                    <span className="muted" style={{ fontSize: 13 }}>Página {pageVentasTabla} de {Math.max(1, Math.ceil(totalVentasTabla / PAGE_SIZE_VENTAS))}</span>
                    <button type="button" className="btn-secondary" disabled={pageVentasTabla >= Math.ceil(totalVentasTabla / PAGE_SIZE_VENTAS)} onClick={() => cambiarPaginaVentasTabla(pageVentasTabla + 1)}>Siguiente</button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <form onSubmit={confirmar}>
            <div className="cliente-chip" style={{ marginBottom: 12 }}>
              <span>Venta #{ventaSeleccionada.numero} — {formatoMoneda(ventaSeleccionada.total)}</span>
              <button type="button" className="btn-link" onClick={() => setVentaSeleccionada(null)}>Cambiar venta</button>
            </div>

            <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ width: '100%', marginBottom: 10 }} required>
              <option value="">Elegí el producto a devolver...</option>
              {ventaSeleccionada.items.map((it) => (
                <option key={it.id} value={it.id}>{it.descripcion} (vendidos: {it.cantidad})</option>
              ))}
            </select>

            <div className="form-row" style={{ marginBottom: 10 }}>
              <input
                type="text" inputMode="decimal"
                placeholder="Cantidad a devolver"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                required
              />
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="reembolso">Reembolso (devolver plata)</option>
                <option value="cambio">Cambio por otro producto</option>
              </select>
            </div>

            {tipo === 'cambio' && (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                {productoNuevo ? (
                  <div className="cliente-chip">
                    <span>{productoNuevo.descripcion}</span>
                    <button type="button" className="btn-link" onClick={() => setProductoNuevo(null)}>Cambiar</button>
                  </div>
                ) : (
                  <>
                    <input
                      className="buscador"
                      placeholder="Buscar el producto nuevo..."
                      value={busquedaProductoNuevo}
                      onChange={(e) => buscarProductoNuevo(e.target.value)}
                    />
                    {resultadosProductoNuevo.length > 0 && (
                      <ul className="resultados-lista" style={{ position: 'absolute', width: '100%', zIndex: 10, background: 'white' }}>
                        {resultadosProductoNuevo.map((p) => (
                          <li key={p.id} onClick={() => { setProductoNuevo(p); setResultadosProductoNuevo([]); setBusquedaProductoNuevo(''); }}>
                            <span>{p.descripcion}</span>
                            <span className="muted">Stock: {p.stock}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {productoNuevo && (
                  <input
                    type="text" inputMode="decimal"
                    placeholder="Cantidad nueva"
                    value={cantidadNueva}
                    onChange={(e) => setCantidadNueva(e.target.value)}
                    style={{ marginTop: 8, width: 140 }}
                  />
                )}
              </div>
            )}

            <input placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

            {previewDiferencia && (
              <div className="factura-box" style={{ marginBottom: 10 }}>
                <p style={{ margin: 0 }}>
                  {previewDiferencia.montoDiferencia < 0 ? 'A favor del cliente' : previewDiferencia.montoDiferencia > 0 ? 'El cliente debe pagar' : 'Sin diferencia'}:{' '}
                  <strong>{formatoMoneda(Math.abs(previewDiferencia.montoDiferencia))}</strong>
                  {' '}— nuevo total de la venta: <strong>{formatoMoneda(previewDiferencia.nuevoTotal)}</strong>
                </p>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Confirmar'}
            </button>
          </form>
        )}

        {ultimoResultado && (
          <div className="factura-box" style={{ marginTop: 14 }}>
            <p style={{ margin: 0 }}>
              Listo. Diferencia en el total de la venta: <strong>{formatoMoneda(ultimoResultado.monto_diferencia)}</strong>
              {' '}— nuevo total: <strong>{formatoMoneda(ultimoResultado.venta_total_nuevo)}</strong>
            </p>
            {ultimoResultado.pendiente_nota_credito === 1 && (
              <p className="muted" style={{ marginBottom: 0 }}>
                Esa venta ya tenía factura con CAE — queda marcada como pendiente de nota de crédito ante AFIP.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Historial</h2>
        {loadingHistorial ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr><th>Fecha</th><th>Venta</th><th>Producto devuelto</th><th>Cant.</th><th>Tipo</th><th>Producto nuevo</th><th>Diferencia</th><th>Nota crédito</th></tr>
              </thead>
              <tbody>
                {historial.length === 0 && (
                  <tr><td colSpan={8} className="muted">Sin devoluciones registradas</td></tr>
                )}
                {historial.map((d) => (
                  <tr key={d.id}>
                    <td>{String(d.fecha).slice(0, 10)}</td>
                    <td>#{d.venta_id}</td>
                    <td>{d.descripcion}</td>
                    <td>{d.cantidad}</td>
                    <td>{d.tipo === 'cambio' ? 'Cambio' : 'Reembolso'}</td>
                    <td>{d.descripcion_nueva || '—'}</td>
                    <td>{formatoMoneda(d.monto_diferencia)}</td>
                    <td>{d.pendiente_nota_credito === 1 ? 'Pendiente' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="paginacion-bar">
              <span className="muted" style={{ fontSize: 13 }}>{total} registro{total === 1 ? '' : 's'}</span>
              <div className="paginacion-botones">
                <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => cambiarPagina(page - 1)}>Anterior</button>
                <span className="muted" style={{ fontSize: 13 }}>Página {page} de {totalPaginas}</span>
                <button type="button" className="btn-secondary" disabled={page >= totalPaginas} onClick={() => cambiarPagina(page + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
