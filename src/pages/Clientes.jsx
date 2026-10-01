import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useUi } from '../context/UiContext';
import { coincideTexto } from '../utils/busqueda';

const TIPOS_DOC = ['DNI', 'CUIT', 'CUIL'];
const CONDICIONES_FISCALES = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];
const PAGE_SIZE = 50;
const VACIO = { nombre: '', apellido: '', nombre_negocio: '', telefono: '', email: '', tipo_documento: 'DNI', documento: '', direccion: '', condicion_fiscal: 'Consumidor Final', notas: '' };

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

export default function Clientes() {
  const { toast, confirm } = useUi();
  const [clientesCompletos, setClientesCompletos] = useState([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevo, setNuevo] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

  const [abierto, setAbierto] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
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

  // Búsqueda instantánea en memoria sobre lo ya cargado (misma lógica que
  // Nueva venta/Productos: por palabras sueltas, en cualquier orden, sin tildes).
  const clientesFiltrados = useMemo(() => {
    if (!q.trim()) return clientesCompletos;
    return clientesCompletos.filter((c) => coincideTexto(
      `${c.nombre || ''} ${c.apellido || ''} ${c.nombre_negocio || ''} ${c.documento || ''}`,
      q
    ));
  }, [clientesCompletos, q]);

  const total = clientesFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clientesVisibles = useMemo(
    () => clientesFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [clientesFiltrados, page]
  );

  function buscarEnVivo(texto) {
    setQ(texto);
    setPage(1);
  }

  function cambiarPagina(p) {
    setPage(p);
  }

  async function toggleDetalle(id) {
    if (abierto === id) { setAbierto(null); setDetalle(null); return; }
    setAbierto(id);
    setCargandoDetalle(true);
    try {
      const data = await api.get(`/clientes/${id}`);
      setDetalle(data);
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
      setAbierto(null);
    } finally {
      setCargandoDetalle(false);
    }
  }

  async function guardarCampo(id, campo, valor) {
    try {
      const cliente = await api.put(`/clientes/${id}`, { [campo]: valor === '' ? null : valor });
      setClientesCompletos((prev) => prev.map((c) => (c.id === id ? cliente : c)));
      // Flash visual breve en la fila para confirmar que el guardado pegó,
      // ademas del toast (en una tabla larga el toast arriba a la derecha
      // se puede pasar por alto).
      setFlashId(id);
      setTimeout(() => setFlashId((prev) => (prev === id ? null : prev)), 900);
      toast('Guardado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  async function eliminarCliente(id) {
    const ok = await confirm('¿Dar de baja este cliente?', { danger: true, confirmLabel: 'Dar de baja' });
    if (!ok) return;
    setEliminandoId(id);
    try {
      await api.delete(`/clientes/${id}`);
      setClientesCompletos((prev) => prev.filter((c) => c.id !== id));
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
      const creado = await api.post('/clientes', nuevo);
      setClientesCompletos((prev) => [creado, ...prev]);
      setNuevo(VACIO);
      setMostrarForm(false);
      toast('Cliente cargado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

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
                <span>Nombre</span>
                <input placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} required />
              </label>
              <label className="campo">
                <span>Apellido</span>
                <input placeholder="Apellido" value={nuevo.apellido} onChange={(e) => setNuevo((n) => ({ ...n, apellido: e.target.value }))} />
              </label>
            </div>
            <label className="campo">
              <span>Nombre del negocio (opcional)</span>
              <input placeholder="Nombre del negocio" value={nuevo.nombre_negocio} onChange={(e) => setNuevo((n) => ({ ...n, nombre_negocio: e.target.value }))} />
            </label>
            <div className="form-row">
              <label className="campo">
                <span>Teléfono</span>
                <input placeholder="Teléfono" value={nuevo.telefono} onChange={(e) => setNuevo((n) => ({ ...n, telefono: e.target.value }))} />
              </label>
              <label className="campo">
                <span>Email</span>
                <input placeholder="Email" value={nuevo.email} onChange={(e) => setNuevo((n) => ({ ...n, email: e.target.value }))} />
              </label>
            </div>
            <div className="form-row">
              <label className="campo">
                <span>Tipo de documento</span>
                <select value={nuevo.tipo_documento} onChange={(e) => setNuevo((n) => ({ ...n, tipo_documento: e.target.value }))}>
                  {TIPOS_DOC.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Número de documento</span>
                <input placeholder="Número de documento" value={nuevo.documento} onChange={(e) => setNuevo((n) => ({ ...n, documento: e.target.value }))} />
              </label>
            </div>
            <label className="campo">
              <span>Dirección (opcional)</span>
              <input placeholder="Dirección" value={nuevo.direccion} onChange={(e) => setNuevo((n) => ({ ...n, direccion: e.target.value }))} />
            </label>
            <label className="campo">
              <span>Condición fiscal</span>
              <select value={nuevo.condicion_fiscal} onChange={(e) => setNuevo((n) => ({ ...n, condicion_fiscal: e.target.value }))}>
                {CONDICIONES_FISCALES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Notas (opcional)</span>
              <input placeholder="Notas" value={nuevo.notas} onChange={(e) => setNuevo((n) => ({ ...n, notas: e.target.value }))} />
            </label>
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </form>
        </div>
      )}

      <input
        className="buscador"
        placeholder="Buscar por nombre, apellido, negocio o documento..."
        value={q}
        onChange={(e) => buscarEnVivo(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 14 }}
      />

      <div className="panel">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr><th>Nombre</th><th>Negocio</th><th>Documento</th><th>Teléfono</th><th>Condición fiscal</th><th /></tr>
              </thead>
              <tbody>
                {clientesVisibles.length === 0 && (
                  <tr><td colSpan={6} className="muted">Sin clientes que coincidan</td></tr>
                )}
                {clientesVisibles.map((c) => (
                  <>
                    <tr key={c.id} className={flashId === c.id ? 'fila-flash' : ''}>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <input
                          className="input-inline"
                          defaultValue={c.nombre || ''}
                          onBlur={(e) => guardarCampo(c.id, 'nombre', e.target.value)}
                          style={{ width: 90 }}
                        />
                        <input
                          className="input-inline"
                          defaultValue={c.apellido || ''}
                          placeholder="—"
                          onBlur={(e) => guardarCampo(c.id, 'apellido', e.target.value)}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td>
                        <input
                          className="input-inline"
                          defaultValue={c.nombre_negocio || ''}
                          placeholder="—"
                          onBlur={(e) => guardarCampo(c.id, 'nombre_negocio', e.target.value)}
                          style={{ width: 120 }}
                        />
                      </td>
                      <td>{c.tipo_documento ? `${c.tipo_documento} ${c.documento}` : '—'}</td>
                      <td>
                        <input
                          className="input-inline"
                          defaultValue={c.telefono || ''}
                          onBlur={(e) => guardarCampo(c.id, 'telefono', e.target.value)}
                          style={{ width: 130 }}
                        />
                      </td>
                      <td>
                        <select
                          defaultValue={c.condicion_fiscal || 'Consumidor Final'}
                          onChange={(e) => guardarCampo(c.id, 'condicion_fiscal', e.target.value)}
                        >
                          {CONDICIONES_FISCALES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn-link" onClick={() => toggleDetalle(c.id)}>
                          {abierto === c.id ? 'Ocultar' : 'Historial'}
                        </button>
                        <button type="button" className="btn-link-danger" disabled={eliminandoId === c.id} onClick={() => eliminarCliente(c.id)}>
                          {eliminandoId === c.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                    {abierto === c.id && cargandoDetalle && (
                      <tr key={`${c.id}-detalle-cargando`}>
                        <td colSpan={6} className="muted" style={{ background: 'var(--bg)' }}>Cargando historial...</td>
                      </tr>
                    )}
                    {abierto === c.id && !cargandoDetalle && detalle && (
                      <tr key={`${c.id}-detalle`}>
                        <td colSpan={6} style={{ background: 'var(--bg)' }}>
                          {detalle.direccion && <p className="muted" style={{ margin: '0 0 8px' }}>Dirección: {detalle.direccion}</p>}
                          {detalle.ventas.length === 0 ? (
                            <p className="muted" style={{ margin: 0 }}>Sin compras registradas</p>
                          ) : (
                            <table className="simple-table">
                              <thead><tr><th>N°</th><th>Fecha</th><th>Total</th><th>Pago</th></tr></thead>
                              <tbody>
                                {detalle.ventas.map((v) => (
                                  <tr key={v.id}>
                                    <td>{v.numero}</td>
                                    <td>{String(v.fecha).slice(0, 10)}</td>
                                    <td>{formatoMoneda(v.total)}</td>
                                    <td>{v.metodo_pago}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            <div className="paginacion-bar">
              <span className="muted" style={{ fontSize: 13 }}>{total} cliente{total === 1 ? '' : 's'}</span>
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
