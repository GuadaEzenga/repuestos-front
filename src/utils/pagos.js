// Formas de pago, precio de lista y descuentos/recargos -- MISMA logica que
// el backend (backend/src/utils/pagos.js). Si se cambia una, cambiar la otra.
//
// - Precio de lista = precio con Point debito = precio cargado del producto
//   + recargo_lista_pct (lo calcula el backend: producto.precio_lista).
// - Cada forma de pago aplica un % REDONDEADO sobre la lista, distinto para
//   publico y tecnico. Credito en cuotas: % propio por cantidad de cuotas.
// - Las comisiones de MP solo se usan para mostrar el "minimo" de cada %.

export const IVA_COMISION = 1.21;

export const METODOS_PAGO = [
  { clave: 'efectivo', label: 'Efectivo', grupo: 'Sin comisión' },
  { clave: 'transferencia', label: 'Transferencia', grupo: 'Sin comisión' },
  { clave: 'qr_dinero_mp', label: 'QR - Dinero en Mercado Pago', grupo: 'QR' },
  { clave: 'qr_otra_billetera', label: 'QR - Otra billetera o banco', grupo: 'QR' },
  { clave: 'qr_debito', label: 'QR - Tarjeta de débito', grupo: 'QR' },
  { clave: 'qr_prepaga', label: 'QR - Tarjeta prepaga', grupo: 'QR' },
  { clave: 'qr_credito', label: 'QR - Tarjeta de crédito', grupo: 'QR', credito: true },
  { clave: 'tarjeta_debito', label: 'Point - Débito', grupo: 'Point' },
  { clave: 'tarjeta_prepaga', label: 'Point - Prepaga', grupo: 'Point' },
  { clave: 'tarjeta_credito', label: 'Point - Crédito', grupo: 'Point', credito: true },
  { clave: 'tarjeta_credito_extranjera', label: 'Point - Crédito extranjera / Sucrédito', grupo: 'Point' },
];

export const DEFAULT_COMISIONES = {
  efectivo: 0,
  transferencia: 0,
  qr_dinero_mp: 0.8,
  qr_otra_billetera: 0,
  qr_debito: 0.89,
  qr_prepaga: 3.93,
  qr_credito: 4.4,
  tarjeta_debito: 2.88,
  tarjeta_prepaga: 3.68,
  tarjeta_credito: 4.4,
  tarjeta_credito_extranjera: 7.4,
};
export const DEFAULT_COSTOS_CUOTAS = { 2: 7.79, 3: 10.49, 6: 18.69, 9: 26.49, 12: 32.29, 18: 41.59 };
export const CUOTAS_POSIBLES = [1, 2, 3, 6, 9, 12, 18];
export const DEFAULT_CUOTAS_MAX = 3;
export const DEFAULT_IMPUESTO_COBROS = 0.6;
const METODOS_SIN_IMPUESTO = new Set(['efectivo', 'transferencia']);

export const DEFAULT_PORCENTAJES = {
  publico: {
    efectivo: -10, transferencia: -5,
    qr_dinero_mp: 0, qr_otra_billetera: 0, qr_debito: 0, qr_prepaga: 0, qr_credito: 5,
    tarjeta_debito: 0, tarjeta_prepaga: 0, tarjeta_credito: 5, tarjeta_credito_extranjera: 10,
  },
  tecnico: {
    efectivo: -15, transferencia: -10,
    qr_dinero_mp: -5, qr_otra_billetera: -5, qr_debito: -5, qr_prepaga: -5, qr_credito: 5,
    tarjeta_debito: -5, tarjeta_prepaga: -5, tarjeta_credito: 5, tarjeta_credito_extranjera: 10,
  },
};
export const DEFAULT_PORCENTAJES_CUOTAS = { 2: 15, 3: 20, 6: 35, 9: 55, 12: 75, 18: 120 };

export function labelMetodo(clave) {
  return METODOS_PAGO.find((m) => m.clave === clave)?.label || (clave ? String(clave).replace(/_/g, ' ') : '-');
}

export function esMetodoCredito(clave) {
  return !!METODOS_PAGO.find((m) => m.clave === clave)?.credito;
}

export function textoFormaPago(metodo, cuotas) {
  const base = labelMetodo(metodo);
  return cuotas && Number(cuotas) > 1 ? `${base} (${cuotas} cuotas sin interés)` : base;
}

