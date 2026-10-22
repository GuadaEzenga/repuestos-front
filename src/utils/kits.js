// Rearma las líneas del carrito a partir de los items guardados de un
// presupuesto/venta: los productos que eran parte de un kit (grupo_clave)
// vuelven a ser UNA línea de kit, así se siguen viendo y facturando juntos.
export function lineasCarritoDesdeItems(items, productosPorId = {}) {
  const lineas = [];
  const kits = new Map();
  for (const it of items) {
    const precio = productosPorId[it.producto_id]?.precio_lista ?? productosPorId[it.producto_id]?.precio ?? Number(it.precio_original ?? it.precio_unitario);
    if (it.grupo_clave) {
      let kit = kits.get(it.grupo_clave);
      const cantKits = Number(it.grupo_cantidad) || 1;
      if (!kit) {
        kit = {
          kind: 'grupo',
          id: it.grupo_id,
          descripcion: it.grupo_nombre || 'KIT',
          cantidad: cantKits,
          precioEstimado: 0,
          descuentoPct: Number(it.ajuste_pct) || 0,
          componentes: [],
          modificado: true, // se manda producto por producto, con estas cantidades
        };
        kits.set(it.grupo_clave, kit);
        lineas.push(kit);
      }
      const cantidadPorGrupo = Number(it.cantidad) / cantKits;
      kit.componentes.push({ producto_id: it.producto_id, descripcion: it.descripcion, cantidadPorGrupo, precioEstimado: precio });
      kit.precioEstimado += precio * cantidadPorGrupo;
      continue;
    }
    lineas.push({
      kind: 'producto',
      id: it.producto_id,
      codigo: productosPorId[it.producto_id]?.codigo || '',
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      precioEstimado: precio,
      descuentoPct: Number(it.ajuste_pct) || 0,
    });
  }
  return lineas;
}
