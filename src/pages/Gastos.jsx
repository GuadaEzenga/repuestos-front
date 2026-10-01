import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { useUi } from '../context/UiContext';

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const PAGE_SIZE = 15;

// Paginacion simple sobre lo ya cargado (igual que en Reportes/Empleado --
// Gastos trae hasta 200 registros de una, esto solo pagina la vista).
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

export default function Gastos() {
  const { toast, confirm } = useUi();
  const [gastos, setGastos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(true);
  const [eliminandoId, setEliminandoId] = useState(null);

  const [nuevo, setNuevo] = useState({ fecha: hoyISO(), descripcion: '', tipo: 'otros', monto: '' });
  const [nuevoTipoCustom, setNuevoTipoCustom] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar(tipo, desdeParam, hastaParam) {
    setLoading(true);
    const [dataGastos, dataTipos] = await Promise.all([
      api.get('/gastos', { tipo: tipo || undefined, desde: desdeParam || undefined, hasta: hastaParam || undefined, pageSize: 200 }),
      api.get('/gastos/tipos'),
    ]);
    setGastos(dataGastos.gastos);
    setTipos(dataTipos.tipos);
    setLoading(false);
  }

  useEffect(() => { cargar('', '', ''); }, []);

  function aplicarFiltroTipo(tipo) {
    setFiltroTipo(tipo);
    cargar(tipo, desde, hasta);
  }

  function aplicarFiltroFecha(e) {
    e.preventDefault();
    cargar(filtroTipo, desde, hasta);
  }

  async function actualizarTipo(id, tipo) {
    setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, tipo } : g)));
    try {
      await api.put(`/gastos/${id}`, { tipo });
      toast('Guardado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  // "+ nuevo tipo..." tambien disponible en el select de cada fila del
  // historial (antes solo estaba en el formulario de "Cargar gasto"), para
  // no tener que ir a otro lado a crear una categoría.
  const [nuevoTipoFilaId, setNuevoTipoFilaId] = useState(null);
  const [nuevoTipoFilaValor, setNuevoTipoFilaValor] = useState('');

  function manejarCambioTipoFila(id, valor) {
    if (valor === '__nuevo__') {
      setNuevoTipoFilaId(id);
      setNuevoTipoFilaValor('');
    } else {
      actualizarTipo(id, valor);
    }
  }

  function confirmarNuevoTipoFila(id) {
    const tipoFinal = nuevoTipoFilaValor.trim().toLowerCase();
    setNuevoTipoFilaId(null);
    setNuevoTipoFilaValor('');
    if (!tipoFinal) return;
    if (!tipos.includes(tipoFinal)) setTipos((prev) => [...prev, tipoFinal]);
    actualizarTipo(id, tipoFinal);
  }

  async function actualizarDescripcion(id, descripcion) {
    setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, descripcion } : g)));
  }

  async function guardarDescripcion(id, descripcion) {
    try {
      await api.put(`/gastos/${id}`, { descripcion: descripcion || '' });
      toast('Guardado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  // El monto y la fecha también son "modificación" -- antes solo se podía
  // editar tipo y descripción desde el historial.
  async function guardarMonto(id, valor) {
    const monto = parseNumero(valor);
    if (monto == null) return;
    setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, monto } : g)));
    try {
      await api.put(`/gastos/${id}`, { monto });
      toast('Guardado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  async function guardarFecha(id, fecha) {
    if (!fecha) return;
    setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, fecha } : g)));
    try {
      await api.put(`/gastos/${id}`, { fecha });
      toast('Guardado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  async function eliminarGasto(id) {
    const ok = await confirm('¿Eliminar este gasto?', { danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    setEliminandoId(id);
    try {
      await api.delete(`/gastos/${id}`);
      setGastos((prev) => prev.filter((g) => g.id !== id));
      toast('Gasto eliminado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoId(null);
    }
  }

  async function crearGasto(e) {
    e.preventDefault();
    if (!nuevo.monto) return;
    setGuardando(true);
    try {
      const tipoFinal = nuevo.tipo === '__nuevo__' ? nuevoTipoCustom.trim().toLowerCase() : nuevo.tipo;
      if (!tipoFinal) return;
      const creado = await api.post('/gastos', { ...nuevo, tipo: tipoFinal, monto: parseNumero(nuevo.monto) });
      setGastos((prev) => [creado, ...prev]);
      if (!tipos.includes(tipoFinal)) setTipos((prev) => [...prev, tipoFinal]);
      setNuevo({ fecha: hoyISO(), descripcion: '', tipo: 'otros', monto: '' });
      setNuevoTipoCustom('');
      toast('Gasto cargado ✓');
    } finally {
      setGuardando(false);
    }
  }

  const totalFiltrado = gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0);

  // Acumulado por mes: la tabla viene ordenada por fecha DESC (mas nuevo
  // primero), pero el acumulado se calcula en orden cronologico ascendente
  // dentro de cada mes -- despues se muestra en el mismo orden de la tabla.
  const acumuladoPorId = useMemo(() => {
    const ascendente = [...gastos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const acumuladoPorMes = {};
    const mapa = {};
    for (const g of ascendente) {
      const mes = String(g.fecha).slice(0, 7);
      acumuladoPorMes[mes] = (acumuladoPorMes[mes] || 0) + Number(g.monto || 0);
      mapa[g.id] = acumuladoPorMes[mes];
    }
    return mapa;
  }, [gastos]);

  const paginadoGastos = usePaginado(gastos);

  return (
    <div className="page">
      <h1>Gastos</h1>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Cargar gasto</h2>
        <form onSubmit={crearGasto} className="gasto-form">
          <label className="campo">
            <span>Fecha</span>
            <input type="date" value={nuevo.fecha} onChange={(e) => setNuevo((n) => ({ ...n, fecha: e.target.value }))} />
          </label>
          <label className="campo" style={{ flex: 1 }}>
            <span>Descripción</span>
            <input
              placeholder="Descripción"
              value={nuevo.descripcion}
              onChange={(e) => setNuevo((n) => ({ ...n, descripcion: e.target.value }))}
            />
          </label>
          <label className="campo">
            <span>Tipo</span>
            <select value={nuevo.tipo} onChange={(e) => setNuevo((n) => ({ ...n, tipo: e.target.value }))}>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__nuevo__">+ nuevo tipo...</option>
            </select>
          </label>
          {nuevo.tipo === '__nuevo__' && (
            <label className="campo">
              <span>Nombre del tipo</span>
              <input placeholder="Nombre del tipo" value={nuevoTipoCustom} onChange={(e) => setNuevoTipoCustom(e.target.value)} />
            </label>
          )}
          <label className="campo">
            <span>Monto</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Monto"
              value={nuevo.monto}
              onChange={(e) => setNuevo((n) => ({ ...n, monto: e.target.value }))}
              style={{ width: 120 }}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={guardando} style={{ alignSelf: 'end' }}>{guardando ? 'Agregando...' : 'Agregar'}</button>
        </form>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Historial</h2>
          <select value={filtroTipo} onChange={(e) => aplicarFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <form onSubmit={aplicarFiltroFecha} className="date-filters" style={{ marginBottom: 16 }}>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <span className="muted">a</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <button type="submit" className="primary">Filtrar</button>
          {(desde || hasta) && (
            <button type="button" className="btn-secondary" onClick={() => { setDesde(''); setHasta(''); cargar(filtroTipo, '', ''); }}>
              Limpiar
            </button>
          )}
        </form>

        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th>Acum. del mes</th><th /></tr>
              </thead>
              <tbody>
                {gastos.length === 0 && <tr><td colSpan={6} className="muted">Sin gastos que coincidan</td></tr>}
                {paginadoGastos.visibles.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <input
                        className="input-inline"
                        type="date"
                        defaultValue={String(g.fecha).slice(0, 10)}
                        onChange={(e) => guardarFecha(g.id, e.target.value)}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td>
                      <input
                        className="input-inline"
                        defaultValue={g.descripcion || ''}
                        onChange={(e) => actualizarDescripcion(g.id, e.target.value)}
                        onBlur={(e) => guardarDescripcion(g.id, e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td>
                      {nuevoTipoFilaId === g.id ? (
                        <input
                          autoFocus
                          placeholder="Nombre del tipo nuevo"
                          value={nuevoTipoFilaValor}
                          onChange={(e) => setNuevoTipoFilaValor(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarNuevoTipoFila(g.id); } }}
                          onBlur={() => confirmarNuevoTipoFila(g.id)}
                          style={{ width: 130 }}
                        />
                      ) : (
                        <select value={g.tipo || 'otros'} onChange={(e) => manejarCambioTipoFila(g.id, e.target.value)}>
                          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
                          <option value="__nuevo__">+ nuevo tipo...</option>
                        </select>
                      )}
                    </td>
                    <td>
                      <input
                        className="input-inline"
                        type="text"
                        inputMode="decimal"
                        defaultValue={g.monto}
                        onBlur={(e) => guardarMonto(g.id, e.target.value)}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td className="muted">{formatoMoneda(acumuladoPorId[g.id])}</td>
                    <td><button type="button" onClick={() => eliminarGasto(g.id)} disabled={eliminandoId === g.id} className="btn-link-danger">{eliminandoId === g.id ? 'Eliminando...' : 'Eliminar'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador pagina={paginadoGastos.pagina} totalPaginas={paginadoGastos.totalPaginas} onCambiar={paginadoGastos.setPagina} />
            <p style={{ textAlign: 'right', marginTop: 10 }}>
              Total: <strong>{formatoMoneda(totalFiltrado)}</strong>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
