import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useUi } from '../context/UiContext';
import { coincideTexto } from '../utils/busqueda';
import { textoFormaPago } from '../utils/pagos';
import { CONDICIONES_FISCALES } from '../components/FacturacionForm';

const PAGE_SIZE = 50;
const CLIENTE_VACIO = { nombre: '', nombre_negocio: '', telefono: '', email: '', notas: '' };
const DATO_VACIO = { condicion_fiscal: 'Responsable Inscripto', tipo_documento: 'CUIT', documento: '', razon_social: '', direccion: '' };

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(valor || 0);
}

function nombreCompleto(c) {
  return [c.nombre, c.apellido].filter(Boolean).join(' ');
}

const mayus = (v) => v.toUpperCase();

// Formulario de un dato de facturacion (alta o edicion). Carga manual.
function DatoFacturacionForm({ inicial = DATO_VACIO, onGuardar, onCancelar, textoBoton = 'Guardar' }) {
  const [d, setD] = useState({ ...DATO_VACIO, ...inicial, documento: inicial.documento || '', razon_social: inicial.razon_social || '', direccion: inicial.direccion || '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const esCF = d.condicion_fiscal === 'Consumidor Final';
  const doc = d.documento.replace(/\D/g, '');

  function set(campo, valor) { setD((x) => ({ ...x, [campo]: valor })); }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({ ...d, documento: doc || null });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="factura-box" style={{ marginTop: 8 }}>
      <div className="form-row">
        <label className="campo">
          <span>Condición frente al IVA</span>
          <select value={d.condicion_fiscal} onChange={(e) => setD((x) => ({ ...x, condicion_fiscal: e.target.value, tipo_documento: e.target.value === 'Consumidor Final' ? 'DNI' : 'CUIT' }))}>
            {CONDICIONES_FISCALES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="campo" style={{ maxWidth: 110 }}>
          <span>Tipo</span>
          <select value={d.tipo_documento} onChange={(e) => set('tipo_documento', e.target.value)}>
            {(esCF ? ['DNI', 'CUIT', 'CUIL'] : ['CUIT', 'CUIL']).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="campo">
          <span>{esCF ? 'Documento (opcional)' : 'CUIT / CUIL'}</span>
          <input value={d.documento} onChange={(e) => set('documento', e.target.value)} inputMode="numeric" />
        </label>
      </div>
      <label className="campo">
        <span>Razón social</span>
        <input value={d.razon_social} onChange={(e) => set('razon_social', mayus(e.target.value))} />
      </label>
      <label className="campo">
        <span>Domicilio fiscal</span>
        <input value={d.direccion} onChange={(e) => set('direccion', mayus(e.target.value))} />
      </label>
      {error && <p className="login-error">{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : textoBoton}</button>
        {onCancelar && <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

// Ficha del cliente: datos, datos de facturacion (tabla) e historial.
function DetalleCliente({ clienteId, onActualizado }) {
  const { toast, confirm } = useUi();
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(CLIENTE_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [editandoDatoId, setEditandoDatoId] = useState(null); // id, 'nuevo' o null

  async function cargar() {
    try {
      const data = await api.get(`/clientes/${clienteId}`);
      setDetalle(data);
      setForm({
        nombre: nombreCompleto(data),
        nombre_negocio: data.nombre_negocio || '',
        telefono: data.telefono || '',
        email: data.email || '',
        notas: data.notas || '',
      });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clienteId]);

  async function guardarCliente(e) {
    e.preventDefault();
    if (!form.nombre.trim()) { setError('El nombre completo es obligatorio'); return; }
    setGuardando(true);
    setError(null);
    try {
      // El nombre completo va todo en "nombre" (el apellido aparte quedó
      // de la version anterior; al editar se unifica).
      const actualizado = await api.put(`/clientes/${clienteId}`, { ...form, apellido: null });
      onActualizado(actualizado);
      toast('Cliente actualizado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarDato(datos) {
    if (editandoDatoId === 'nuevo') await api.post(`/clientes/${clienteId}/facturacion`, datos);
    else await api.put(`/clientes/${clienteId}/facturacion/${editandoDatoId}`, datos);
    setEditandoDatoId(null);
    toast('Datos de facturación guardados ✓');
    await cargar();
    onActualizado();
  }

  async function eliminarDato(id) {
    const ok = await confirm('¿Eliminar estos datos de facturación?', { danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try {
      await api.delete(`/clientes/${clienteId}/facturacion/${id}`);
      await cargar();
      onActualizado();
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  if (!detalle) return <p className="muted" style={{ margin: 0 }}>{error || 'Cargando...'}</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form onSubmit={guardarCliente}>
        <h3 style={{ margin: '0 0 8px' }}>Datos del cliente</h3>
        <div className="form-row">
          <label className="campo"><span>Nombre completo *</span><input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: mayus(e.target.value) }))} required /></label>
          <label className="campo"><span>Nombre empresa</span><input value={form.nombre_negocio} onChange={(e) => setForm((f) => ({ ...f, nombre_negocio: mayus(e.target.value) }))} /></label>
        </div>
        <div className="form-row">
          <label className="campo"><span>Teléfono</span><input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} /></label>
          <label className="campo"><span>Mail</span><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
        </div>
        <label className="campo"><span>Notas</span><input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: mayus(e.target.value) }))} /></label>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
      </form>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: '0 0 8px' }}>Datos de facturación ({detalle.datos_facturacion.length})</h3>
          {editandoDatoId !== 'nuevo' && (
            <button type="button" className="btn-secondary" onClick={() => setEditandoDatoId('nuevo')}>+ Agregar datos de facturación</button>
          )}
        </div>
        <table className="simple-table">
          <thead>
            <tr><th>Razón social</th><th>Condición IVA</th><th>Documento</th><th>Domicilio</th><th /></tr>
          </thead>
          <tbody>
            {detalle.datos_facturacion.length === 0 && (
              <tr><td colSpan={5} className="muted">Sin datos de facturación. Se guardan solos la primera vez que le facturás con datos, o agregalos acá.</td></tr>
            )}
            {detalle.datos_facturacion.map((d) => (
              <Fragment key={d.id}>
                <tr>
                  <td>{d.razon_social || '—'}</td>
                  <td>{d.condicion_fiscal}</td>
                  <td>{d.documento ? `${d.tipo_documento || ''} ${d.documento}` : '—'}</td>
                  <td>{d.direccion || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn-link" onClick={() => setEditandoDatoId(d.id)}>Editar</button>
                    <button type="button" className="btn-link-danger" onClick={() => eliminarDato(d.id)}>Eliminar</button>
                  </td>
                </tr>
                {editandoDatoId === d.id && (
                  <tr><td colSpan={5}>
                    <DatoFacturacionForm inicial={d} onGuardar={guardarDato} onCancelar={() => setEditandoDatoId(null)} />
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {editandoDatoId === 'nuevo' && (
          <DatoFacturacionForm onGuardar={guardarDato} onCancelar={() => setEditandoDatoId(null)} textoBoton="Agregar" />
        )}
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Historial de compras</h3>
        {detalle.ventas.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin compras registradas</p>
        ) : (
          <table className="simple-table">
            <thead><tr><th>N°</th><th>Fecha</th><th>Total</th><th>Pago</th><th>Factura</th></tr></thead>
            <tbody>
              {detalle.ventas.map((v) => (
                <tr key={v.id}>
                  <td>{v.numero}</td>
                  <td>{String(v.fecha).slice(0, 10)}</td>
                  <td>{formatoMoneda(v.total)}</td>
                  <td>{textoFormaPago(v.metodo_pago)}</td>
                  <td>{v.afip_cae ? 'Facturada' : 'Pendiente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function Clientes() {
  const { toast, confirm } = useUi();
  const [clientesCompletos, setClientesCompletos] = useState([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevo, setNuevo] = useState(CLIENTE_VACIO);
  const [conFacturacion, setConFacturacion] = useState(false);
  const [datoNuevo, setDatoNuevo] = useState(DATO_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [abierto, setAbierto] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/clientes', { pageSize: 5000 });
      setClientesCompletos(data.clientes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const clientesFiltrados = useMemo(() => {
    if (!q.trim()) return clientesCompletos;
    return clientesCompletos.filter((c) => coincideTexto(
      `${c.nombre || ''} ${c.apellido || ''} ${c.nombre_negocio || ''} ${c.telefono || ''} ${c.facturacion_resumen || ''}`,
      q
    ));
  }, [clientesCompletos, q]);

  const total = clientesFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clientesVisibles = useMemo(
    () => clientesFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [clientesFiltrados, page]
  );

  async function eliminarCliente(id) {
    const ok = await confirm('¿Dar de baja este cliente?', { danger: true, confirmLabel: 'Dar de baja' });
    if (!ok) return;
    setEliminandoId(id);
    try {
      await api.delete(`/clientes/${id}`);
      setClientesCompletos((prev) => prev.filter((c) => c.id !== id));
      if (abierto === id) setAbierto(null);
      toast('Cliente dado de baja ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoId(null);
    }
  }

  async function crearCliente(e) {
    e.preventDefault();
    if (!nuevo.nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const body = { ...nuevo };
      if (conFacturacion) body.datos_facturacion = [{ ...datoNuevo, documento: datoNuevo.documento.replace(/\D/g, '') || null }];
      await api.post('/clientes', body);
      await cargar();
      setNuevo(CLIENTE_VACIO);
      setDatoNuevo(DATO_VACIO);
      setConFacturacion(false);
      setMostrarForm(false);
      toast('Cliente cargado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  // Al editar un cliente o sus datos de facturacion se refresca su fila.
  async function refrescarFila(actualizado) {
    if (actualizado) {
      setClientesCompletos((prev) => prev.map((c) => (c.id === actualizado.id ? { ...c, ...actualizado } : c)));
    } else {
      const data = await api.get('/clientes', { pageSize: 5000 });
      setClientesCompletos(data.clientes);
    }
  }

  const esCFNuevo = datoNuevo.condicion_fiscal === 'Consumidor Final';

  return (
    <div className="page">
      <div className="dashboard-toolbar">
        <h1>Clientes</h1>
        <button type="button" className="btn-primary" onClick={() => setMostrarForm((m) => !m)}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {mostrarForm && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Cargar cliente</h2>
          <form onSubmit={crearCliente} className="nuevo-cliente-form">
            <div className="form-row">
              <label className="campo">
                <span>Nombre completo *</span>
                <input placeholder="Como lo conocés (uso interno)" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: mayus(e.target.value) }))} required />
              </label>
              <label className="campo">
                <span>Nombre empresa (opcional)</span>
                <input value={nuevo.nombre_negocio} onChange={(e) => setNuevo((n) => ({ ...n, nombre_negocio: mayus(e.target.value) }))} />
              </label>
            </div>
            <div className="form-row">
              <label className="campo">
                <span>Teléfono (opcional)</span>
                <input value={nuevo.telefono} onChange={(e) => setNuevo((n) => ({ ...n, telefono: e.target.value }))} />
              </label>
              <label className="campo">
                <span>Mail (opcional)</span>
                <input type="email" value={nuevo.email} onChange={(e) => setNuevo((n) => ({ ...n, email: e.target.value }))} />
              </label>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
              <input type="checkbox" checked={conFacturacion} onChange={(e) => setConFacturacion(e.target.checked)} />
              <span>Cargar datos de facturación ahora (también se pueden agregar después, o se guardan solos al facturarle)</span>
            </label>

            {conFacturacion && (
              <div className="factura-box">
                <div className="form-row">
                  <label className="campo">
                    <span>Condición frente al IVA</span>
                    <select value={datoNuevo.condicion_fiscal} onChange={(e) => setDatoNuevo((d) => ({ ...d, condicion_fiscal: e.target.value, tipo_documento: e.target.value === 'Consumidor Final' ? 'DNI' : 'CUIT' }))}>
                      {CONDICIONES_FISCALES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="campo" style={{ maxWidth: 110 }}>
                    <span>Tipo</span>
                    <select value={datoNuevo.tipo_documento} onChange={(e) => setDatoNuevo((d) => ({ ...d, tipo_documento: e.target.value }))}>
                      {(esCFNuevo ? ['DNI', 'CUIT', 'CUIL'] : ['CUIT', 'CUIL']).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="campo">
                    <span>{esCFNuevo ? 'Documento (opcional)' : 'CUIT / CUIL'}</span>
                    <input value={datoNuevo.documento} onChange={(e) => setDatoNuevo((d) => ({ ...d, documento: e.target.value }))} inputMode="numeric" />
                  </label>
                </div>
                <label className="campo">
                  <span>Razón social</span>
                  <input value={datoNuevo.razon_social} onChange={(e) => setDatoNuevo((d) => ({ ...d, razon_social: mayus(e.target.value) }))} />
                </label>
                <label className="campo">
                  <span>Domicilio fiscal</span>
                  <input value={datoNuevo.direccion} onChange={(e) => setDatoNuevo((d) => ({ ...d, direccion: mayus(e.target.value) }))} />
                </label>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </form>
        </div>
      )}

      <input
        className="buscador"
        placeholder="Buscar por nombre, empresa, razón social o CUIT..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1); }}
        style={{ maxWidth: 360, marginBottom: 14 }}
      />

      <div className="panel">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr><th>Nombre</th><th>Empresa</th><th>Teléfono</th><th>Datos de facturación</th><th /></tr>
              </thead>
              <tbody>
                {clientesVisibles.length === 0 && (
                  <tr><td colSpan={5} className="muted">Sin clientes que coincidan</td></tr>
                )}
                {clientesVisibles.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td><strong>{nombreCompleto(c)}</strong></td>
                      <td>{c.nombre_negocio || '—'}</td>
                      <td>{c.telefono || '—'}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{c.facturacion_resumen || 'Sin datos'}</td>
                      <td style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn-link" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
                          {abierto === c.id ? 'Cerrar' : 'Ver / Editar'}
                        </button>
                        <button type="button" className="btn-link-danger" disabled={eliminandoId === c.id} onClick={() => eliminarCliente(c.id)}>
                          {eliminandoId === c.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                    {abierto === c.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--bg)' }}>
                          <DetalleCliente clienteId={c.id} onActualizado={refrescarFila} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <div className="paginacion-bar">
              <span className="muted" style={{ fontSize: 13 }}>{total} cliente{total === 1 ? '' : 's'}</span>
              <div className="paginacion-botones">
                <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                <span className="muted" style={{ fontSize: 13 }}>Página {page} de {totalPaginas}</span>
                <button type="button" className="btn-secondary" disabled={page >= totalPaginas} onClick={() => setPage(page + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
