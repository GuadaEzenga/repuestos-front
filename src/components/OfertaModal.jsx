import { useEffect, useState } from 'react';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { METODOS_PAGO, labelMetodo, calcularTotalVenta, cuotasMaxDesdeConfig } from '../utils/pagos';
import { ofertaVigente, metodosOferta, precioListaOferta, hoyArgentina } from '../utils/ofertas';
import { useUi } from '../context/UiContext';

function formatoMoneda(valor) {
  if (valor == null || Number.isNaN(valor)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(valor);
}

// Ventana "Oferta" de un producto: precio fijo en las formas de pago que se
// elijan. En las demás se parte de la oferta y se suma/resta el % normal
// de cada método (ver utils/ofertas.js). Abajo muestra cuánto paga el
// público y el técnico con cada forma de pago, antes de guardar.
export default function OfertaModal({ producto, config, onCerrar, onGuardado }) {
  const { toast, confirm } = useUi();
  const existente = ofertaVigente(producto) || (Number(producto.oferta_precio) > 0 ? { precio: Number(producto.oferta_precio), metodos: metodosOferta(producto), hasta: producto.oferta_hasta } : null);
  const [precio, setPrecio] = useState(existente ? String(existente.precio).replace('.', ',') : '');
  const [metodos, setMetodos] = useState(new Set(existente?.metodos?.length ? existente.metodos : ['efectivo']));
  const [hasta, setHasta] = useState(existente?.hasta || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function alEscape(e) { if (e.key === 'Escape') onCerrar(); }
    window.addEventListener('keydown', alEscape);
    return () => window.removeEventListener('keydown', alEscape);
  }, [onCerrar]);

  function toggleMetodo(clave) {
    setMetodos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(clave)) nuevo.delete(clave); else nuevo.add(clave);
      return nuevo;
    });
  }

  const precioNum = parseNumero(precio);
  const listaMetodos = METODOS_PAGO.map((m) => m.clave).filter((c) => metodos.has(c));
  const vencida = existente?.hasta && existente.hasta < hoyArgentina();
  const prodPrueba = precioNum > 0 && listaMetodos.length > 0
    ? { ...producto, oferta_precio: precioNum, oferta_metodos: listaMetodos, oferta_hasta: null }
    : null;

  function totalCon(prod, metodo, esTecnico, cuotas = 1) {
    if (!config) return null;
    const lista = prod ? precioListaOferta(prod, config, { metodo, esTecnico, cuotas }) : (producto.precio_lista ?? producto.precio);
    if (lista == null) return null;
    return calcularTotalVenta({ subtotal: lista, metodo, esTecnico, config, cuotas }).total;
  }

  const cuotasMax = cuotasMaxDesdeConfig(config || {});

  async function guardar() {
    setError(null);
    if (!(precioNum > 0)) { setError('Poné el precio de la oferta.'); return; }
    if (listaMetodos.length === 0) { setError('Elegí al menos una forma de pago.'); return; }
    setGuardando(true);
    try {
      const actualizado = await api.put(`/productos/${producto.id}/oferta`, { precio: precioNum, metodos: listaMetodos, hasta: hasta || null });
      toast('Oferta guardada ✓');
      onGuardado?.(actualizado);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function quitar() {
    const ok = await confirm('¿Quitar la oferta de este producto? Vuelve a su precio normal.', { danger: true, confirmLabel: 'Quitar oferta' });
    if (!ok) return;
    setGuardando(true);
    try {
      const actualizado = await api.delete(`/productos/${producto.id}/oferta`);
      toast('Oferta quitada ✓');
      onGuardado?.(actualizado);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-ventana modal-ventana-ancha">
        <div className="modal-header">
          <h2>Oferta</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{producto.codigo ? `#${producto.codigo} — ` : ''}{producto.descripcion}</p>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Precio normal (lista): {formatoMoneda(producto.precio_lista ?? producto.precio)}.
          {vencida && <strong style={{ color: 'var(--danger)' }}> La oferta anterior venció el {existente.hasta.split('-').reverse().join('/')}.</strong>}
        </p>

        <div className="modal-body" style={{ gap: 12 }}>
          <label className="campo">
            <span>Precio de oferta (lo que paga el cliente)</span>
            <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="1500" style={{ width: 140, fontSize: 18, fontWeight: 600 }} autoFocus />
          </label>

          <div>
            <span className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Ese precio vale pagando con:</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              {METODOS_PAGO.map((m) => (
                <label key={m.clave} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={metodos.has(m.clave)} onChange={() => toggleMetodo(m.clave)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <label className="campo">
            <span>Válida hasta (opcional — vacío = hasta que la saques)</span>
            <input type="date" value={hasta || ''} onChange={(e) => setHasta(e.target.value)} style={{ width: 170 }} />
          </label>

          {prodPrueba && config && (
            <div>
              <span className="muted" style={{ fontSize: 12 }}>Así queda (1 unidad). Con otras formas de pago se parte del precio de oferta y se aplica el % de siempre:</span>
              <table className="simple-table" style={{ marginTop: 4 }}>
                <thead><tr><th>Forma de pago</th><th>Público</th><th>Técnico</th><th className="muted">Sin oferta</th></tr></thead>
                <tbody>
                  {METODOS_PAGO.map((m) => (
                    <tr key={m.clave} style={metodos.has(m.clave) ? { fontWeight: 600 } : undefined}>
                      <td>{labelMetodo(m.clave)}{metodos.has(m.clave) && <span className="badge-oferta" style={{ marginLeft: 6 }}>OFERTA</span>}</td>
                      <td>{formatoMoneda(totalCon(prodPrueba, m.clave, false))}</td>
                      <td>{formatoMoneda(totalCon(prodPrueba, m.clave, true))}</td>
                      <td className="muted">{formatoMoneda(totalCon(null, m.clave, false))}</td>
                    </tr>
                  ))}
                  {cuotasMax > 1 && (
                    <tr>
                      <td>Crédito en {cuotasMax} cuotas</td>
                      <td>{formatoMoneda(totalCon(prodPrueba, 'tarjeta_credito', false, cuotasMax))}</td>
                      <td>{formatoMoneda(totalCon(prodPrueba, 'tarjeta_credito', true, cuotasMax))}</td>
                      <td className="muted">{formatoMoneda(totalCon(null, 'tarjeta_credito', false, cuotasMax))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {metodos.has('efectivo') && (
                <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                  En efectivo el total de la venta se redondea a múltiplos de ${config.redondeo_unidad || 10}.
                </p>
              )}
            </div>
          )}

          {error && <div className="error-box">{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 4 }}>
            <div>
              {existente && <button type="button" className="btn-link-danger" onClick={quitar} disabled={guardando}>Quitar oferta</button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar oferta'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
