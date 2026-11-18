import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { labelMetodo, METODOS_PAGO, porcentajeSobreLista } from '../utils/pagos';
import { precioListaProducto } from '../utils/ofertas';
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
  // Cantidad a devolver por cada producto de la venta ({ [venta_item_id]: '2' })
  // y devoluciones anteriores de esa venta (para saber cuanto queda por devolver).
  const [cantidadesDevolver, setCantidadesDevolver] = useState({});
  const [devolucionesPrevias, setDevolucionesPrevias] = useState([]);
  const [tipo, setTipo] = useState('reembolso');
  const [busquedaProductoNuevo, setBusquedaProductoNuevo] = useState('');
  const [resultadosProductoNuevo, setResultadosProductoNuevo] = useState([]);
  // Productos nuevos del cambio: [{ producto, cantidad: '1' }]
  const [nuevos, setNuevos] = useState([]);
  const [notas, setNotas] = useState('');
  // Forma de pago de la devolución/cambio (arranca en la de la venta).
  const [metodoDevolucion, setMetodoDevolucion] = useState('efectivo');
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

  async function cargarVentasTabla(paginaParam, texto = busquedaVenta) {
    setLoadingVentasTabla(true);
    setError(null);
    try {
      const data = await api.get('/ventas', { page: paginaParam, pageSize: PAGE_SIZE_VENTAS, q: texto.trim() || undefined });
      setVentasTabla(data.ventas);
      setTotalVentasTabla(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingVentasTabla(false);
    }
  }

  useEffect(() => { cargarVentasTabla(1); }, []);

  // Busca en el servidor un ratito después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => { setPageVentasTabla(1); cargarVentasTabla(1, busquedaVenta); }, 300);
    return () => clearTimeout(t);
  }, [busquedaVenta]); // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarPaginaVentasTabla(p) {
    setPageVentasTabla(p);
    cargarVentasTabla(p);
  }

  // La búsqueda (N° de venta o cliente) la hace el servidor sobre TODAS las ventas.
  const ventasFiltradas = ventasTabla;

  async function toggleDetalleVenta(id) {
    if (abiertoDetalleVenta === id) { setAbiertoDetalleVenta(null); setDetalleVentaTabla(null); return; }
    setAbiertoDetalleVenta(id);
    const data = await api.get(`/ventas/${id}`);
    setDetalleVentaTabla(data);
  }

  async function elegirVenta(id) {
    const data = await api.get(`/ventas/${id}`);
    setVentaSeleccionada(data);
    setMetodoDevolucion(data.metodo_pago || 'efectivo');
    setAbiertoDetalleVenta(null);
    setDetalleVentaTabla(null);
    setCantidadesDevolver({});
    setNuevos([]);
    setTipo('reembolso');
    setBusquedaProductoNuevo('');
    setResultadosProductoNuevo([]);
    setUltimoResultado(null);
    try {
      const previas = await api.get(`/devoluciones/venta/${id}`);
      setDevolucionesPrevias(previas.devoluciones);
    } catch {
      setDevolucionesPrevias([]);
    }
  }

  // Cuanto se puede devolver todavia de cada producto de la venta.
  function disponibleDe(item) {
    if (!ventaSeleccionada) return 0;
    const vendido = ventaSeleccionada.items.filter((it) => it.producto_id === item.producto_id).reduce((a, it) => a + Number(it.cantidad), 0);
    const devuelto = devolucionesPrevias.filter((d) => d.producto_id === item.producto_id).reduce((a, d) => a + Number(d.cantidad || 0), 0);
    return Math.max(0, Math.min(Number(item.cantidad), vendido - devuelto));
  }

  function agregarProductoNuevo(producto) {
    setNuevos((prev) => (prev.some((n) => n.producto.id === producto.id)
      ? prev.map((n) => (n.producto.id === producto.id ? { ...n, cantidad: String((parseNumero(n.cantidad) || 0) + 1) } : n))
      : [...prev, { producto, cantidad: '1' }]));
    setResultadosProductoNuevo([]);
    setBusquedaProductoNuevo('');
  }

  async function buscarProductoNuevo(texto) {
    setBusquedaProductoNuevo(texto);
    if (!texto.trim()) { setResultadosProductoNuevo([]); return; }
    const data = await api.get('/productos', { q: texto, pageSize: 10 });
    setResultadosProductoNuevo(data.productos);
  }

  // Lo que se devuelve, ya validado: [{ item, cantidad }]
  const devueltosElegidos = (ventaSeleccionada?.items || [])
    .map((it) => ({ item: it, cantidad: parseNumero(cantidadesDevolver[it.id]) }))
    .filter((d) => d.cantidad != null && d.cantidad > 0);
  const excedeAlgunItem = devueltosElegidos.some((d) => d.cantidad > disponibleDe(d.item) + 1e-9);
  const nuevosValidos = nuevos.map((n) => ({ producto: n.producto, cantidad: parseNumero(n.cantidad) }));
  const nuevosIncompletos = tipo === 'cambio' && (nuevosValidos.length === 0 || nuevosValidos.some((n) => n.cantidad == null || n.cantidad <= 0));

  async function confirmar(e) {
    e.preventDefault();
    if (devueltosElegidos.length === 0 || excedeAlgunItem || nuevosIncompletos) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = await api.post('/devoluciones', {
        venta_id: ventaSeleccionada.id,
        devueltos: devueltosElegidos.map((d) => ({ venta_item_id: d.item.id, cantidad: d.cantidad })),
        nuevos: tipo === 'cambio' ? nuevosValidos.map((n) => ({ producto_id: n.producto.id, cantidad: n.cantidad })) : [],
        notas: notas || null,
        metodo_pago: metodoDevolucion,
      });
      setUltimoResultado(resultado);
      setVentaSeleccionada(null);
      setCantidadesDevolver({});
      setNuevos([]);
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

  // Una operacion (varios productos) son varias filas con el mismo
  // operacion_id: se muestran juntas en una sola fila del historial. Las
  // viejas (sin operacion_id) son una fila cada una.
  const historialAgrupado = useMemo(() => {
    const grupos = new Map();
    for (const d of historial) {
      const clave = d.operacion_id ? `op-${d.operacion_id}` : `fila-${d.id}`;
      if (!grupos.has(clave)) {
        grupos.set(clave, { clave, fecha: d.fecha, venta_id: d.venta_id, tipo: d.tipo, metodo_pago: d.metodo_pago, pendiente: Number(d.pendiente_nota_credito) === 1, devueltos: [], nuevos: [], total: 0 });
      }
      const g = grupos.get(clave);
      if (d.descripcion && Number(d.cantidad) > 0) g.devueltos.push(`${d.cantidad} × ${d.descripcion}`);
      if (d.descripcion_nueva) g.nuevos.push(`${d.cantidad_nueva} × ${d.descripcion_nueva}`);
      g.total += Number(d.monto_diferencia) || 0;
    }
    return [...grupos.values()];
  }, [historial]);

  // Vista previa EN VIVO de la diferencia a favor/en contra: se recalcula
  // apenas se elige producto+cantidad(+producto nuevo/cantidad nueva si es
  // cambio), sin esperar a confirmar. Misma lógica que el backend
  // (devoluciones.js): respeta el factor de descuento real de la venta
  // (total/subtotal original), no el precio de lista.
  const unidadRedondeo = Number(config?.redondeo_unidad || 10);

  const previewDiferencia = useMemo(() => {
    if (!ventaSeleccionada || !config || devueltosElegidos.length === 0 || excedeAlgunItem) return null;
    // Misma lógica que el backend: con la misma forma de pago de la venta se
    // devuelve lo que pagó; con otra, se valora con el % de esa forma de pago.
    const subtotalVenta = Number(ventaSeleccionada.subtotal) || 0;
    const esTecnicoVenta = !!ventaSeleccionada.cliente_id;
    const mismaForma = metodoDevolucion === ventaSeleccionada.metodo_pago;
    const factor = mismaForma
      ? (subtotalVenta > 0 ? Number(ventaSeleccionada.total) / subtotalVenta : 1)
      : 1 + porcentajeSobreLista(config, metodoDevolucion, esTecnicoVenta, 1) / 100;
    const redondearMonto = (v) => (metodoDevolucion === 'efectivo' ? redondear(v, unidadRedondeo) : Math.round(v * 100) / 100);
    const montoDevuelto = devueltosElegidos.reduce((acc, d) => acc + Number(d.item.precio_unitario) * factor * d.cantidad, 0);

    let montoDiferencia;
    if (tipo === 'cambio') {
      if (nuevosIncompletos) return null;
      const montoNuevo = nuevosValidos.reduce((acc, n) => {
        const precio = Number(precioListaProducto(n.producto, config, { metodo: metodoDevolucion, esTecnico: esTecnicoVenta, cuotas: 1 }) ?? 0);
        return acc + precio * factor * n.cantidad;
      }, 0);
      montoDiferencia = redondearMonto(montoNuevo - montoDevuelto);
    } else {
      montoDiferencia = redondearMonto(-montoDevuelto);
    }
    const nuevoTotal = Math.round((Number(ventaSeleccionada.total) + montoDiferencia) * 100) / 100;
    return { montoDiferencia, nuevoTotal, montoDevuelto };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaSeleccionada, cantidadesDevolver, tipo, nuevos, unidadRedondeo, metodoDevolucion, config, devolucionesPrevias]);

  return (
    <div className="page">
      <h1>Devoluciones y cambios</h1>

      {error && <div className="error-box">{error}</div>}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Nueva devolución o cambio</h2>

        {!ventaSeleccionada ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Elegí la venta: mirá el detalle si hace falta y clickeá "Seleccionar" para elegir qué productos devolver o cambiar.
            </p>
            <input
              placeholder="Buscar por N° de venta o cliente..."
              value={busquedaVenta}
              onChange={(e) => setBusquedaVenta(e.target.value)}
              style={{ width: '100%', maxWidth: 360, marginBottom: 10 }}
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
                          <td>{labelMetodo(v.metodo_pago)}</td>
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

            <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>Poné la cantidad que devuelve de cada producto (podés elegir varios):</p>
            <table className="simple-table" style={{ marginBottom: 10 }}>
              <thead><tr><th>Producto</th><th>Vendidos</th><th>Se puede devolver</th><th style={{ width: 130 }}>Devolver</th></tr></thead>
              <tbody>
                {ventaSeleccionada.items.map((it) => {
                  const disponible = disponibleDe(it);
                  const valor = cantidadesDevolver[it.id] ?? '';
                  const num = parseNumero(valor);
                  const excede = num != null && num > disponible + 1e-9;
                  return (
                    <tr key={it.id} style={disponible <= 0 ? { opacity: 0.5 } : undefined}>
                      <td>{it.descripcion}</td>
                      <td>{it.cantidad}</td>
                      <td>{disponible > 0 ? disponible : 'Ya devuelto'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="text" inputMode="decimal" placeholder="0"
                            value={valor} disabled={disponible <= 0}
                            onChange={(e) => setCantidadesDevolver((prev) => ({ ...prev, [it.id]: e.target.value }))}
                            style={{ width: 70, ...(excede ? { borderColor: 'var(--danger)' } : {}) }}
                          />
                          {disponible > 0 && (
                            <button type="button" className="btn-link" onClick={() => setCantidadesDevolver((prev) => ({ ...prev, [it.id]: String(disponible) }))}>Todo</button>
                          )}
                        </div>
                        {excede && <span style={{ color: 'var(--danger)', fontSize: 12 }}>Máximo {disponible}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="form-row" style={{ marginBottom: 10 }}>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="reembolso">Reembolso (devolver plata)</option>
                <option value="cambio">Cambio por otros productos</option>
              </select>
            </div>

            {tipo === 'cambio' && (
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  className="buscador"
                  placeholder="Buscar y agregar un producto nuevo..."
                  value={busquedaProductoNuevo}
                  onChange={(e) => buscarProductoNuevo(e.target.value)}
                />
                {resultadosProductoNuevo.length > 0 && (
                  <ul className="resultados-lista" style={{ background: 'var(--surface)', maxHeight: 260 }}>
                    {resultadosProductoNuevo.map((p) => (
                      <li key={p.id} onClick={() => agregarProductoNuevo(p)}>
                        <span>{p.descripcion}</span>
                        <span className="muted">Stock: {p.stock}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {nuevos.length > 0 && (
                  <table className="simple-table" style={{ marginTop: 8 }}>
                    <thead><tr><th>Producto nuevo</th><th>Stock</th><th style={{ width: 110 }}>Cantidad</th><th /></tr></thead>
                    <tbody>
                      {nuevos.map((n) => {
                        const cant = parseNumero(n.cantidad);
                        const sinStock = cant != null && cant > Number(n.producto.stock);
                        return (
                          <tr key={n.producto.id}>
                            <td>{n.producto.descripcion}</td>
                            <td style={sinStock ? { color: 'var(--danger)' } : undefined}>{n.producto.stock}</td>
                            <td>
                              <input
                                type="text" inputMode="decimal" value={n.cantidad} style={{ width: 70 }}
                                onChange={(e) => setNuevos((prev) => prev.map((x) => (x.producto.id === n.producto.id ? { ...x, cantidad: e.target.value } : x)))}
                              />
                            </td>
                            <td><button type="button" className="btn-link" onClick={() => setNuevos((prev) => prev.filter((x) => x.producto.id !== n.producto.id))}>Quitar</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <label className="campo" style={{ marginBottom: 10 }}>
              <span>{tipo === 'cambio' ? 'Forma de pago del cambio (para la diferencia y el precio del producto nuevo)' : 'Forma de pago de la devolución'}</span>
              <select value={metodoDevolucion} onChange={(e) => setMetodoDevolucion(e.target.value)}>
                {METODOS_PAGO.map((m) => (
                  <option key={m.clave} value={m.clave}>{m.label}{m.clave === ventaSeleccionada.metodo_pago ? ' (la de la venta)' : ''}</option>
                ))}
              </select>
              {metodoDevolucion !== ventaSeleccionada.metodo_pago && (
                <span className="muted" style={{ fontSize: 12 }}>
                  La venta fue con {labelMetodo(ventaSeleccionada.metodo_pago)}: los precios se calculan con el % de {labelMetodo(metodoDevolucion)}.
                </span>
              )}
            </label>

            <input placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

            {previewDiferencia && (
              <div className="factura-box" style={{ marginBottom: 10 }}>
                <p style={{ margin: 0 }}>
                  {previewDiferencia.montoDiferencia < 0 ? 'Le devolvés al cliente' : previewDiferencia.montoDiferencia > 0 ? 'El cliente te paga' : 'Sin diferencia'}:{' '}
                  <strong>{formatoMoneda(Math.abs(previewDiferencia.montoDiferencia))}</strong>
                  {previewDiferencia.montoDiferencia !== 0 && <> en <strong>{labelMetodo(metodoDevolucion)}</strong></>}
                  {' '}— nuevo total de la venta: <strong>{formatoMoneda(previewDiferencia.nuevoTotal)}</strong>
                </p>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={guardando || devueltosElegidos.length === 0 || excedeAlgunItem || nuevosIncompletos}>
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
            {Number(ultimoResultado.pendiente_nota_credito) === 1 && (
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
                <tr><th>Fecha</th><th>Venta</th><th>Productos devueltos</th><th>Tipo</th><th>Productos nuevos</th><th>Diferencia</th><th>Forma de pago</th><th>Nota crédito</th></tr>
              </thead>
              <tbody>
                {historial.length === 0 && (
                  <tr><td colSpan={8} className="muted">Sin devoluciones registradas</td></tr>
                )}
                {historialAgrupado.map((g) => (
                  <tr key={g.clave}>
                    <td>{String(g.fecha).slice(0, 10)}</td>
                    <td>#{g.venta_id}</td>
                    <td>{g.devueltos.length === 0 ? '—' : g.devueltos.map((t) => <div key={t}>{t}</div>)}</td>
                    <td>{g.tipo === 'cambio' ? 'Cambio' : 'Reembolso'}</td>
                    <td>{g.nuevos.length === 0 ? '—' : g.nuevos.map((t) => <div key={t}>{t}</div>)}</td>
                    <td>{formatoMoneda(g.total)}</td>
                    <td>{g.metodo_pago ? labelMetodo(g.metodo_pago) : '—'}</td>
                    <td>{g.pendiente ? 'Pendiente' : '—'}</td>
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
