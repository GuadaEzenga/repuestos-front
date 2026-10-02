import { useEffect, useState } from 'react';
import api from '../api/client';
import { useUi } from '../context/UiContext';

const TIPOS_DOC = ['DNI', 'CUIT', 'CUIL'];
const CONDICIONES_FISCALES = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];
const METODOS_DEFAULT = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito'];
const PAGE_SIZE = 30;

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

export default function Ventas() {
  const { toast, confirm } = useUi();
  const [ventas, setVentas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [anulandoId, setAnulandoId] = useState(null);

  const [abierto, setAbierto] = useState(null);
  const [detalle, setDetalle] = useState(null);
  // Menu "⋯" por fila con el resto de las acciones (PDF/Editar/Facturar/
  // Anular) -- antes estaban todas sueltas en fila y en celular, con poco
  // ancho, se cortaban a la mitad de la palabra. Con el menu nunca falta
  // espacio.
  const [menuAbiertoId, setMenuAbiertoId] = useState(null);

  const [facturando, setFacturando] = useState(null); // id de la venta en curso
  const [datosFactura, setDatosFactura] = useState({ nombre: '', tipo_documento: 'CUIT', documento: '', condicion_fiscal: 'Consumidor Final', direccion: '' });
  const [errorFactura, setErrorFactura] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);
  // Autocompletar nombre/domicilio desde el padron de AFIP al cargar un
  // CUIT/CUIL (igual que hace ARCA) -- Consumidor Final es la unica
  // condicion que no necesita ni usa documento del cliente.
  const [buscandoPadron, setBuscandoPadron] = useState(false);
  const [errorPadron, setErrorPadron] = useState(null);

  // --- Editar una venta ya confirmada: cliente, forma de pago y notas
  // (los items/cantidades/stock no se tocan -- para eso están las
  // devoluciones/cambios). Solo se carga la lista de clientes la primera vez
  // que se abre un editor, para no pedirla de arranque sin necesidad.
  const [editandoId, setEditandoId] = useState(null);
  const [editClienteId, setEditClienteId] = useState('');
  const [editMetodoPago, setEditMetodoPago] = useState('efectivo');
  const [editNotas, setEditNotas] = useState('');
  const [clientesTodos, setClientesTodos] = useState([]);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState(null);

  async function abrirEditar(v) {
    if (clientesTodos.length === 0) {
      const data = await api.get('/clientes', { pageSize: 2000 });
      setClientesTodos([...data.clientes].sort((a, b) => `${a.nombre || ''} ${a.apellido || ''}`.localeCompare(`${b.nombre || ''} ${b.apellido || ''}`, 'es', { sensitivity: 'base' })));
    }
    setEditandoId(v.id);
    setEditClienteId(v.cliente_id || '');
    setEditMetodoPago(v.metodo_pago);
    setEditNotas(v.notas || '');
    setErrorEdicion(null);
  }

  async function guardarEdicion(id) {
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      const actualizada = await api.put(`/ventas/${id}`, {
        cliente_id: editClienteId || null,
        metodo_pago: editMetodoPago,
        notas: editNotas || null,
      });
      const cliente = clientesTodos.find((c) => String(c.id) === String(editClienteId));
      setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, ...actualizada, cliente_nombre: cliente?.nombre || null, cliente_apellido: cliente?.apellido || null } : v)));
      setEditandoId(null);
      toast('Venta actualizada ✓');
    } catch (err) {
      setErrorEdicion(err.message);
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function cargar(paginaParam) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/ventas', { page: paginaParam, pageSize: PAGE_SIZE });
      setVentas(data.ventas);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(1); }, []);

  function cambiarPagina(p) {
    setPage(p);
    cargar(p);
  }

  async function toggleDetalle(id) {
    if (abierto === id) { setAbierto(null); setDetalle(null); return; }
    setAbierto(id);
    const data = await api.get(`/ventas/${id}`);
    setDetalle(data);
  }

  async function verComprobante(id) {
    const ventana = window.open('', '_blank');
    const blob = await api.get(`/ventas/${id}/comprobante`);
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
  }

  async function anularVenta(id) {
    const ok = await confirm('¿Anular esta venta? Se devuelve el stock de los productos vendidos.', { danger: true, confirmLabel: 'Anular venta' });
    if (!ok) return;
    setAnulandoId(id);
    try {
      await api.delete(`/ventas/${id}`);
      setVentas((prev) => prev.filter((v) => v.id !== id));
      setTotal((t) => t - 1);
      toast('Venta anulada ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setAnulandoId(null);
    }
  }

  function abrirFacturar(venta) {
    setFacturando(venta.id);
    setErrorFactura(null);
    setErrorPadron(null);
    // Si la venta tiene un cliente vinculado, arrancamos con su nombre como
    // base -- pero queda editable aca mismo, porque esto es justamente lo
    // que se manda a AFIP y lo que va a aparecer impreso en el PDF, así que
    // si el nombre del cliente está mal escrito o incompleto se puede
    // corregir en el momento sin tener que ir a arreglar la ficha del
    // cliente primero. Por defecto arranca en Consumidor Final (que no
    // necesita nada mas); si el cliente real pide otra condición, ahí se
    // carga el CUIT/CUIL y se autocompleta.
    const nombreCliente = [venta.cliente_nombre, venta.cliente_apellido].filter(Boolean).join(' ');
    setDatosFactura({ nombre: nombreCliente || '', tipo_documento: 'CUIT', documento: '', condicion_fiscal: 'Consumidor Final', direccion: '' });
  }

  // Busca el nombre/razón social y domicilio real de un CUIT/CUIL en el
  // padrón de AFIP (lo mismo que hace ARCA al facturar) y completa los
  // campos -- quedan editables igual por si hace falta ajustar algo.
  async function buscarEnPadron() {
    const doc = datosFactura.documento.replace(/\D/g, '');
    if (doc.length !== 11 || !['CUIT', 'CUIL'].includes(datosFactura.tipo_documento)) return;
    setBuscandoPadron(true);
    setErrorPadron(null);
    try {
      const datos = await api.get(`/clientes/padron/${doc}`);
      setDatosFactura((d) => ({ ...d, nombre: datos.nombre || d.nombre, direccion: datos.domicilio || d.direccion }));
    } catch (err) {
      setErrorPadron(err.message);
    } finally {
      setBuscandoPadron(false);
    }
  }

  async function emitirFactura(id) {
    setEmitiendo(true);
    setErrorFactura(null);
    try {
      const actualizada = await api.post(`/ventas/${id}/facturar`, { ...datosFactura, confirmar: true });
      setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, ...actualizada } : v)));
      setFacturando(null);
      toast('Factura emitida ✓');
    } catch (err) {
      setErrorFactura(err.message);
    } finally {
      setEmitiendo(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <h1>Ventas</h1>

      {error && <div className="error-box">{error}</div>}

      <div className="panel">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>N°</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Estado</th><th />
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 && (
                  <tr><td colSpan={7} className="muted">Sin ventas registradas</td></tr>
                )}
                {ventas.map((v) => (
                  <>
                    <tr key={v.id}>
                      <td>{v.numero}</td>
                      <td>{String(v.fecha).slice(0, 10)}</td>
                      <td>{v.cliente_nombre ? `${v.cliente_nombre} ${v.cliente_apellido || ''}` : 'Consumidor final'}</td>
                      <td>{formatoMoneda(v.total)}</td>
                      <td>{v.metodo_pago}</td>
                      <td>{v.afip_cae ? <span style={{ color: 'var(--success)' }}>Facturada</span> : <span className="muted">Sin facturar</span>}</td>
                      <td className="celda-acciones">
                        <button type="button" className="btn-link" onClick={() => toggleDetalle(v.id)}>
                          {abierto === v.id ? 'Ocultar' : 'Ver'}
                        </button>
                        <div className="menu-acciones">
                          <button
                            type="button"
                            className="btn-link menu-acciones-toggle"
                            onClick={() => setMenuAbiertoId(menuAbiertoId === v.id ? null : v.id)}
                            aria-label="Más acciones"
                          >
                            ⋯
                          </button>
                          {menuAbiertoId === v.id && (
                            <>
                              <div className="menu-acciones-fondo" onClick={() => setMenuAbiertoId(null)} />
                              <div className="menu-acciones-lista">
                                <button type="button" onClick={() => { setMenuAbiertoId(null); verComprobante(v.id); }}>Descargar PDF</button>
                                <button type="button" onClick={() => { setMenuAbiertoId(null); abrirEditar(v); }}>Editar</button>
                                {!v.afip_cae && (
                                  <button type="button" onClick={() => { setMenuAbiertoId(null); abrirFacturar(v); }}>Facturar</button>
                                )}
                                <button
                                  type="button"
                                  className="danger"
                                  disabled={anulandoId === v.id}
                                  onClick={() => { setMenuAbiertoId(null); anularVenta(v.id); }}
                                >
                                  {anulandoId === v.id ? 'Anulando...' : 'Anular'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {abierto === v.id && detalle && (
                      <tr key={`${v.id}-detalle`}>
                        <td colSpan={7} style={{ background: 'var(--bg)' }}>
                          <table className="simple-table">
                            <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unit.</th><th>Subtotal</th></tr></thead>
                            <tbody>
                              {detalle.items.map((it) => (
                                <tr key={it.id}>
                                  <td>{it.descripcion}</td>
                                  <td>{it.cantidad}</td>
                                  <td>{formatoMoneda(it.precio_unitario)}</td>
                                  <td>{formatoMoneda(it.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {detalle.afip_cae && (
                            <p style={{ marginTop: 10, marginBottom: 0 }}>
                              <strong>CAE:</strong> {detalle.afip_cae} — Vto. {String(detalle.afip_cae_vencimiento).slice(0, 10)}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}

                    {editandoId === v.id && (
                      <tr key={`${v.id}-editar`}>
                        <td colSpan={7}>
                          <div className="factura-box">
                            <p className="muted" style={{ marginTop: 0 }}>
                              Se puede corregir el cliente, la forma de pago y las notas. Los productos y el total no se tocan acá — para cambiar o devolver un producto usá "Devoluciones".
                            </p>
                            <div className="form-row">
                              <select value={editClienteId} onChange={(e) => setEditClienteId(e.target.value)} style={{ flex: 1 }}>
                                <option value="">Consumidor final (sin cliente)</option>
                                {clientesTodos.map((c) => (
                                  <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>
                                ))}
                              </select>
                              <select value={editMetodoPago} onChange={(e) => setEditMetodoPago(e.target.value)}>
                                {METODOS_DEFAULT.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                              </select>
                            </div>
                            <input
                              placeholder="Notas (opcional)"
                              value={editNotas}
                              onChange={(e) => setEditNotas(e.target.value)}
                              style={{ width: '100%', marginTop: 8 }}
                            />
                            {errorEdicion && <p className="login-error">{errorEdicion}</p>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button type="button" onClick={() => guardarEdicion(v.id)} disabled={guardandoEdicion} className="btn-primary">
                                {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                              </button>
                              <button type="button" onClick={() => setEditandoId(null)} className="btn-secondary">Cancelar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {facturando === v.id && (
                      <tr key={`${v.id}-facturar`}>
                        <td colSpan={7}>
                          <div className="factura-box">
                            <p className="muted" style={{ marginTop: 0 }}>
                              Esto emite una factura real ante AFIP con el certificado de producción. No se puede deshacer.
                            </p>
                            <select
                              value={datosFactura.condicion_fiscal}
                              onChange={(e) => {
                                const condicion_fiscal = e.target.value;
                                setErrorPadron(null);
                                setDatosFactura((d) =>
                                  condicion_fiscal === 'Consumidor Final'
                                    ? { ...d, condicion_fiscal, nombre: '', tipo_documento: 'CUIT', documento: '', direccion: '' }
                                    : { ...d, condicion_fiscal }
                                );
                              }}
                              style={{ width: '100%' }}
                            >
                              {CONDICIONES_FISCALES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>

                            {datosFactura.condicion_fiscal === 'Consumidor Final' ? (
                              <p className="muted" style={{ marginBottom: 0 }}>
                                Consumidor Final no necesita ningún dato del cliente -- se factura así, sin nombre ni documento.
                              </p>
                            ) : (
                              <>
                                <p className="muted" style={{ marginBottom: 10 }}>
                                  Esta condición necesita el CUIT o CUIL del cliente. Cargalo y se autocompleta el nombre y domicilio desde AFIP (podés corregirlos si hace falta).
                                </p>
                                <div className="form-row">
                                  <select
                                    value={datosFactura.tipo_documento}
                                    onChange={(e) => setDatosFactura((d) => ({ ...d, tipo_documento: e.target.value }))}
                                  >
                                    {['CUIT', 'CUIL'].map((t) => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <input
                                    placeholder="Número de CUIT/CUIL"
                                    value={datosFactura.documento}
                                    onChange={(e) => setDatosFactura((d) => ({ ...d, documento: e.target.value }))}
                                    onBlur={buscarEnPadron}
                                  />
                                  <button type="button" onClick={buscarEnPadron} disabled={buscandoPadron} className="btn-secondary">
                                    {buscandoPadron ? 'Buscando...' : 'Buscar en AFIP'}
                                  </button>
                                </div>
                                {errorPadron && <p className="login-error" style={{ marginTop: 4 }}>{errorPadron}</p>}
                                <input
                                  placeholder="Nombre y apellido / Razón social"
                                  value={datosFactura.nombre}
                                  onChange={(e) => setDatosFactura((d) => ({ ...d, nombre: e.target.value }))}
                                  style={{ width: '100%', marginTop: 8 }}
                                />
                                <input
                                  placeholder="Domicilio"
                                  value={datosFactura.direccion}
                                  onChange={(e) => setDatosFactura((d) => ({ ...d, direccion: e.target.value }))}
                                  style={{ width: '100%', marginTop: 8 }}
                                />
                              </>
                            )}
                            {errorFactura && <p className="login-error">{errorFactura}</p>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button
                                type="button"
                                onClick={() => emitirFactura(v.id)}
                                disabled={
                                  emitiendo ||
                                  (datosFactura.condicion_fiscal !== 'Consumidor Final' && datosFactura.documento.replace(/\D/g, '').length !== 11)
                                }
                                className="btn-danger"
                              >
                                {emitiendo ? 'Emitiendo...' : 'Confirmar y emitir factura real'}
                              </button>
                              <button type="button" onClick={() => setFacturando(null)} className="btn-secondary">Cancelar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            <div className="paginacion-bar">
              <span className="muted" style={{ fontSize: 13 }}>{total} venta{total === 1 ? '' : 's'}</span>
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
