import { formatoPct, labelMetodo } from '../utils/pagos';

// (Ya no se usa: el recargo/descuento se muestra como una sola linea con su
// % redondeado sobre el precio de lista. Se deja por compatibilidad.)
export default function RecargoLinea({ metodo, pct, monto, formatoMoneda }) {
  return (
    <div className="resumen-linea">
      <span>{labelMetodo(metodo)} ({formatoPct(pct)})</span>
      <span>{formatoMoneda(monto)}</span>
    </div>
  );
}
