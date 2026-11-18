import { useEffect, useState } from 'react';
import api from '../api/client';

const PAGE_SIZE = 50;
const TIPOS = [
  { clave: '', label: 'Todos los ingresos' },
  { clave: 'compra', label: 'Compra / restock' },
  { clave: 'ajuste', label: 'Ajuste de stock' },
  { clave: 'recarga', label: 'Recarga de gas' },
];

function labelTipo(t) {
  return TIPOS.find((x) => x.clave === t)?.label || t || 'Compra / restock';
}
function moneda(v, currency = 'ARS') {
  if (v == null || v === '') return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(v));
}
function pct(v) {
  if (v == null || v === '') return '—';
  return `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
}
function numero(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}
function fechaHora(texto) {
  if (!texto) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto.split('-').reverse().join('/');
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HistorialStock() {
  const [movimientos, setMovimientos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [qAplicada, setQAplicada] = useState('');
  const [tipo, setTipo] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detalle, setDetalle] = useState(null);

  // Busqueda con un pequeno retraso para no pedir al servidor en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { setQAplicada(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    api.get('/productos/historial', { page, pageSize: PAGE_SIZE, q: qAplicada, tipo, desde, hasta })
      .then((data) => { if (!cancelado) { setMovimientos(data.movimientos); setTotal(data.total); } })
      .catch((err) => { if (!cancelado) setError(err.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [page, qAplicada, tipo, desde, hasta]);

  useEffect(() => {
    if (!detalle) return undefined;
    const alEscape = (e) => { if (e.key === 'Escape') setDetalle(null); };
    window.addEventListener('keydown', alEscape);
    return () => window.removeEventListener('keydown', alEscape);
  }, [detalle]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="productos-toolbar">
        <h1>Historial de stock</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Cada vez que cargás un producto nuevo, reponés stock o ajustás cantidades queda registrado acá, con los datos de ese momento. Tocá una fila para ver todo el detalle.</p>

      <div className="date-filters" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        <input type="search" placeholder="Buscar por código o descripción..." value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPage(1); }}>
          {TIPOS.map((t) => <option key={t.clave} value={t.clave}>{t.label}</option>)}
        </select>
        <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} aria-label="Desde" />
        <span className="muted">a</span>
        <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} aria-label="Hasta" />
        {(desde || hasta || tipo || q) && (
          <button type="button" className="btn-secondary" onClick={() => { setQ(''); setQAplicada(''); setTipo(''); setDesde(''); setHasta(''); setPage(1); }}>Limpiar</button>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="panel">
        <div className="tabla-scroll">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Ingreso</th><th>Código</th><th>Producto</th>
                <th>Cant. cargada</th><th>Costo USD</th><th>IVA</th><th>Envío</th>
                <th>Costo final USD</th><th>Costo final $</th><th>Margen</th><th>Precio venta</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="muted">Cargando...</td></tr>}
              {!loading && movimientos.length === 0 && <tr><td colSpan={12} className="muted">Todavía no hay ingresos de stock registrados con esos filtros.</td></tr>}
              {!loading && movimientos.map((m) => (
                <tr key={m.id} onClick={() => setDetalle(m)} style={{ cursor: 'pointer' }} title="Ver detalle">
                  <td>{fechaHora(m.fecha)}</td>
                  <td>{labelTipo(m.tipo)}</td>
                  <td>{m.codigo || '—'}</td>
                  <td>{m.descripcion}</td>
                  <td>{numero(m.cantidad_original)}</td>
                  <td>{m.costo_usd_base != null ? moneda(m.costo_usd_base, 'USD') : '—'}</td>
                  <td>{pct(m.iva_pct)}</td>
                  <td>{pct(m.envio_pct)}</td>
                  <td>{moneda(m.costo_final_usd, 'USD')}</td>
                  <td>{moneda(m.costo_final_ars)}</td>
                  <td>{pct(m.margen_venta_pct)}</td>
                  <td>{moneda(m.precio_venta_ars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="muted" style={{ fontSize: 12 }}>Página {page} de {totalPaginas} ({total} ingresos)</span>
            <button type="button" className="btn-secondary" disabled={page >= totalPaginas} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
        )}
      </div>

      {detalle && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetalle(null); }}>
          <div className="modal-ventana modal-ventana-ancha">
            <div className="modal-header">
              <h2>{detalle.descripcion}</h2>
              <button type="button" className="modal-cerrar" onClick={() => setDetalle(null)} aria-label="Cerrar">×</button>
            </div>
            <p className="muted" style={{ margin: '0 0 12px' }}>{labelTipo(detalle.tipo)} · {fechaHora(detalle.fecha)}{detalle.motivo ? ` · ${detalle.motivo}` : ''}</p>
            <table className="simple-table">
              <tbody>
                <tr><th>Código</th><td>{detalle.codigo || '—'}</td></tr>
                <tr><th>Categoría</th><td>{detalle.categoria || '—'}</td></tr>
                <tr><th>Cantidad cargada</th><td>{numero(detalle.cantidad_original)}</td></tr>
                <tr><th>Todavía en stock de este ingreso</th><td>{numero(detalle.cantidad_restante)}</td></tr>
                <tr><th>Costo unitario (sin IVA ni envío)</th><td>{detalle.costo_usd_base != null ? moneda(detalle.costo_usd_base, 'USD') : 'No se guardó el desglose'}</td></tr>
                <tr><th>IVA</th><td>{pct(detalle.iva_pct)}</td></tr>
                <tr><th>Envío</th><td>{pct(detalle.envio_pct)}</td></tr>
                <tr><th>Costo final unitario</th><td>{moneda(detalle.costo_final_usd, 'USD')} · {moneda(detalle.costo_final_ars)}</td></tr>
                <tr><th>Dólar de ese día</th><td>{detalle.cotizacion != null ? moneda(detalle.cotizacion) : '—'}</td></tr>
                <tr><th>Costo total del ingreso</th><td>{moneda(detalle.costo_total_usd, 'USD')} · {moneda(detalle.costo_total_ars)}</td></tr>
                <tr><th>Margen fijado</th><td>{pct(detalle.margen_venta_pct)}</td></tr>
                <tr><th>Precio de venta fijado</th><td>{moneda(detalle.precio_venta_ars)}</td></tr>
              </tbody>
            </table>
            {detalle.aproximado && <p className="muted" style={{ fontSize: 12 }}>Este ingreso se reconstruyó a partir de datos viejos: algunos valores son aproximados.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
