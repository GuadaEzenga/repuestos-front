import { useEffect, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { useUi } from '../context/UiContext';

export default function Grupos() {
  const { toast, confirm } = useUi();
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  const [abierto, setAbierto] = useState(null); // id del grupo expandido
  const [detalle, setDetalle] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null); // null = creando nuevo, id = editando ese grupo
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [resultadosProducto, setResultadosProducto] = useState([]);
  const [itemsNuevo, setItemsNuevo] = useState([]); // [{producto_id, descripcion, codigo, cantidad}]
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/grupos');
      setGrupos(data.grupos);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function toggleDetalle(id) {
    if (abierto === id) {
      setAbierto(null);
      setDetalle(null);
      return;
    }
    setAbierto(id);
    const data = await api.get(`/grupos/${id}`);
    setDetalle(data);
  }

  async function eliminarGrupo(id) {
    const ok = await confirm('¿Dar de baja este grupo?', { danger: true, confirmLabel: 'Dar de baja' });
    if (!ok) return;
    setEliminandoId(id);
    try {
      await api.delete(`/grupos/${id}`);
      setGrupos((prev) => prev.filter((g) => g.id !== id));
      if (abierto === id) { setAbierto(null); setDetalle(null); }
      toast('Grupo dado de baja ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoId(null);
    }
  }

  async function buscarProducto(texto) {
    setBusquedaProducto(texto);
    if (!texto.trim()) { setResultadosProducto([]); return; }
    const data = await api.get('/productos', { q: texto, pageSize: 10 });
    setResultadosProducto(data.productos);
  }

  function agregarItem(producto) {
    if (itemsNuevo.some((i) => i.producto_id === producto.id)) return;
    setItemsNuevo((prev) => [...prev, { producto_id: producto.id, descripcion: producto.descripcion, codigo: producto.codigo, cantidad: 1 }]);
    setBusquedaProducto('');
    setResultadosProducto([]);
  }

  function cambiarCantidadItem(producto_id, cantidad) {
    setItemsNuevo((prev) => prev.map((i) => (i.producto_id === producto_id ? { ...i, cantidad } : i)));
  }

  function quitarItem(producto_id) {
    setItemsNuevo((prev) => prev.filter((i) => i.producto_id !== producto_id));
  }

  function cerrarForm() {
    setMostrarForm(false);
    setEditandoId(null);
    setNombreNuevo('');
    setItemsNuevo([]);
    setBusquedaProducto('');
    setResultadosProducto([]);
  }

  async function empezarEdicion(grupo) {
    // Si ya estaba abierto el detalle lo reusamos, sino lo pedimos.
    const data = abierto === grupo.id && detalle ? detalle : await api.get(`/grupos/${grupo.id}`);
    setEditandoId(grupo.id);
    setNombreNuevo(data.nombre);
    setItemsNuevo(data.items.map((it) => ({ producto_id: it.producto_id, descripcion: it.descripcion, codigo: it.codigo, cantidad: it.cantidad })));
    setMostrarForm(true);
    setAbierto(null);
    setDetalle(null);
  }

  async function crearGrupo(e) {
    e.preventDefault();
    if (!nombreNuevo.trim() || itemsNuevo.length === 0) return;
    setGuardando(true);
    setError(null);
    try {
      const items = itemsNuevo.map((i) => ({ producto_id: i.producto_id, cantidad: parseNumero(i.cantidad) || 1 }));
      if (editandoId) {
        await api.put(`/grupos/${editandoId}`, { nombre: nombreNuevo, items });
      } else {
        await api.post('/grupos', { nombre: nombreNuevo, items });
      }
      cerrarForm();
      cargar();
      toast(editandoId ? 'Grupo actualizado ✓' : 'Grupo creado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="page">
      <div className="dashboard-toolbar">
        <h1>Grupos</h1>
        <button type="button" className="btn-primary" onClick={() => (mostrarForm ? cerrarForm() : setMostrarForm(true))}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo grupo'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Un grupo es un kit: varios productos que siempre se venden juntos, en cantidades fijas.
      </p>

      {error && <div className="error-box">{error}</div>}

      {mostrarForm && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>{editandoId ? 'Editar grupo' : 'Nuevo grupo'}</h2>
          <form onSubmit={crearGrupo}>
            <input
              placeholder="Nombre del grupo"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
              required
            />

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                className="buscador"
                placeholder="Buscar producto para agregar..."
                value={busquedaProducto}
                onChange={(e) => buscarProducto(e.target.value)}
              />
              {resultadosProducto.length > 0 && (
                <ul className="resultados-lista" style={{ position: 'absolute', width: '100%', zIndex: 10, background: 'white' }}>
                  {resultadosProducto.map((p) => (
                    <li key={p.id} onClick={() => agregarItem(p)}>
                      <span>{p.descripcion}</span>
                      <span className="muted">{p.codigo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {itemsNuevo.length > 0 && (
              <table className="simple-table" style={{ marginBottom: 10 }}>
                <thead><tr><th>Producto</th><th>Cantidad</th><th /></tr></thead>
                <tbody>
                  {itemsNuevo.map((i) => (
                    <tr key={i.producto_id}>
                      <td>{i.descripcion}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={i.cantidad}
                          onChange={(e) => cambiarCantidadItem(i.producto_id, e.target.value)}
                          style={{ width: 70 }}
                        />
                      </td>
                      <td><button type="button" className="btn-link-danger" onClick={() => quitarItem(i.producto_id)}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button type="submit" className="btn-primary" disabled={guardando || itemsNuevo.length === 0}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar grupo'}
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <table className="simple-table">
            <thead>
              <tr><th>Nombre</th><th>Productos</th><th /></tr>
            </thead>
            <tbody>
              {grupos.length === 0 && (
                <tr><td colSpan={3} className="muted">Todavía no hay grupos creados</td></tr>
              )}
              {grupos.map((g) => (
                <>
                  <tr key={g.id}>
                    <td>{g.nombre}</td>
                    <td>{g.cantidad_productos}</td>
                    <td style={{ display: 'flex', gap: 12 }}>
                      <button type="button" className="btn-link" onClick={() => toggleDetalle(g.id)}>
                        {abierto === g.id ? 'Ocultar' : 'Ver productos'}
                      </button>
                      <button type="button" className="btn-link" onClick={() => empezarEdicion(g)}>Editar</button>
                      <button type="button" className="btn-link-danger" disabled={eliminandoId === g.id} onClick={() => eliminarGrupo(g.id)}>
                        {eliminandoId === g.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                  {abierto === g.id && detalle && (
                    <tr key={`${g.id}-detalle`}>
                      <td colSpan={3} style={{ background: 'var(--bg)' }}>
                        <table className="simple-table">
                          <thead><tr><th>Código</th><th>Producto</th><th>Cantidad por kit</th><th>Stock disponible</th></tr></thead>
                          <tbody>
                            {detalle.items.map((it) => (
                              <tr key={it.producto_id}>
                                <td>{it.codigo}</td>
                                <td>{it.descripcion}</td>
                                <td>{it.cantidad}</td>
                                <td>{it.stock}</td>
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
        )}
      </div>
    </div>
  );
}
