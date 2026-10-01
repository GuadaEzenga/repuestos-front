import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { useUi } from '../context/UiContext';

const PAGE_SIZE = 10;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

// Paginacion simple sobre un array ya cargado.
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

const TRABAJO_VACIO = { fecha: hoyISO(), cliente: '', tipo_trabajo: '', cobro_cliente: '' };

export default function Empleado() {
  const { toast, confirm } = useUi();
  const [resumen, setResumen] = useState(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [trabajos, setTrabajos] = useState([]);
  const [sueldos, setSueldos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eliminandoTrabajoId, setEliminandoTrabajoId] = useState(null);
  const [eliminandoSueldoId, setEliminandoSueldoId] = useState(null);

  const [nuevoTrabajo, setNuevoTrabajo] = useState(TRABAJO_VACIO);
  const [materiales, setMateriales] = useState([]);
  const [materialDesc, setMaterialDesc] = useState('');
  const [materialCosto, setMaterialCosto] = useState('');
  const [guardandoTrabajo, setGuardandoTrabajo] = useState(false);

  const [nuevoSueldo, setNuevoSueldo] = useState({ fecha: hoyISO(), pago: '' });
  const [guardandoSueldo, setGuardandoSueldo] = useState(false);

  async function cargar(desdeParam, hastaParam) {
    setLoading(true);
    setError(null);
    try {
      const [dataTrabajos, dataSueldos, dataResumen] = await Promise.all([
        api.get('/empleado/trabajos', { pageSize: 200 }),
        api.get('/empleado/sueldos', { pageSize: 200 }),
        api.get('/empleado/resumen', { desde: desdeParam || undefined, hasta: hastaParam || undefined }),
      ]);
      setTrabajos(dataTrabajos.trabajos);
      setSueldos(dataSueldos.sueldos);
      setResumen(dataResumen);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar('', ''); }, []);

  function aplicarFiltro(e) {
    e.preventDefault();
    cargar(desde, hasta);
  }

  function agregarMaterial() {
    if (!materialDesc.trim()) return;
    setMateriales((prev) => [...prev, { descripcion: materialDesc, costo: parseNumero(materialCosto) || 0 }]);
    setMaterialDesc('');
    setMaterialCosto('');
  }

  function quitarMaterial(idx) {
    setMateriales((prev) => prev.filter((_, i) => i !== idx));
  }

  async function crearTrabajo(e) {
    e.preventDefault();
    if (!nuevoTrabajo.cliente.trim()) return;
    setGuardandoTrabajo(true);
    try {
      await api.post('/empleado/trabajos', { ...nuevoTrabajo, cobro_cliente: parseNumero(nuevoTrabajo.cobro_cliente) || 0, materiales });
      setNuevoTrabajo(TRABAJO_VACIO);
      setMateriales([]);
      cargar(desde, hasta);
      toast('Trabajo cargado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoTrabajo(false);
    }
  }

  async function eliminarTrabajo(id) {
    const ok = await confirm('¿Eliminar este trabajo?', { danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    setEliminandoTrabajoId(id);
    try {
      await api.delete(`/empleado/trabajos/${id}`);
      setTrabajos((prev) => prev.filter((t) => t.id !== id));
      toast('Trabajo eliminado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoTrabajoId(null);
    }
  }

  async function crearSueldo(e) {
    e.preventDefault();
    if (!nuevoSueldo.pago) return;
    setGuardandoSueldo(true);
    try {
      const creado = await api.post('/empleado/sueldos', { ...nuevoSueldo, pago: parseNumero(nuevoSueldo.pago) });
      setSueldos((prev) => [creado, ...prev]);
      setNuevoSueldo({ fecha: hoyISO(), pago: '' });
      cargar(desde, hasta);
      toast('Sueldo cargado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoSueldo(false);
    }
  }

  async function eliminarSueldo(id) {
    const ok = await confirm('¿Eliminar este pago de sueldo?', { danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    setEliminandoSueldoId(id);
    try {
      await api.delete(`/empleado/sueldos/${id}`);
      setSueldos((prev) => prev.filter((s) => s.id !== id));
      toast('Sueldo eliminado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoSueldoId(null);
    }
  }

  const paginadoTrabajos = usePaginado(trabajos);
  const paginadoSueldos = usePaginado(sueldos);

  return (
    <div className="page">
      <h1>Empleado</h1>

      <form className="date-filters" onSubmit={aplicarFiltro} style={{ marginBottom: 20 }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span className="muted">a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button type="submit" className="primary">Filtrar resumen</button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {resumen && (
        <div className="cards-row">
          <div className="stat-card"><div className="label">Cobrado a clientes</div><div className="value">{formatoMoneda(resumen.total_cobrado)}</div></div>
          <div className="stat-card"><div className="label">Materiales usados</div><div className="value">{formatoMoneda(resumen.total_materiales)}</div></div>
          <div className={`stat-card ${resumen.ganancia_trabajos >= 0 ? 'positive' : 'negative'}`}><div className="label">Ganancia trabajos</div><div className="value">{formatoMoneda(resumen.ganancia_trabajos)}</div></div>
          <div className="stat-card"><div className="label">Sueldos pagados</div><div className="value">{formatoMoneda(resumen.total_sueldos)}</div></div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Cargar trabajo</h2>
        <form onSubmit={crearTrabajo}>
          <div className="form-row" style={{ marginBottom: 8 }}>
            <label className="campo">
              <span>Fecha</span>
              <input type="date" value={nuevoTrabajo.fecha} onChange={(e) => setNuevoTrabajo((n) => ({ ...n, fecha: e.target.value }))} />
            </label>
            <label className="campo">
              <span>Cliente</span>
              <input placeholder="Cliente" value={nuevoTrabajo.cliente} onChange={(e) => setNuevoTrabajo((n) => ({ ...n, cliente: e.target.value }))} required />
            </label>
          </div>
          <div className="form-row" style={{ marginBottom: 8 }}>
            <label className="campo">
              <span>Tipo de trabajo</span>
              <input placeholder="Tipo de trabajo" value={nuevoTrabajo.tipo_trabajo} onChange={(e) => setNuevoTrabajo((n) => ({ ...n, tipo_trabajo: e.target.value }))} />
            </label>
            <label className="campo">
              <span>Cobro al cliente</span>
              <input type="text" inputMode="decimal" placeholder="Cobro al cliente" value={nuevoTrabajo.cobro_cliente} onChange={(e) => setNuevoTrabajo((n) => ({ ...n, cobro_cliente: e.target.value }))} />
            </label>
          </div>

          <div className="gasto-form" style={{ marginBottom: 8 }}>
            <label className="campo" style={{ flex: 1 }}>
              <span>Material usado</span>
              <input placeholder="Material usado" value={materialDesc} onChange={(e) => setMaterialDesc(e.target.value)} />
            </label>
            <label className="campo">
              <span>Costo</span>
              <input type="text" inputMode="decimal" placeholder="Costo" value={materialCosto} onChange={(e) => setMaterialCosto(e.target.value)} style={{ width: 110 }} />
            </label>
            <button type="button" className="btn-secondary" onClick={agregarMaterial}>+ Agregar material</button>
          </div>
          {materiales.length > 0 && (
            <table className="simple-table" style={{ marginBottom: 10 }}>
              <thead><tr><th>Material</th><th>Costo</th><th /></tr></thead>
              <tbody>
                {materiales.map((m, idx) => (
                  <tr key={idx}>
                    <td>{m.descripcion}</td>
                    <td>{formatoMoneda(m.costo)}</td>
                    <td><button type="button" className="btn-link-danger" onClick={() => quitarMaterial(idx)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="submit" className="btn-primary" disabled={guardandoTrabajo}>{guardandoTrabajo ? 'Guardando...' : 'Guardar trabajo'}</button>
        </form>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Trabajos</h2>
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Cobro</th><th>Materiales</th><th>Ganancia</th><th /></tr></thead>
              <tbody>
                {trabajos.length === 0 && <tr><td colSpan={7} className="muted">Sin trabajos cargados</td></tr>}
                {paginadoTrabajos.visibles.map((t) => (
                  <tr key={t.id}>
                    <td>{String(t.fecha).slice(0, 10)}</td>
                    <td>{t.cliente}</td>
                    <td>{t.tipo_trabajo || '—'}</td>
                    <td>{formatoMoneda(t.cobro_cliente)}</td>
                    <td>{formatoMoneda(t.costo_materiales)}</td>
                    <td style={{ color: t.ganancia >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatoMoneda(t.ganancia)}</td>
                    <td><button type="button" className="btn-link-danger" disabled={eliminandoTrabajoId === t.id} onClick={() => eliminarTrabajo(t.id)}>{eliminandoTrabajoId === t.id ? 'Eliminando...' : 'Eliminar'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador pagina={paginadoTrabajos.pagina} totalPaginas={paginadoTrabajos.totalPaginas} onCambiar={paginadoTrabajos.setPagina} />
          </>
        )}
      </div>

      <div className="panel">
        <h2>Sueldos</h2>
        <form onSubmit={crearSueldo} className="gasto-form" style={{ marginBottom: 14 }}>
          <label className="campo">
            <span>Fecha</span>
            <input type="date" value={nuevoSueldo.fecha} onChange={(e) => setNuevoSueldo((n) => ({ ...n, fecha: e.target.value }))} />
          </label>
          <label className="campo">
            <span>Pago</span>
            <input type="text" inputMode="decimal" placeholder="Pago" value={nuevoSueldo.pago} onChange={(e) => setNuevoSueldo((n) => ({ ...n, pago: e.target.value }))} style={{ width: 140 }} />
          </label>
          <button type="submit" className="btn-primary" disabled={guardandoSueldo}>{guardandoSueldo ? 'Agregando...' : 'Agregar'}</button>
        </form>
        <table className="simple-table">
          <thead><tr><th>Fecha</th><th>Pago</th><th /></tr></thead>
          <tbody>
            {sueldos.length === 0 && <tr><td colSpan={3} className="muted">Sin sueldos cargados</td></tr>}
            {paginadoSueldos.visibles.map((s) => (
              <tr key={s.id}>
                <td>{String(s.fecha).slice(0, 10)}</td>
                <td>{formatoMoneda(s.pago)}</td>
                <td><button type="button" className="btn-link-danger" disabled={eliminandoSueldoId === s.id} onClick={() => eliminarSueldo(s.id)}>{eliminandoSueldoId === s.id ? 'Eliminando...' : 'Eliminar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginador pagina={paginadoSueldos.pagina} totalPaginas={paginadoSueldos.totalPaginas} onCambiar={paginadoSueldos.setPagina} />
      </div>
    </div>
  );
}
