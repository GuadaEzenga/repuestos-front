// Mismo calculo que backend/src/utils/ofertas.js (ver comentarios ahi).
// Oferta = precio fijo en una o mas formas de pago; en el resto se parte de
// la oferta y se aplica el % normal de cada metodo.
import { METODOS_PAGO, esMetodoCredito, porcentajeSobreLista } from './pagos';

const ORDEN = METODOS_PAGO.map((m) => m.clave);

export function hoyArgentina() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Cordoba' });
}

export function metodosOferta(producto) {
  let lista = producto?.oferta_metodos;
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista); } catch { lista = []; }
  }
  if (!Array.isArray(lista)) return [];
  return ORDEN.filter((clave) => lista.includes(clave));
}

export function ofertaVigente(producto, hoy = hoyArgentina()) {
  const precio = Number(producto?.oferta_precio);
  if (!(precio > 0)) return null;
  const metodos = metodosOferta(producto);
  if (metodos.length === 0) return null;
  const hasta = producto.oferta_hasta ? String(producto.oferta_hasta).slice(0, 10) : null;
  if (hasta && hasta < hoy) return null;
  return { precio, metodos, hasta };
}

function redondear4(n) {
  return Math.round(n * 10000) / 10000;
}

export function precioListaOferta(producto, config, { metodo, esTecnico = false, cuotas = 1 } = {}) {
  const oferta = ofertaVigente(producto);
  if (!oferta) return null;
  const enCuotas = esMetodoCredito(metodo) && Number(cuotas) > 1;
  if (metodo && oferta.metodos.includes(metodo) && !enCuotas) {
    const pct = porcentajeSobreLista(config, metodo, esTecnico, 1);
    return redondear4(oferta.precio / (1 + pct / 100));
  }
  const pctRef = porcentajeSobreLista(config, oferta.metodos[0], false, 1);
  return redondear4(oferta.precio / (1 + pctRef / 100));
}

// Precio de lista a usar para un producto en el carrito: el de oferta si
// tiene una vigente, si no el precio de lista normal.
export function precioListaProducto(producto, config, contexto) {
  if (!producto) return null;
  const oferta = config ? precioListaOferta(producto, config, contexto) : null;
  if (oferta != null) return oferta;
  return producto.precio_lista ?? producto.precio ?? null;
}

// Texto corto para mostrar la oferta: "$1.500 en Efectivo y Transferencia (hasta 31/10)"
export function textoOferta(producto, labelMetodo, formatoMoneda) {
  const oferta = ofertaVigente(producto);
  if (!oferta) return null;
  const nombres = oferta.metodos.map((m) => labelMetodo(m));
  const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0];
  const hasta = oferta.hasta ? ` (hasta ${oferta.hasta.split('-').reverse().join('/')})` : '';
  return `${formatoMoneda(oferta.precio)} en ${lista}${hasta}`;
}
