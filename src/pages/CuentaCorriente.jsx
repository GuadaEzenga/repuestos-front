import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { useUi } from '../context/UiContext';
import { METODOS_PAGO, labelMetodo, esMetodoCredito } from '../utils/pagos';
import { hoyArgentina } from '../utils/ofertas';

function moneda(v) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(v) || 0);
}
function fechaCorta(texto) {
  if (!texto) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto.split('-').reverse().join('/');
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Cordoba' });
}
function nombreCliente(c) {
  const base = `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Sin nombre';
  return c.nombre_negocio ? `${base} · ${c.nombre_negocio}` : base;
}
const TIPOS = { venta: 'Venta', pago: 'Pago', devolucion: 'Devolución / cambio', ajuste: 'Ajuste' };
const METODOS_PAGO_ENTREGA = METODOS_PAGO.filter((m) => m.clave !== 'cuenta_corriente');

function Saldo({ valor, grande }) {
  const v = Math.round(Number(valor) * 100) / 100;
  const color = v > 0 ? 'var(--danger)' : v < 0 ? 'var(--success)' : 'var(--text-muted)';
  const texto = v > 0 ? 'Debe' : v < 0 ? 'A favor' : 'Al día';
  return (
    <span style={{ color, fontWeight: 700, fontSize: grande ? 22 : undefined }}>
      {v === 0 ? 'Al día' : `${moneda(Math.abs(v))} `}{v !== 0 && <small style={{ fontWeight: 500 }}>{texto}</small>}
    </span>
  );
}

export default function CuentaCorriente() {
  const { toast, confirm } = useUi();
  const [clientes, setClientes] = useState([]);
  const [totalACobrar, setTotalACobrar] = useState(0);
  const [q, setQ] = useState('');
  const [qAplicada, setQAplicada] = useState('');
  const [soloSaldo, setSoloSaldo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [abiertoId, setAbiertoId] = useState(null);
  const [cuenta, setCuenta] = useState(null);
  const [cargandoCuenta, setCargandoCuenta] = useState(false);
  const [errorCuenta, setErrorCuenta] = useState(null);

  const [modo, setModo] = useState(null); // 'pago' | 'ajuste' | null
  const [ventaPago, setVentaPago] = useState(null); // venta a la que se aplica el pago (null = pago a cuenta)
  const [ventasAbiertas, setVentasAbiertas] = useState({}); // ids de ventas con el detalle desplegado
  const [verSaldadas, setVerSaldadas] = useState(false);
  const [editForma, setEditForma] = useState(null); // { id, metodo, cuotas } de la venta cuya forma de pago se esta cambiando
  const [guardandoForma, setGuardandoForma] = useState(false);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [fecha, setFecha] = useState(hoyArgentina());
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQAplicada(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cargarLista = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get('/cuenta-corriente', { q: qAplicada, solo_saldo: soloSaldo ? '1' : '' });
      setClientes(data.clientes);
      setTotalACobrar(data.total_a_cobrar);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [qAplicada, soloSaldo]);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  const cargarCuenta = useCallback(async (id) => {
    setCargandoCuenta(true);
    setErrorCuenta(null);
    try {
      setCuenta(await api.get(`/cuenta-corriente/cliente/${id}`));
    } catch (err) {
      setErrorCuenta(err.message);
    } finally {
      setCargandoCuenta(false);
    }
  }, []);

  function abrir(id) {
    setAbiertoId(id);
    setCuenta(null);
    cerrarForm();
    cargarCuenta(id);
  }
  function cerrar() {
    setAbiertoId(null);
    setCuenta(null);
    cerrarForm();
    cargarLista();
  }
  function cerrarForm() {
    setModo(null); setVentaPago(null); setMonto(''); setDescripcion(''); setErrorForm(null); setMetodo('efectivo'); setFecha(hoyArgentina());
  }

  useEffect(() => {
    if (!abiertoId) return undefined;
    const alEscape = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', alEscape);
    return () => window.removeEventListener('keydown', alEscape);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertoId]);

  async function guardarMovimiento(e) {
    e.preventDefault();
    const importe = parseNumero(monto);
    if (importe == null || importe === 0) { setErrorForm('Poné un monto.'); return; }
    if (modo === 'pago' && importe < 0) { setErrorForm('El pago tiene que ser mayor a 0.'); return; }
    if (modo === 'ajuste' && !descripcion.trim()) { setErrorForm('Explicá el motivo del ajuste.'); return; }
    setGuardando(true);
    setErrorForm(null);
    try {
      if (modo === 'pago') {
        await api.post(`/cuenta-corriente/cliente/${abiertoId}/pago`, { monto: importe, metodo_pago: metodo, fecha, descripcion: descripcion.trim() || null, venta_id: ventaPago ? ventaPago.id : null });
        toast('Pago registrado ✓');
      } else {
        await api.post(`/cuenta-corriente/cliente/${abiertoId}/ajuste`, { monto: importe, fecha, descripcion: descripcion.trim() });
        toast('Ajuste registrado ✓');
      }
      cerrarForm();
      await cargarCuenta(abiertoId);
    } catch (err) {
      setErrorForm(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrarMovimiento(m) {
    const ok = await confirm(`¿Eliminar este ${TIPOS[m.tipo].toLowerCase()} de ${moneda(Math.abs(m.monto))}?`, { danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try {
      await api.delete(`/cuenta-corriente/movimientos/${m.id}`);
      toast('Movimiento eliminado ✓');
      await cargarCuenta(abiertoId);
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  async function guardarForma() {
    if (!editForma) return;
    setGuardandoForma(true);
    try {
      const r = await api.put(`/cuenta-corriente/venta/${editForma.id}/forma-pago`, { metodo_pago: editForma.metodo, cuotas: esMetodoCredito(editForma.metodo) ? editForma.cuotas : null });
      toast(`Forma de pago cambiada: el total pasó de ${moneda(r.total_anterior)} a ${moneda(r.total_nuevo)} ✓`, { duration: 6000 });
      setEditForma(null);
      await cargarCuenta(abiertoId);
    } catch (err) {
      toast(err.message, { type: 'error', duration: 8000 });
    } finally {
      setGuardandoForma(false);
    }
  }

  function pagarVenta(v) {
    cerrarForm();
    setVentaPago(v);
    setMonto(String(v.pendiente).replace('.', ','));
    setModo('pago');
  }

  const conDeuda = clientes.filter((c) => c.saldo > 0.005).length;

  return (
    <div className="page">
      <div className="productos-toolbar">
        <h1>Cuenta corriente</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Ventas a clientes que pagan después. Se cargan desde Nueva venta tildando “Dejar a cuenta corriente” (con el precio de la forma de pago que elijas); acá ves cada venta con su detalle y registrás lo que te van pagando, venta por venta.</p>

      <div className="cards-row" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-card-top"><div className="label">Total a cobrar</div></div>
          <div className="value">{moneda(totalACobrar)}</div>
          <div className="muted" style={{ fontSize: 12 }}>{conDeuda} cliente{conDeuda === 1 ? '' : 's'} con deuda{q || !soloSaldo ? ' (en esta lista)' : ''}</div>
        </div>
      </div>

      <div className="date-filters" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        <input type="search" placeholder="Buscar cliente..." value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={soloSaldo} onChange={(e) => setSoloSaldo(e.target.checked)} />
          Solo con saldo
        </label>
      </div>

      {error && <div className="error-box">{error}</div>}
      <div className="panel">
        <div className="tabla-scroll">
          <table className="simple-table">
            <thead>
              <tr><th>Cliente</th><th>Saldo</th><th>Último movimiento</th><th>Total fiado</th><th>Total pagado</th><th /></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="muted">Cargando...</td></tr>}
              {!loading && clientes.length === 0 && (
                <tr><td colSpan={6} className="muted">{soloSaldo ? 'Ningún cliente tiene saldo pendiente. Desmarcá “Solo con saldo” o buscá un cliente para ver su cuenta.' : 'Todavía no hay movimientos de cuenta corriente.'}</td></tr>
              )}
              {!loading && clientes.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => abrir(c.id)}>
                  <td>{nombreCliente(c)}</td>
                  <td><Saldo valor={c.saldo} /></td>
                  <td>{fechaCorta(c.ultimo_movimiento)}</td>
                  <td>{moneda(c.total_ventas)}</td>
                  <td>{moneda(c.total_pagos)}</td>
                  <td><button type="button" className="btn-secondary" onClick={(e) => { e.stopPropagation(); abrir(c.id); }}>Ver cuenta</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {abiertoId && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
          <div className="modal-ventana modal-ventana-ancha" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <h2>{cuenta ? nombreCliente(cuenta.cliente) : 'Cuenta corriente'}</h2>
              <button type="button" className="modal-cerrar" onClick={cerrar} aria-label="Cerrar">×</button>
            </div>
            {cargandoCuenta && !cuenta && <div className="loading">Cargando...</div>}
            {errorCuenta && <div className="error-box">{errorCuenta}</div>}
            {cuenta && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Saldo actual</div>
                    <Saldo valor={cuenta.saldo} grande />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-primary" onClick={() => { cerrarForm(); setModo('pago'); }}>Pago a cuenta</button>
                    <button type="button" className="btn-secondary" onClick={() => { cerrarForm(); setModo('ajuste'); }}>Ajuste</button>
                  </div>
                </div>

                {modo && (
                  <form onSubmit={guardarMovimiento} className="panel" style={{ marginBottom: 12 }}>
                    <h2 style={{ marginBottom: 8 }}>{modo === 'pago' ? (ventaPago ? `Pago de la venta #${ventaPago.numero} (falta ${moneda(ventaPago.pendiente)})` : 'Pago a cuenta (sin elegir una venta)') : 'Ajuste de saldo'}</h2>
                    <div className="form-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <label className="campo">
                        <span>{modo === 'pago' ? 'Monto que paga' : 'Monto (+ suma deuda, − la baja)'}</span>
                        <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus />
                      </label>
                      {modo === 'pago' && (
                        <label className="campo">
                          <span>Forma de pago</span>
                          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                            {METODOS_PAGO_ENTREGA.map((m) => <option key={m.clave} value={m.clave}>{m.label}</option>)}
                          </select>
                        </label>
                      )}
                      <label className="campo">
                        <span>Fecha</span>
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                      </label>
                    </div>
                    <label className="campo" style={{ marginTop: 8 }}>
                      <span>{modo === 'pago' ? 'Nota (opcional)' : 'Motivo (obligatorio)'}</span>
                      <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={modo === 'ajuste' ? 'Ej: saldo inicial, error de carga...' : ''} />
                    </label>
                    {errorForm && <p className="login-error" style={{ marginTop: 8 }}>{errorForm}</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                      <button type="button" className="btn-secondary" onClick={cerrarForm}>Cancelar</button>
                    </div>
                  </form>
                )}

                <h3 style={{ margin: '14px 0 8px', fontSize: 15 }}>Ventas de este cliente</h3>
                {cuenta.pagos_sin_asignar > 0 && (
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                    Hay {moneda(cuenta.pagos_sin_asignar)} pagados “a cuenta” sin asignar a una venta puntual (ya están descontados del saldo).
                  </p>
                )}
                {(() => {
                  const pendientes = cuenta.ventas.filter((v) => !v.saldada);
                  const saldadas = cuenta.ventas.filter((v) => v.saldada);
                  const lista = verSaldadas ? [...pendientes, ...saldadas] : pendientes;
                  const tarjeta = (v) => {
                    const abierta = !!ventasAbiertas[v.id];
                    return (
                      <div key={v.id} className="factura-box" style={{ marginTop: 8, opacity: v.saldada ? 0.75 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <strong>Venta #{v.numero}</strong> <span className="muted">· {fechaCorta(v.fecha)} · {labelMetodo(v.metodo_pago)}</span>
                            <div className="muted" style={{ fontSize: 12 }}>
                              Total {moneda(v.total_original)}
                              {v.devuelto > 0 && ` · devolución ${moneda(v.devuelto)}`}
                              {v.pagado > 0 && ` · pagó ${moneda(v.pagado)}`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {v.saldada
                              ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>Saldada</span>
                              : <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Falta {moneda(v.pendiente)}</span>}
                            {!v.saldada && <button type="button" className="btn-primary" onClick={() => pagarVenta(v)}>Registrar pago</button>}
                            {v.metodo_pago !== 'cuenta_corriente' && (
                              <button type="button" className="btn-secondary" onClick={() => setEditForma({ id: v.id, metodo: v.metodo_pago, cuotas: 1 })} title="Cambiar con qué precio se cobra (ej. de efectivo a transferencia)">Cambiar forma de pago</button>
                            )}
                            <button type="button" className="btn-secondary" onClick={() => setVentasAbiertas((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}>{abierta ? 'Ocultar detalle' : 'Ver detalle'}</button>
                          </div>
                        </div>
                        {editForma && editForma.id === v.id && (
                          <div className="panel" style={{ marginTop: 8 }}>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Se recalcula el total con el precio de la forma de pago elegida y se actualiza lo que debe.</div>
                            <div className="form-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                              <select value={editForma.metodo} onChange={(e) => setEditForma((f) => ({ ...f, metodo: e.target.value, cuotas: 1 }))}>
                                {METODOS_PAGO_ENTREGA.map((m) => <option key={m.clave} value={m.clave}>{m.label}</option>)}
                              </select>
                              {esMetodoCredito(editForma.metodo) && (
                                <select value={editForma.cuotas} onChange={(e) => setEditForma((f) => ({ ...f, cuotas: Number(e.target.value) }))}>
                                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n === 1 ? '1 pago' : `${n} cuotas sin interés`}</option>)}
                                </select>
                              )}
                              <button type="button" className="btn-primary" disabled={guardandoForma} onClick={guardarForma}>{guardandoForma ? 'Guardando...' : 'Guardar'}</button>
                              <button type="button" className="btn-secondary" onClick={() => setEditForma(null)}>Cancelar</button>
                            </div>
                          </div>
                        )}
                        {abierta && (
                          <div style={{ marginTop: 8 }}>
                            <table className="simple-table">
                              <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
                              <tbody>
                                {v.items.map((it, i) => (
                                  <tr key={i}><td>{it.descripcion}</td><td>{it.cantidad}</td><td>{moneda(it.precio_unitario)}</td><td>{moneda(it.subtotal)}</td></tr>
                                ))}
                              </tbody>
                            </table>
                            {v.pagos.length > 0 && (
                              <div style={{ marginTop: 6, fontSize: 13 }}>
                                <strong>Pagos de esta venta:</strong>
                                {v.pagos.map((pg) => (
                                  <div key={pg.id} className="muted">
                                    {fechaCorta(pg.fecha)} · {moneda(pg.monto)} · {labelMetodo(pg.metodo_pago)}{pg.descripcion ? ` · ${pg.descripcion}` : ''}
                                    {' '}<button type="button" className="btn-link" onClick={() => borrarMovimiento({ id: pg.id, tipo: 'pago', monto: -pg.monto })}>Eliminar</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  };
                  return (
                    <>
                      {lista.length === 0 && <p className="muted" style={{ margin: 0 }}>{cuenta.ventas.length === 0 ? 'Este cliente no tiene ventas a cuenta corriente.' : 'No tiene ventas pendientes.'}</p>}
                      {lista.map(tarjeta)}
                      {saldadas.length > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 10 }}>
                          <input type="checkbox" checked={verSaldadas} onChange={(e) => setVerSaldadas(e.target.checked)} />
                          Mostrar también las ventas saldadas ({saldadas.length})
                        </label>
                      )}
                    </>
                  );
                })()}

                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Historial completo de movimientos</summary>
                <div className="tabla-scroll">
                  <table className="simple-table">
                    <thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th>Importe</th><th>Saldo</th><th /></tr></thead>
                    <tbody>
                      {cuenta.movimientos.length === 0 && <tr><td colSpan={6} className="muted">Este cliente todavía no tiene movimientos.</td></tr>}
                      {cuenta.movimientos.map((m) => (
                        <tr key={m.id}>
                          <td>{fechaCorta(m.fecha)}</td>
                          <td>{TIPOS[m.tipo] || m.tipo}</td>
                          <td>
                            {m.venta_numero ? `Venta #${m.venta_numero}` : ''}
                            {m.tipo === 'pago' && m.metodo_pago ? `${labelMetodo(m.metodo_pago)}` : ''}
                            {m.descripcion && (m.tipo !== 'venta') ? `${m.venta_numero || m.metodo_pago ? ' · ' : ''}${m.descripcion}` : ''}
                          </td>
                          <td style={{ color: m.monto > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{m.monto > 0 ? '+' : '−'}{moneda(Math.abs(m.monto))}</td>
                          <td>{moneda(m.saldo_acumulado)}</td>
                          <td>{(m.tipo === 'pago' || m.tipo === 'ajuste') && <button type="button" className="btn-secondary" onClick={() => borrarMovimiento(m)}>Eliminar</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
