import { useState } from 'react';
import { detalleRecargoItems, formatoPct, labelMetodo } from '../utils/pagos';

// Linea "Recargo <forma de pago> +X%" del resumen de la venta, con un
// "Ver detalle" desplegable (como el detalle de un movimiento en Mercado
// Pago) que muestra de que se compone ese recargo.
export default function RecargoLinea({ metodo, cuotas = 1, calculo, formatoMoneda }) {
  const [abierto, setAbierto] = useState(false);
  const base = calculo.total - calculo.recargoComision;
  const pctTotal = base > 0 ? (calculo.recargoComision / base) * 100 : 0;
  const items = detalleRecargoItems(calculo, cuotas);
  return (
    <>
      <div className="resumen-linea">
        <span>
          Recargo {labelMetodo(metodo)}{cuotas > 1 ? ` en ${cuotas} cuotas` : ''} (+{formatoPct(pctTotal)}){' '}
          <button type="button" className="btn-link" style={{ padding: 0, fontSize: 12 }} onClick={() => setAbierto((a) => !a)}>
            {abierto ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
        </span>
        <span>+{formatoMoneda(calculo.recargoComision)}</span>
      </div>
      {abierto && (
        <div className="muted" style={{ fontSize: 12, padding: '2px 0 6px 12px', borderLeft: '2px solid var(--border)', margin: '0 0 6px 4px' }}>
          {items.map((it) => (
            <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{it.label}</span><span>{formatoPct(it.pct)}</span>
            </div>
          ))}
          <div style={{ marginTop: 4 }}>Porcentajes sobre lo que paga el cliente. El recargo hace que te quede limpio el precio sin recargo.</div>
        </div>
      )}
    </>
  );
}
