import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useUi } from '../context/UiContext';

export default function Categorias() {
  const { toast, confirm } = useUi();
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Asignacion masiva: buscar productos, tildar varios, y mandarlos todos
  // juntos a una categoria (existente o nueva) de una vez.
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  const [categoriaDestino, setCategoriaDestino] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [renombrando, setRenombrando] = useState(null); // categoria en edicion
  const [nombreRenombrar, setNombreRenombrar] = useState('');
  const [guardandoRenombre, setGuardandoRenombre] = useState(false);

  // Ver/editar los productos de una categoria puntual, sin salir de esta
  // pantalla: expandir muestra la lista con checkboxes para poder quitarlos
  // (dejarlos sin categoria) o moverlos a otra, de a varios juntos.
  const [categoriaAbierta, setCategoriaAbierta] = useState(null);
  const [productosCategoria, setProductosCategoria] = useState([]);
  const [cargandoProductosCategoria, setCargandoProductosCategoria] = useState(false);
  const [seleccionCategoria, setSeleccionCategoria] = useState({});
  const [moverA, setMoverA] = useState('');
  const [quitando, setQuitando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/categorias');
      setCategorias(data.categorias);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function buscarProductos(e) {
    e.preventDefault();
    setBuscando(true);
    try {
      const data = await api.get('/productos', { q: busqueda, pageSize: 100 });
      setResultados(data.productos);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuscando(false);
    }
  }

  function toggleSeleccion(id) {
    setSeleccionados((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const idsSeleccionados = Object.entries(seleccionados).filter(([, v]) => v).map(([k]) => Number(k));

  function toggleTodos() {
    if (idsSeleccionados.length === resultados.length) {
      setSeleccionados({});
    } else {
      setSeleccionados(Object.fromEntries(resultados.map((p) => [p.id, true])));
    }
  }

  async function asignarCategoria(e) {
    e.preventDefault();
    if (!categoriaDestino.trim() || idsSeleccionados.length === 0) return;
    setAsignando(true);
    setError(null);
    try {
      const resultado = await api.put('/categorias/asignar', { categoria: categoriaDestino.trim(), producto_ids: idsSeleccionados });
      toast(`Se actualizaron ${resultado.actualizados} producto${resultado.actualizados === 1 ? '' : 's'} ✓`, { duration: 5000 });
      setSeleccionados({});
      setResultados([]);
      setBusqueda('');
      setCategoriaDestino('');
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAsignando(false);
    }
  }

  async function toggleCategoriaAbierta(categoria) {
    if (categoriaAbierta === categoria) {
      setCategoriaAbierta(null);
      return;
    }
    setCategoriaAbierta(categoria);
    setSeleccionCategoria({});
    setMoverA('');
    setProductosCategoria([]);
    setCargandoProductosCategoria(true);
    try {
      const data = await api.get('/productos', { categoria, pageSize: 200 });
      setProductosCategoria(data.productos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargandoProductosCategoria(false);
    }
  }

  function toggleSeleccionCategoria(id) {
    setSeleccionCategoria((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const idsSeleccionCategoria = Object.entries(seleccionCategoria).filter(([, v]) => v).map(([k]) => Number(k));

  function toggleTodosCategoria() {
    if (idsSeleccionCategoria.length === productosCategoria.length) {
      setSeleccionCategoria({});
    } else {
      setSeleccionCategoria(Object.fromEntries(productosCategoria.map((p) => [p.id, true])));
    }
  }

  async function quitarDeCategoria() {
    if (idsSeleccionCategoria.length === 0) return;
    const ok = await confirm(
      `¿Quitar ${idsSeleccionCategoria.length} producto${idsSeleccionCategoria.length === 1 ? '' : 's'} de "${categoriaAbierta}"? Quedan sin categoría.`,
    );
    if (!ok) return;
    setQuitando(true);
    setError(null);
    try {
      const resultado = await api.put('/categorias/quitar', { producto_ids: idsSeleccionCategoria });
      toast(`Se quitaron ${resultado.actualizados} producto${resultado.actualizados === 1 ? '' : 's'} de la categoría ✓`, { duration: 5000 });
      setCategoriaAbierta(null);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setQuitando(false);
    }
  }

  async function moverACategoria() {
    if (!moverA.trim() || idsSeleccionCategoria.length === 0) return;
    setMoviendo(true);
    setError(null);
    try {
      const resultado = await api.put('/categorias/asignar', { categoria: moverA.trim(), producto_ids: idsSeleccionCategoria });
      toast(`Se movieron ${resultado.actualizados} producto${resultado.actualizados === 1 ? '' : 's'} a "${moverA.trim()}" ✓`, { duration: 5000 });
      setCategoriaAbierta(null);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setMoviendo(false);
    }
  }

  function empezarRenombrar(categoria) {
    setRenombrando(categoria);
    setNombreRenombrar(categoria);
  }

  async function guardarRenombre(categoriaActual) {
    if (!nombreRenombrar.trim() || nombreRenombrar.trim() === categoriaActual) {
      setRenombrando(null);
      return;
    }
    setGuardandoRenombre(true);
    setError(null);
    try {
      const resultado = await api.put('/categorias/renombrar', { categoria_actual: categoriaActual, categoria_nueva: nombreRenombrar.trim() });
      toast(`Categoría renombrada en ${resultado.actualizados} producto${resultado.actualizados === 1 ? '' : 's'} ✓`, { duration: 5000 });
      setRenombrando(null);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoRenombre(false);
    }
  }

  return (
    <div className="page">
      <h1>Categorías</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        La categoría es un texto libre en cada producto (no es una lista fija). Podés asignarla una por una desde{' '}
        <Link to="/productos">Productos</Link>, o en banda acá abajo.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Asignación masiva</h2>
        <form onSubmit={buscarProductos} className="form-row" style={{ marginBottom: 12 }}>
          <input
            placeholder="Buscar productos por código o descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-secondary" disabled={buscando}>{buscando ? 'Buscando...' : 'Buscar'}</button>
        </form>

        {resultados.length > 0 && (
          <>
            <table className="simple-table" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={idsSeleccionados.length === resultados.length} onChange={toggleTodos} />
                  </th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Categoría actual</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((p) => (
                  <tr key={p.id} onClick={() => toggleSeleccion(p.id)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!seleccionados[p.id]} onChange={() => toggleSeleccion(p.id)} />
                    </td>
                    <td>{p.codigo || '—'}</td>
                    <td>{p.descripcion}</td>
                    <td className="muted">{p.categoria || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form onSubmit={asignarCategoria} className="form-row">
              <input
                placeholder="Categoría destino (nueva o existente)"
                value={categoriaDestino}
                onChange={(e) => setCategoriaDestino(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-primary" disabled={asignando || idsSeleccionados.length === 0}>
                {asignando ? 'Asignando...' : `Asignar a ${idsSeleccionados.length} producto${idsSeleccionados.length === 1 ? '' : 's'}`}
              </button>
            </form>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Categorías existentes</h2>
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <table className="simple-table">
            <thead>
              <tr><th>Categoría</th><th>Productos</th><th /></tr>
            </thead>
            <tbody>
              {categorias.length === 0 && (
                <tr><td colSpan={3} className="muted">Todavía no hay productos con categoría asignada</td></tr>
              )}
              {categorias.map((c) => (
                <Fragment key={c.categoria}>
                <tr>
                  <td>
                    {renombrando === c.categoria ? (
                      <input
                        autoFocus
                        value={nombreRenombrar}
                        onChange={(e) => setNombreRenombrar(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarRenombre(c.categoria); if (e.key === 'Escape') setRenombrando(null); }}
                        style={{ width: 160 }}
                        disabled={guardandoRenombre}
                      />
                    ) : (
                      c.categoria
                    )}
                  </td>
                  <td>{c.cantidad_productos}</td>
                  <td style={{ display: 'flex', gap: 12 }}>
                    <button type="button" className="btn-link" onClick={() => toggleCategoriaAbierta(c.categoria)}>
                      {categoriaAbierta === c.categoria ? 'Cerrar' : 'Agregar / quitar productos'}
                    </button>
                    <Link to={`/productos?categoria=${encodeURIComponent(c.categoria)}`} className="btn-link">
                      Ver en Productos
                    </Link>
                    {renombrando === c.categoria ? (
                      <>
                        <button type="button" className="btn-link" onClick={() => guardarRenombre(c.categoria)} disabled={guardandoRenombre}>
                          {guardandoRenombre ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button type="button" className="btn-link" onClick={() => setRenombrando(null)} disabled={guardandoRenombre}>Cancelar</button>
                      </>
                    ) : (
                      <button type="button" className="btn-link" onClick={() => empezarRenombrar(c.categoria)}>Renombrar</button>
                    )}
                  </td>
                </tr>
                {categoriaAbierta === c.categoria && (
                  <tr>
                    <td colSpan={3} style={{ background: 'var(--bg)' }}>
                      <div style={{ padding: '10px 4px' }}>
                        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                          Tildá productos y quitalos de "{c.categoria}" (quedan sin categoría), o movelos a otra categoría de una.
                          Para agregar productos a esta categoría, usá la "Asignación masiva" de más arriba.
                        </p>
                        {cargandoProductosCategoria && <div className="loading">Cargando productos...</div>}
                        {!cargandoProductosCategoria && productosCategoria.length === 0 && (
                          <p className="muted">No hay productos activos en esta categoría.</p>
                        )}
                        {!cargandoProductosCategoria && productosCategoria.length > 0 && (
                          <>
                            <table className="simple-table" style={{ marginBottom: 12 }}>
                              <thead>
                                <tr>
                                  <th style={{ width: 30 }}>
                                    <input type="checkbox" checked={idsSeleccionCategoria.length === productosCategoria.length} onChange={toggleTodosCategoria} />
                                  </th>
                                  <th>Código</th>
                                  <th>Descripción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {productosCategoria.map((p) => (
                                  <tr key={p.id} onClick={() => toggleSeleccionCategoria(p.id)} style={{ cursor: 'pointer' }}>
                                    <td onClick={(e) => e.stopPropagation()}>
                                      <input type="checkbox" checked={!!seleccionCategoria[p.id]} onChange={() => toggleSeleccionCategoria(p.id)} />
                                    </td>
                                    <td>{p.codigo || '—'}</td>
                                    <td>{p.descripcion}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn-danger"
                                disabled={quitando || idsSeleccionCategoria.length === 0}
                                onClick={quitarDeCategoria}
                              >
                                {quitando ? 'Quitando...' : `Quitar ${idsSeleccionCategoria.length || ''} de la categoría`}
                              </button>
                              <input
                                placeholder="Mover a otra categoría..."
                                value={moverA}
                                onChange={(e) => setMoverA(e.target.value)}
                                style={{ width: 200 }}
                              />
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={moviendo || !moverA.trim() || idsSeleccionCategoria.length === 0}
                                onClick={moverACategoria}
                              >
                                {moviendo ? 'Moviendo...' : 'Mover seleccionados'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
