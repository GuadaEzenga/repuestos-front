// Formas de pago y calculo del total -- MISMA logica que el backend
// (backend/src/utils/pagos.js y carrito.js). Si se cambia una, cambiar la otra.
//
// 1) Ajuste comercial: tablas ajustes_metodo_pago (publico) y
//    ajustes_metodo_pago_tecnico (cliente de la agenda). Se usa una u otra.
// 2) Comision de Mercado Pago (Point / QR): % SIN IVA, como lo muestra MP en
//    "Costos y cuotas". Se le suma el IVA (21%) y se traslada al cliente con
//    total = base / (1 - comision), para que al negocio le quede limpio.

export const IVA_COMISION = 1.21;

export const METODOS_PAGO = [
  { clave: 'efectivo', label: 'Efectivo' },
  { clave: 'transferencia', label: 'Transferencia' },
  { clave: 'tarjeta_debito', label: 'Point - Débito', grupo: 'Point' },
  { clave: 'tarjeta_credito', label: 'Point - Crédito', grupo: 'Point', credito: true },
  { clave: 'tarjeta_prepaga', label: 'Point - Prepaga', grupo: 'Point' },
  { clave: 'qr_dinero_mp', label: 'QR - Dinero en Mercado Pago', grupo: 'QR' },
  { clave: 'qr_debito', label: 'QR - Débito', grupo: 'QR' },
  { clave: 'qr_credito', label: 'QR - Crédito', grupo: 'QR', credito: true },
  { clave: 'qr_prepaga', label: 'QR - Prepaga', grupo: 'QR' },
];

// Con los plazos de acreditacion elegidos en MP (ver backend/utils/pagos.js).
export const DEFAULT_COMISIONES = {
  tarjeta_debito: 2.88,
  tarjeta_credito: 4.4,
  tarjeta_prepaga: 3.68,
  qr_dinero_mp: 0.8,
  qr_debito: 0.89,
  qr_credito: 4.4,
  qr_prepaga: 3.93,
};

// Costo de ofrecer cuotas SIN interes (se suma a la comision de credito).
export const DEFAULT_COSTOS_CUOTAS = { 2: 7.79, 3: 10.49, 6: 18.69, 9: 26.49, 12: 32.29, 18: 41.59 };
export const CUOTAS_POSIBLES = [1, 2, 3, 6, 9, 12, 18];
export const DEFAULT_CUOTAS_MAX = 3;

// Impuesto sobre los creditos y debitos (0,6%), se traslada solo en cobros
// con Point y QR. Ver backend/utils/pagos.js.
export const DEFAULT_IMPUESTO_COBROS = 0.6;

// Efectivo y transferencias (a la cuenta de MP) no pagan este impuesto.
export function metodoPagaImpuesto(metodo) {
  return metodo !== 'efectivo' && metodo !== 'transferencia';
}

export function impuestoCobrosDesdeConfig(config) {
  const v = config?.impuesto_cobros_pct;
  if (v == null || String(v).trim() === '') return DEFAULT_IMPUESTO_COBROS;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 20 ? n : DEFAULT_IMPUESTO_COBROS;
}

export function cuotasMaxDesdeConfig(config) {
  const n = Number(config?.cuotas_sin_interes_max);
  return CUOTAS_POSIBLES.includes(n) ? n : DEFAULT_CUOTAS_MAX;
}

// Opciones de cuotas que se ofrecen (1 pago + hasta el maximo configurado).
export function opcionesCuotas(config) {
  const max = cuotasMaxDesdeConfig(config);
  return CUOTAS_POSIBLES.filter((n) => n <= max);
}

export const DEFAULT_AJUSTES_TECNICO = '{"efectivo": -10, "transferencia": -5}';

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

function parsear(json, porDefecto) {
  if (json == null || json === '') return typeof porDefecto === 'string' ? JSON.parse(porDefecto) : { ...porDefecto };
  try { return JSON.parse(json); } catch { return {}; }
}

export function tablasDesdeConfig(config) {
  return {
    publico: parsear(config?.ajustes_metodo_pago, '{}'),
    tecnico: parsear(config?.ajustes_metodo_pago_tecnico, DEFAULT_AJUSTES_TECNICO),
    comisiones: parsear(config?.comisiones_metodo_pago, DEFAULT_COMISIONES),
    costosCuotas: parsear(config?.costos_cuotas_sin_interes, DEFAULT_COSTOS_CUOTAS),
  };
}

function redondear(valor, unidad) {
  return Math.round(valor / unidad) * unidad;
}

// Devuelve el detalle completo para mostrar en el resumen de la venta.
export function calcularTotalVenta({ subtotal, metodo, esTecnico, config, cuotas = 1 }) {
  const { publico, tecnico, comisiones, costosCuotas } = tablasDesdeConfig(config);
  const ajustePct = Number((esTecnico ? tecnico : publico)[metodo] || 0);
  const costoCuotasPct = esMetodoCredito(metodo) && Number(cuotas) > 1 ? Number(costosCuotas[cuotas] || 0) : 0;
  const comisionPct = Number(comisiones[metodo] || 0) + costoCuotasPct;
  const impuestoPct = metodoPagaImpuesto(metodo) ? impuestoCobrosDesdeConfig(config) : 0;
  // Redondeo del total solo en efectivo; el resto queda exacto al centavo.
  const unidad = metodo === 'efectivo' ? Number(config?.redondeo_unidad || 10) : 0.01;
  const conAjuste = subtotal * (1 + ajustePct / 100);
  const efectiva = (comisionPct * IVA_COMISION) / 100 + impuestoPct / 100;
  const bruto = conAjuste / (1 - (efectiva < 1 ? efectiva : 0));
  // Con recargo se redondea para arriba (igual que el backend).
  const total = efectiva > 0
    ? Math.round(Math.ceil(Math.round(bruto * 10000) / 10000 / unidad) * unidad * 100) / 100
    : Math.round(redondear(bruto, unidad) * 100) / 100;
  // Sin recargo, el redondeo va dentro del descuento/ajuste (nunca se
  // muestra aparte).
  const montoAjuste = efectiva > 0 ? conAjuste - subtotal : total - subtotal;
  return {
    ajustePct,
    montoAjuste,
    comisionPct,
    costoCuotasPct,
    impuestoPct,
    // % total que se descuenta del cobro (MP + IVA + impuesto a los creditos)
    comisionConIvaPct: Math.round((comisionPct * IVA_COMISION + impuestoPct) * 100) / 100,
    recargoComision: total - conAjuste,
    total,
  };
}

// Texto corto del recargo para el resumen de la venta, ej.
// "MP 4,4% + IVA + imp. créditos 0,6% = 5,92%".
export function detalleRecargo({ comisionPct, impuestoPct, comisionConIvaPct }) {
  const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  const partes = [];
  if (comisionPct > 0) partes.push(`MP ${fmt(comisionPct)}% + IVA`);
  if (impuestoPct > 0) partes.push(`imp. créditos ${fmt(impuestoPct)}%`);
  return partes.length > 1 || comisionPct > 0 ? `${partes.join(' + ')} = ${fmt(comisionConIvaPct)}%` : partes.join('');
}