function parsear(json) {
  if (json == null || json === '') return {};
  try { return JSON.parse(json); } catch { return {}; }
}

function numeroConfig(v, porDefecto) {
  if (v == null || String(v).trim() === '') return porDefecto;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : porDefecto;
}

export function comisionesDesdeConfig(config) {
  return { ...DEFAULT_COMISIONES, ...parsear(config?.comisiones_metodo_pago) };
}
export function costosCuotasDesdeConfig(config) {
  return { ...DEFAULT_COSTOS_CUOTAS, ...parsear(config?.costos_cuotas_sin_interes) };
}
export function impuestoCobrosDesdeConfig(config) {
  const n = numeroConfig(config?.impuesto_cobros_pct, DEFAULT_IMPUESTO_COBROS);
  return n >= 0 && n < 20 ? n : DEFAULT_IMPUESTO_COBROS;
}
export function cuotasMaxDesdeConfig(config) {
  const n = Number(config?.cuotas_sin_interes_max);
  return CUOTAS_POSIBLES.includes(n) ? n : DEFAULT_CUOTAS_MAX;
}
export function opcionesCuotas(config) {
  const max = cuotasMaxDesdeConfig(config);
  return CUOTAS_POSIBLES.filter((n) => n <= max);
}
export function porcentajesDesdeConfig(config) {
  const g = parsear(config?.porcentajes_pago);
  return {
    publico: { ...DEFAULT_PORCENTAJES.publico, ...(g.publico || {}) },
    tecnico: { ...DEFAULT_PORCENTAJES.tecnico, ...(g.tecnico || {}) },
  };
}
export function porcentajesCuotasDesdeConfig(config) {
  return { ...DEFAULT_PORCENTAJES_CUOTAS, ...parsear(config?.porcentajes_cuotas) };
}

// Fraccion de lo cobrado que se descuenta (comision + IVA + impuesto).
function costoCobro(config, metodo, cuotas = 1) {
  let com = Number(comisionesDesdeConfig(config)[metodo] || 0);
  if (esMetodoCredito(metodo) && Number(cuotas) > 1) com += Number(costosCuotasDesdeConfig(config)[cuotas] || 0);
  const imp = METODOS_SIN_IMPUESTO.has(metodo) ? 0 : impuestoCobrosDesdeConfig(config);
  return (com * IVA_COMISION + imp) / 100;
}

export function recargoListaSugerido(config) {
  const c = costoCobro(config, 'tarjeta_debito');
  return Math.round((1 / (1 - c) - 1) * 10000) / 100;
}
export function recargoListaPct(config) {
  return numeroConfig(config?.recargo_lista_pct, recargoListaSugerido(config));
}

// % minimo sobre la lista para que te quede limpio el precio cargado.
export function minimoSobreLista(config, metodo, cuotas = 1) {
  const bruto = 1 / (1 - costoCobro(config, metodo, cuotas));
  const lista = 1 + recargoListaPct(config) / 100;
  return Math.round((bruto / lista - 1) * 10000) / 100 || 0;
}

export function porcentajeSobreLista(config, metodo, esTecnico, cuotas = 1) {
  if (esMetodoCredito(metodo) && Number(cuotas) > 1) return Number(porcentajesCuotasDesdeConfig(config)[cuotas] ?? 0);
  return Number(porcentajesDesdeConfig(config)[esTecnico ? 'tecnico' : 'publico'][metodo] ?? 0);
}

function redondear(valor, unidad) {
  return Math.round(valor / unidad) * unidad;
}

// Total de la venta a partir del subtotal (a precio de lista).
export function calcularTotalVenta({ subtotal, metodo, esTecnico, config, cuotas = 1 }) {
  const ajustePct = porcentajeSobreLista(config, metodo, esTecnico, cuotas);
  const bruto = subtotal * (1 + ajustePct / 100);
  const total = metodo === 'efectivo'
    ? redondear(bruto, Number(config?.redondeo_unidad || 10))
    : Math.round(bruto * 100) / 100;
  return { ajustePct, montoAjuste: total - subtotal, total };
}

export function formatoPct(n) {
  const v = Math.round(Number(n || 0) * 100) / 100 || 0;
  return `${v > 0 ? '+' : ''}${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
}
