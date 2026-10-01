import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import { coincideTexto } from '../utils/busqueda';
import { parseNumero } from '../utils/numero';
import { useUi } from '../context/UiContext';

const METODOS_DEFAULT = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito'];
const TIPOS_DOC = ['DNI', 'CUIT', 'CUIL'];
const CONDICIONES_FISCALES = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

// Evita mostrar cosas como 0.30000000000000004 por errores de redondeo de
// coma flotante al multiplicar cantidades.
function redondearCantidad(valor) {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}

// La cantidad de una línea del carrito puede ser momentáneamente un texto
// a medio escribir (ej. "2," mientras se tipea "2,5"), así que para
// cualquier cuenta (subtotales, +1, envío al backend) se interpreta con
// esto en vez de asumir que ya es un número.
function cantidadNum(l) {
  return parseNumero(l.cantidad) ?? 0;
}

export default function NuevaVenta() {
  const { toast } = useUi();
  const buscadorRef = useRef(null);
  const [productos, setProductos] = useState([]);
  const [productosPorId, setProductosPorId] = useState({});
  const [grupos, setGrupos] = useState([]);
  const [config, setConfig] = useState(null);
  const [clientesTodos, setClientesTodos] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);

  const [busqueda, setBusqueda] = useState('');
  const [buscadorEnfocado, setBuscadorEnfocado] = useState(false);
  const [clienteBuscadorEnfocado, setClienteBuscadorEnfocado] = useState(false);
  const [presupuestoCargado, setPresupuestoCargado] = useState(null); // numero del presupuesto que se cargo al carrito, si vino de ahi
  // Lineas del carrito: producto suelto {kind:'producto', id, codigo, descripcion, cantidad, precioEstimado, descuentoPct}
  // o grupo/kit como UNA sola linea escalable {kind:'grupo', id, descripcion, cantidad, precioEstimado, descuentoPct, componentes:[{producto_id,descripcion,cantidadPorGrupo,precioEstimado}]}
  const [carrito, setCarrito] = useState([]);
  const [expandido, setExpandido] = useState({}); // { [idx]: true } -- ver los productos dentro de un grupo
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState(new Set()); // idx seleccionados para aplicar descuento en lote
  const [descuentoLote, setDescuentoLote] = useState('');
  // Texto a medio escribir de la cantidad de un producto dentro de un kit
  // (mismo motivo que con la cantidad del carrito: mientras se tipea "2,5"
  // no se puede ir convirtiendo a numero en cada letra, si no la coma
  // desaparece). Clave: `${idxLinea}-${producto_id}`.
  const [textoComponente, setTextoComponente] = useState({});

  // Seleccion multiple en los resultados de busqueda, para agregar varios
  // productos/kits al carrito de una sola vez.
  const [seleccionBusqueda, setSeleccionBusqueda] = useState(new Set()); // claves `${kind}-${id}`

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [guardandoClienteRapido, setGuardandoClienteRapido] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', apellido: '', telefono: '', documento: '', tipo_documento: 'DNI' });

  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [notas, setNotas] = useState('');
  const [totalManual, setTotalManual] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorVenta, setErrorVenta] = useState(null);
  const [ventaCreada, setVentaCreada] = useState(null);

  const [facturando, setFacturando] = useState(false);
  const [mostrarFacturar, setMostrarFacturar] = useState(false);
  const [datosFactura, setDatosFactura] = useState({ tipo_documento: 'DNI', documento: '', condicion_fiscal: 'Consumidor Final' });
  const [resultadoFactura, setResultadoFactura] = useState(null);
  const [errorFactura, setErrorFactura] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);

  useEffect(() => {
    api.get('/productos', { pageSize: 2000 }).then((data) => {
      const ordenados = [...data.productos].sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || '', 'es', { sensitivity: 'base' }));
      setProductos(ordenados);
      const mapa = {};
      for (const p of ordenados) mapa[p.id] = p;
      setProductosPorId(mapa);
    });
    api.get('/grupos').then((data) => setGrupos([...data.grupos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))));
    api.get('/config').then((data) => setConfig(data));
    api.get('/clientes', { pageSize: 2000 }).then((data) => {
      const ordenados = [...data.clientes].sort((a, b) => `${a.nombre || ''} ${a.apellido || ''}`.localeCompare(`${b.nombre || ''} ${b.apellido || ''}`, 'es', { sensitivity: 'base' }));
      setClientesTodos(ordenados);
    });
    api.get('/presupuestos', { pageSize: 200 }).then((data) => setPresupuestos(data.presupuestos));
    buscadorRef.current?.focus();
  }, []);

  // Evita que un click adentro del listado de resultados (checkbox, item,
  // botón de agregar seleccionados) le sague el foco al buscador -- eso es
  // lo que hacía que la tabla se cierre y se vuelva a abrir sola, o que el
  // click en un producto no cargue nada (el <ul> se desmontaba a mitad del
  // click). Al frenar el mousedown, el input nunca pierde el foco mientras
  // se interactúa con SUS PROPIOS resultados, y el onBlur solo actúa cuando
  // se hace click realmente afuera.
  function evitarPerderFoco(e) {
    e.preventDefault();
  }

  // Si nunca se guardó la tabla de ajustes de técnico desde Configuración
  // (clave ausente o vacía), no hay que aplicar 0% en silencio -- mismo
  // default que el backend (ver carrito.js) hasta que ella lo cambie a mano.
  const DEFAULT_AJUSTES_TECNICO = '{"efectivo": -10, "transferencia": -5}';

  function parsearTabla(json, defaultJson = '{}') {
    try { return JSON.parse(json || defaultJson); } catch { return {}; }
  }

  // Tabla publica (sin cliente seleccionado) vs tabla tecnico (hay cliente
  // seleccionado) -- se usa UNA u otra, no se suman. Misma logica que
  // carrito.js en el backend.
  const ajustesPublico = useMemo(() => parsearTabla(config?.ajustes_metodo_pago), [config]);
  const ajustesTecnico = useMemo(() => parsearTabla(config?.ajustes_metodo_pago_tecnico, DEFAULT_AJUSTES_TECNICO), [config]);
  // Todos los clientes de la agenda son tecnicos -- si hay uno seleccionado,
  // se usa la tabla de descuentos tecnico; si no (venta de mostrador), la
  // publica. Misma logica que el backend (ver carrito.js).
  const esTecnico = !!clienteSeleccionado;
  const tablaVigente = esTecnico ? ajustesTecnico : ajustesPublico;

  // Antes esto unia las claves de METODOS_DEFAULT con las claves sueltas de
  // la config de ajustes por metodo de pago (texto libre en Configuracion).
  // Si ahi se escribia "debito" en vez de "tarjeta_debito" aparecia como un
  // metodo de pago repetido y ademas invalido (el backend no lo reconoce).
  // El dropdown debe mostrar siempre los 4 metodos validos, nada mas.
  const metodosPago = METODOS_DEFAULT;

  // Igual que el programa original: apenas se hace click en el buscador (sin
  // escribir nada todavía) ya se muestran productos, y a medida que se
  // escribe busca por palabras sueltas, en cualquier orden, sin importar
  // mayúsculas/minúsculas ni tildes (ver utils/busqueda.js).
  const resultadosBusqueda = useMemo(() => {
    if (!buscadorEnfocado) return [];
    const hayQuery = busqueda.trim() !== '';
    const prods = productos
      .filter((p) => !hayQuery || coincideTexto(`${p.codigo || ''} ${p.descripcion || ''}`, busqueda))
      .slice(0, hayQuery ? 8 : 20)
      .map((p) => ({ kind: 'producto', id: p.id, codigo: p.codigo, descripcion: p.descripcion, precio: p.precio, stock: p.stock }));
    const grps = grupos
      .filter((g) => !hayQuery || coincideTexto(g.nombre, busqueda))
      .slice(0, hayQuery ? 4 : 6)
      .map((g) => ({ kind: 'grupo', id: g.id, descripcion: g.nombre, cantidad_productos: g.cantidad_productos }));
    return [...grps, ...prods];
  }, [busqueda, buscadorEnfocado, productos, grupos]);

  async function agregarAlCarrito(item) {
    if (item.kind === 'producto') {
      setCarrito((prev) => {
        const existente = prev.find((l) => l.kind === 'producto' && l.id === item.id);
        if (existente) {
          return prev.map((l) => (l === existente ? { ...l, cantidad: cantidadNum(l) + 1 } : l));
        }
        return [...prev, { kind: 'producto', id: item.id, codigo: item.codigo, descripcion: item.descripcion, cantidad: 1, precioEstimado: item.precio, descuentoPct: 0 }];
      });
    } else {
      // Grupo/kit: UNA sola linea escalable. "cantidad" es cuantos grupos
      // completos se llevan -- si ya esta en el carrito, suma 1 grupo mas.
      const yaEstaba = carrito.some((l) => l.kind === 'grupo' && l.id === item.id);
      if (yaEstaba) {
        setCarrito((prev) => prev.map((l) => (l.kind === 'grupo' && l.id === item.id ? { ...l, cantidad: cantidadNum(l) + 1 } : l)));
        return;
      }

      const detalle = await api.get(`/grupos/${item.id}`);
      const componentes = detalle.items.map((comp) => ({
        producto_id: comp.producto_id,
        descripcion: comp.descripcion,
        cantidadPorGrupo: Number(comp.cantidad),
        precioEstimado: productosPorId[comp.producto_id]?.precio || 0,
      }));
      const precioPorGrupo = componentes.reduce((acc, c) => acc + c.precioEstimado * c.cantidadPorGrupo, 0);
      setCarrito((prev) => [...prev, { kind: 'grupo', id: item.id, descripcion: item.descripcion, cantidad: 1, precioEstimado: precioPorGrupo, descuentoPct: 0, componentes, modificado: false }]);
    }
  }

  // El campo de cantidad de cada producto del kit muestra y edita el TOTAL
  // para esta venta (cantidadPorGrupo × cantidad de kits de la línea), no la
  // receta "por kit" -- así, si arriba subís la cantidad de kits (ej. de 1 a
  // 2), cada producto adentro se duplica solo. Si en cambio se edita este
  // campo a mano, se recalcula la receta por kit (total ÷ cantidad de kits)
  // para que siga escalando bien si después se vuelve a cambiar la cantidad
  // de kits. A partir de ahí el kit queda "modificado" y se manda a vender
  // como productos sueltos (no como grupo_id), para respetar la modificacion.
  function claveComponente(idxLinea, producto_id) {
    return `${idxLinea}-${producto_id}`;
  }

  // Deja el texto tal cual mientras se tipea (sin convertir a número en cada
  // letra) -- recien al salir del campo o al usar las flechitas se aplica
  // de verdad, con commitCantidadComponente.
  function cambiarCantidadComponente(idxLinea, producto_id, texto) {
    const limpio = texto.replace(/[^0-9.,]/g, '');
    setTextoComponente((prev) => ({ ...prev, [claveComponente(idxLinea, producto_id)]: limpio }));
  }

  function commitCantidadComponente(idxLinea, producto_id, totalDeseado) {
    setCarrito((prev) => prev.map((l, i) => {
      if (i !== idxLinea || l.kind !== 'grupo') return l;
      const cantidadKits = Math.max(0.01, cantidadNum(l) || 1);
      const componentes = l.componentes.map((c) => {
        if (c.producto_id !== producto_id) return c;
        return { ...c, cantidadPorGrupo: Math.max(0.01, totalDeseado) / cantidadKits };
      });
      const precioEstimado = componentes.reduce((acc, c) => acc + c.precioEstimado * c.cantidadPorGrupo, 0);
      return { ...l, componentes, precioEstimado, modificado: true };
    }));
    setTextoComponente((prev) => {
      const { [claveComponente(idxLinea, producto_id)]: _omitida, ...resto } = prev;
      return resto;
    });
  }

  // Confirma lo que haya quedado tipeado (onBlur del campo de texto).
  function confirmarCantidadComponente(idxLinea, producto_id, totalActual) {
    const clave = claveComponente(idxLinea, producto_id);
    const texto = textoComponente[clave];
    const totalDeseado = texto !== undefined ? (parseNumero(texto) ?? totalActual) : totalActual;
    commitCantidadComponente(idxLinea, producto_id, totalDeseado);
  }

  // Para las flechitas +/-: suman o restan 1 al total ya mostrado (tenga en
  // cuenta lo que se esté tipeando, si hay algo a medio escribir).
  function ajustarCantidadComponente(idxLinea, producto_id, totalActual, delta) {
    commitCantidadComponente(idxLinea, producto_id, totalActual + delta);
  }

  // Saca un producto del kit para esta venta puntual (ej. el cliente no
  // quiere uno de los productos del kit).
  function quitarComponenteDeKit(idxLinea, producto_id) {
    setCarrito((prev) => prev.map((l, i) => {
      if (i !== idxLinea || l.kind !== 'grupo') return l;
      const componentes = l.componentes.filter((c) => c.producto_id !== producto_id);
      const precioEstimado = componentes.reduce((acc, c) => acc + c.precioEstimado * c.cantidadPorGrupo, 0);
      return { ...l, componentes, precioEstimado, modificado: true };
    }));
  }

  // Trae los productos de un presupuesto ya hecho al carrito de la venta, en
  // vez de tener que buscarlos y cargarlos de nuevo uno por uno. Se puede
  // seguir editando (agregar, sacar, cambiar cantidad) antes de confirmar --
  // el precio se recalcula con la configuración actual, como cualquier venta.
  async function cargarDesdePresupuesto(presupuestoId) {
    const detalle = await api.get(`/presupuestos/${presupuestoId}`);
    const lineasNuevas = detalle.items.map((it) => ({
      kind: 'producto',
      id: it.producto_id,
      codigo: productosPorId[it.producto_id]?.codigo || '',
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      precioEstimado: productosPorId[it.producto_id]?.precio ?? Number(it.precio_unitario),
      descuentoPct: Number(it.ajuste_pct) || 0,
    }));
    setCarrito((prev) => [...prev, ...lineasNuevas]);
    setPresupuestoCargado(detalle.numero);
    if (detalle.cliente_id) {
      const cliente = clientesTodos.find((c) => String(c.id) === String(detalle.cliente_id));
      if (cliente) setClienteSeleccionado(cliente);
    }
  }

  async function agregarUnItem(item) {
    setBusqueda('');
    await agregarAlCarrito(item);
  }

  // Enter en el buscador agrega el primer resultado sin soltar el teclado --
  // en el mostrador esto se usa todo el tiempo, vender sin tocar el mouse.
  function manejarKeyDownBuscador(e) {
    if (e.key === 'Enter' && resultadosBusqueda.length > 0) {
      e.preventDefault();
      agregarUnItem(resultadosBusqueda[0]);
    }
  }

  // Ctrl/Cmd+Enter en cualquier parte de la pantalla confirma la venta.
  function manejarKeyDownVenta(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (carrito.length > 0 && !guardando) confirmarVenta();
    }
  }

  function toggleSeleccionBusqueda(item) {
    const clave = `${item.kind}-${item.id}`;
    setSeleccionBusqueda((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(clave)) nuevo.delete(clave); else nuevo.add(clave);
      return nuevo;
    });
  }

  // Agrega todos los productos/kits marcados con el checkbox de una sola vez.
  async function agregarSeleccionadosBusqueda() {
    const items = resultadosBusqueda.filter((r) => seleccionBusqueda.has(`${r.kind}-${r.id}`));
    for (const item of items) {
      await agregarAlCarrito(item);
    }
    setSeleccionBusqueda(new Set());
    setBusqueda('');
  }

  // Mientras se escribe, se guarda el texto tal cual (sin forzarlo a número
  // en cada letra) -- si no, en cuanto se tipeaba la "," de "2,5" el valor
  // se convertía de inmediato en "2" y la coma desaparecía, haciendo
  // imposible cargar un decimal. Recién al salir del campo (onBlur) se
  // normaliza a un número válido.
  function actualizarCantidad(idx, texto) {
    const limpio = texto.replace(/[^0-9.,]/g, '');
    setCarrito((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad: limpio } : l)));
  }

  function confirmarCantidad(idx) {
    setCarrito((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad: Math.max(0.01, parseNumero(l.cantidad) ?? 1) } : l)));
  }

  function quitarLinea(idx) {
    setCarrito((prev) => prev.filter((_, i) => i !== idx));
    setLineasSeleccionadas((prev) => {
      const nuevo = new Set();
      for (const i of prev) {
        if (i < idx) nuevo.add(i);
        else if (i > idx) nuevo.add(i - 1);
      }
      return nuevo;
    });
  }

  function toggleExpandido(idx) {
    setExpandido((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function toggleLineaSeleccionada(idx) {
    setLineasSeleccionadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(idx)) nuevo.delete(idx); else nuevo.add(idx);
      return nuevo;
    });
  }

  // Aplica el mismo % de descuento a todas las lineas marcadas de una vez
  // (ej. "10% a estos 3 productos"). El backend ya soporta descuento_pct por
  // linea (carrito.js), esto solo lo setea en varias lineas juntas.
  function aplicarDescuentoLote() {
    const pct = parseNumero(descuentoLote);
    if (pct == null || lineasSeleccionadas.size === 0) return;
    setCarrito((prev) => prev.map((l, i) => (lineasSeleccionadas.has(i) ? { ...l, descuentoPct: pct } : l)));
    setLineasSeleccionadas(new Set());
    setDescuentoLote('');
  }

  function actualizarDescuentoLinea(idx, valor) {
    const pct = valor === '' ? 0 : Number(valor);
    setCarrito((prev) => prev.map((l, i) => (i === idx ? { ...l, descuentoPct: Number.isNaN(pct) ? 0 : pct } : l)));
  }

  const subtotalEstimado = carrito.reduce((acc, l) => acc + l.precioEstimado * cantidadNum(l) * (1 - (Number(l.descuentoPct) || 0) / 100), 0);

  function redondear(valor, unidad) {
    return Math.round(valor / unidad) * unidad;
  }

  const unidadRedondeo = Number(config?.redondeo_unidad || 10);
  const ajustePct = Number(tablaVigente[metodoPago] || 0);
  const montoAjuste = subtotalEstimado * (ajustePct / 100);
  const totalEstimado = redondear(subtotalEstimado + montoAjuste, unidadRedondeo);
  // Total que realmente se va a cobrar: el manual si se cargó, sino el estimado.
  const totalAcobrar = parseNumero(totalManual) ?? totalEstimado;
  // Vuelto en vivo: se recalcula en cada tecla mientras se escribe el monto
  // recibido, para que se vea de inmediato (no recién al confirmar la venta).
  const montoRecibidoNum = parseNumero(montoRecibido);
  const vueltoEnVivo = montoRecibidoNum != null ? montoRecibidoNum - totalAcobrar : null;

  // Busqueda de clientes instantanea y local (misma logica que productos):
  // apenas se hace foco en el campo se muestran clientes, y escribiendo se
  // busca por palabras sueltas en cualquier orden.
  function buscarClientes(texto) {
    setBusquedaCliente(texto);
  }

  const resultadosCliente = useMemo(() => {
    if (!clienteBuscadorEnfocado) return [];
    const hayQuery = busquedaCliente.trim() !== '';
    return clientesTodos
      .filter((c) => !hayQuery || coincideTexto(`${c.nombre || ''} ${c.apellido || ''} ${c.documento || ''} ${c.nombre_negocio || ''}`, busquedaCliente))
      .slice(0, hayQuery ? 8 : 20);
  }, [busquedaCliente, clienteBuscadorEnfocado, clientesTodos]);

  async function crearClienteAlVuelo() {
    if (!nuevoCliente.nombre.trim()) return;
    setGuardandoClienteRapido(true);
    try {
      const cliente = await api.post('/clientes', nuevoCliente);
      setClientesTodos((prev) => [cliente, ...prev]);
      setClienteSeleccionado(cliente);
      setMostrarNuevoCliente(false);
      setBusquedaCliente('');
      setClienteBuscadorEnfocado(false);
      setNuevoCliente({ nombre: '', apellido: '', telefono: '', documento: '', tipo_documento: 'DNI' });
      toast('Cliente creado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setGuardandoClienteRapido(false);
    }
  }

  function itemsParaEnviar() {
    return carrito.flatMap((l) => {
      if (l.kind === 'grupo') {
        // Si el kit no se tocó, se manda como grupo_id (igual que siempre).
        // Si se modificó (se sacó o cambió la cantidad de algún producto), se
        // manda cada producto suelto con la cantidad ya ajustada para esta venta.
        if (!l.modificado) {
          return [{ grupo_id: l.id, cantidad: cantidadNum(l), descuento_pct: Number(l.descuentoPct) || 0 }];
        }
        return l.componentes.map((c) => ({
          producto_id: c.producto_id,
          cantidad: c.cantidadPorGrupo * cantidadNum(l),
          descuento_pct: Number(l.descuentoPct) || 0,
        }));
      }
      return [{ producto_id: l.id, cantidad: cantidadNum(l), descuento_pct: Number(l.descuentoPct) || 0 }];
    });
  }

  async function confirmarVenta() {
    if (carrito.length === 0) return;
    setGuardando(true);
    setErrorVenta(null);
    try {
      const body = {
        cliente_id: clienteSeleccionado?.id || null,
        items: itemsParaEnviar(),
        metodo_pago: metodoPago,
        notas: notas || null,
        monto_recibido: metodoPago === 'efectivo' && montoRecibido ? parseNumero(montoRecibido) : null,
        total_manual: parseNumero(totalManual),
      };
      const venta = await api.post('/ventas', body);
      setVentaCreada(venta);
    } catch (err) {
      setErrorVenta(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function nuevaVentaLimpia() {
    setCarrito([]);
    setExpandido({});
    setLineasSeleccionadas(new Set());
    setDescuentoLote('');
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setMetodoPago('efectivo');
    setMontoRecibido('');
    setNotas('');
    setTotalManual('');
    setVentaCreada(null);
    setErrorVenta(null);
    setMostrarFacturar(false);
    setResultadoFactura(null);
    setErrorFactura(null);
    setTimeout(() => buscadorRef.current?.focus(), 50);
  }

  async function descargarComprobante() {
    const blob = await api.get(`/ventas/${ventaCreada.id}/comprobante`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobante-venta-${ventaCreada.id}.pdf`;
    // Safari no dispara la descarga si el link no esta en el DOM.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function abrirFacturar() {
    setDatosFactura({
      tipo_documento: clienteSeleccionado?.tipo_documento || 'DNI',
      documento: clienteSeleccionado?.documento || '',
      condicion_fiscal: clienteSeleccionado?.condicion_fiscal || 'Consumidor Final',
    });
    setMostrarFacturar(true);
  }

  async function emitirFactura() {
    setFacturando(true);
    setErrorFactura(null);
    try {
      const resultado = await api.post(`/ventas/${ventaCreada.id}/facturar`, {
        ...datosFactura,
        confirmar: true,
      });
      setResultadoFactura(resultado);
    } catch (err) {
      setErrorFactura(err.message);
    } finally {
      setFacturando(false);
    }
  }

  // El mismo endpoint /comprobante devuelve la factura con CAE una vez que
  // la venta ya tiene afip_cae (ver backend/utils/comprobante.js), asi que
  // alcanza con volver a pedirlo cuando cambia resultadoFactura para que el
  // visor pase de "comprobante interno" a "factura" sin tocar nada mas.
  useEffect(() => {
    if (!ventaCreada) { setPdfUrl(null); return; }
    let urlActual = null;
    let cancelado = false;
    setCargandoPdf(true);
    (async () => {
      try {
        const blob = await api.get(`/ventas/${ventaCreada.id}/comprobante`);
        if (cancelado) return;
        urlActual = URL.createObjectURL(blob);
        setPdfUrl(urlActual);
      } finally {
        if (!cancelado) setCargandoPdf(false);
      }
    })();
    return () => {
      cancelado = true;
      if (urlActual) URL.revokeObjectURL(urlActual);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaCreada, resultadoFactura]);

  // --- Pantalla de resultado despues de crear la venta ---
  if (ventaCreada) {
    return (
      <div className="page">
        <div className="comprobante-pantalla">
          <h1 style={{ textAlign: 'center' }}>
            {resultadoFactura ? `Factura emitida — Venta #${ventaCreada.numero}` : `Venta #${ventaCreada.numero} registrada`}
          </h1>

          <div className="comprobante-visor panel">
            {cargandoPdf && <p className="muted">Generando comprobante...</p>}
            {!cargandoPdf && pdfUrl && (
              <iframe title="Comprobante" src={pdfUrl} className="comprobante-iframe" />
            )}
          </div>

          <div className="comprobante-acciones">
            <button type="button" onClick={descargarComprobante} className="btn-primary">
              {resultadoFactura ? 'Descargar factura PDF' : 'Descargar comprobante'}
            </button>
            {!ventaCreada.afip_cae && !mostrarFacturar && !resultadoFactura && (
              <button type="button" onClick={abrirFacturar} className="btn-secondary">Facturar (AFIP)</button>
            )}
            <button type="button" onClick={nuevaVentaLimpia} className="btn-secondary">Nueva venta</button>
          </div>

          {mostrarFacturar && !resultadoFactura && (
            <div className="factura-box">
              <p className="muted" style={{ marginTop: 0 }}>
                Esto emite una factura real ante AFIP con tu certificado de producción. No se puede deshacer.
              </p>
              <div className="form-row">
                <select value={datosFactura.tipo_documento} onChange={(e) => setDatosFactura((d) => ({ ...d, tipo_documento: e.target.value }))}>
                  {TIPOS_DOC.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  placeholder="Número de documento"
                  value={datosFactura.documento}
                  onChange={(e) => setDatosFactura((d) => ({ ...d, documento: e.target.value }))}
                />
              </div>
              <select
                value={datosFactura.condicion_fiscal}
                onChange={(e) => setDatosFactura((d) => ({ ...d, condicion_fiscal: e.target.value }))}
                style={{ marginTop: 8, width: '100%' }}
              >
                {CONDICIONES_FISCALES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {errorFactura && <p className="login-error">{errorFactura}</p>}
              <button type="button" onClick={emitirFactura} disabled={facturando} className="btn-danger" style={{ marginTop: 10 }}>
                {facturando ? 'Emitiendo...' : 'Confirmar y emitir factura real'}
              </button>
            </div>
          )}

          {resultadoFactura && (
            <div className="factura-box" style={{ textAlign: 'center' }}>
              <p><strong>CAE:</strong> {resultadoFactura.afip_cae}</p>
              <p><strong>Vencimiento CAE:</strong> {resultadoFactura.afip_cae_vencimiento}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Pantalla principal de carga de venta ---
  return (
    <div className="page">
      <h1>Nueva venta</h1>

      <div className="venta-grid" onKeyDown={manejarKeyDownVenta}>
        <div>
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Productos</h2>
              {presupuestos.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && cargarDesdePresupuesto(e.target.value)}
                  style={{ fontSize: 12 }}
                  title="Traer los productos de un presupuesto ya hecho"
                >
                  <option value="">Cargar desde un presupuesto...</option>
                  {presupuestos.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.numero} — {[p.cliente_nombre, p.cliente_apellido].filter(Boolean).join(' ') || 'Sin cliente'} ({String(p.fecha).slice(0, 10)})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {presupuestoCargado && (
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                Se cargaron los productos del presupuesto #{presupuestoCargado}. Podés agregar, sacar o editar lo que necesites antes de confirmar.
              </p>
            )}
            <input
              ref={buscadorRef}
              className="buscador"
              placeholder="Buscar por código o descripción... (Enter agrega el primero, Ctrl+Enter cobra)"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onFocus={() => setBuscadorEnfocado(true)}
              onBlur={() => setTimeout(() => setBuscadorEnfocado(false), 150)}
              onKeyDown={manejarKeyDownBuscador}
            />
            {resultadosBusqueda.length > 0 && (
              <>
                <ul className="resultados-lista" onMouseDown={evitarPerderFoco}>
                  {resultadosBusqueda.map((r) => {
                    const clave = `${r.kind}-${r.id}`;
                    return (
                      <li key={clave} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => agregarUnItem(r)}>
                        <input
                          type="checkbox"
                          checked={seleccionBusqueda.has(clave)}
                          onChange={() => toggleSeleccionBusqueda(r)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span style={{ flex: 1 }}>
                          {r.kind === 'producto' && r.codigo && <span className="muted">#{r.codigo} — </span>}{r.descripcion}
                        </span>
                        {r.kind === 'producto' && <span className="muted">{formatoMoneda(r.precio)} · stock {r.stock}</span>}
                        {r.kind === 'grupo' && <span className="muted">kit — {r.cantidad_productos} productos</span>}
                      </li>
                    );
                  })}
                </ul>
                {seleccionBusqueda.size > 0 && (
                  <button type="button" className="btn-secondary" style={{ marginTop: 6 }} onMouseDown={evitarPerderFoco} onClick={agregarSeleccionadosBusqueda}>
                    + Agregar {seleccionBusqueda.size} seleccionado{seleccionBusqueda.size === 1 ? '' : 's'}
                  </button>
                )}
              </>
            )}

            <table className="simple-table" style={{ marginTop: 16 }}>
              <thead>
                <tr><th /><th>Producto</th><th>Cant.</th><th>Subtotal</th><th /></tr>
              </thead>
              <tbody>
                {carrito.length === 0 && <tr><td colSpan={5} className="muted">Buscá un producto o kit para agregarlo</td></tr>}
                {carrito.map((l, idx) => (
                  <>
                    <tr key={idx}>
                      <td>
                        <input type="checkbox" checked={lineasSeleccionadas.has(idx)} onChange={() => toggleLineaSeleccionada(idx)} />
                      </td>
                      <td>
                        {l.kind === 'producto' && l.codigo && <span className="muted">#{l.codigo} — </span>}
                        {l.descripcion}
                        {l.kind === 'grupo' && (
                          <>
                            {' '}<span className="muted" style={{ fontSize: 11 }}>(kit)</span>{' '}
                            <button type="button" className="btn-link" style={{ padding: 0, fontSize: 11 }} onClick={() => toggleExpandido(idx)}>
                              {expandido[idx] ? 'ocultar productos' : 'ver productos'}
                            </button>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="cantidad-stepper">
                          <button type="button" tabIndex={-1} onClick={() => { actualizarCantidad(idx, String(Math.max(0.01, cantidadNum(l) - 1))); confirmarCantidad(idx); }}>−</button>
                          <input type="text" inputMode="decimal" value={l.cantidad} onChange={(e) => actualizarCantidad(idx, e.target.value)} onBlur={() => confirmarCantidad(idx)} />
                          <button type="button" tabIndex={-1} onClick={() => { actualizarCantidad(idx, String(cantidadNum(l) + 1)); confirmarCantidad(idx); }}>+</button>
                        </div>
                      </td>
                      <td>
                        {formatoMoneda(l.precioEstimado * cantidadNum(l) * (1 - (Number(l.descuentoPct) || 0) / 100))}
                        {Number(l.descuentoPct) !== 0 && (
                          <div className="muted" style={{ fontSize: 11 }}>desc. {l.descuentoPct}%</div>
                        )}
                      </td>
                      <td><button type="button" onClick={() => quitarLinea(idx)} className="btn-link-danger">Quitar</button></td>
                    </tr>
                    {l.kind === 'grupo' && expandido[idx] && (
                      <tr key={`${idx}-detalle`}>
                        <td colSpan={5} style={{ background: 'var(--bg)', fontSize: 12 }}>
                          {l.modificado && (
                            <p className="muted" style={{ margin: '0 0 6px', fontSize: 11 }}>
                              Este kit se modificó para esta venta (se vende como productos sueltos, con estas cantidades).
                            </p>
                          )}
                          {l.componentes.map((c) => {
                            const clave = claveComponente(idx, c.producto_id);
                            const totalActual = redondearCantidad(c.cantidadPorGrupo * cantidadNum(l));
                            const textoActual = textoComponente[clave] ?? String(totalActual);
                            return (
                              <div key={c.producto_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                                <span style={{ flex: 1 }}>{c.descripcion}</span>
                                <div className="cantidad-stepper">
                                  <button type="button" tabIndex={-1} onClick={() => ajustarCantidadComponente(idx, c.producto_id, totalActual, -1)}>−</button>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={textoActual}
                                    onChange={(e) => cambiarCantidadComponente(idx, c.producto_id, e.target.value)}
                                    onBlur={() => confirmarCantidadComponente(idx, c.producto_id, totalActual)}
                                    title="Cantidad total para esta venta -- se multiplica sola si cambiás la cantidad de kits arriba"
                                  />
                                  <button type="button" tabIndex={-1} onClick={() => ajustarCantidadComponente(idx, c.producto_id, totalActual, 1)}>+</button>
                                </div>
                                <button type="button" className="btn-link-danger" style={{ fontSize: 11, padding: 0 }} onClick={() => quitarComponenteDeKit(idx, c.producto_id)}>
                                  Quitar del kit
                                </button>
                              </div>
                            );
                          })}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            {lineasSeleccionadas.size > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Aplicar descuento a {lineasSeleccionadas.size} línea{lineasSeleccionadas.size === 1 ? '' : 's'} seleccionada{lineasSeleccionadas.size === 1 ? '' : 's'}:
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="%"
                  value={descuentoLote}
                  onChange={(e) => setDescuentoLote(e.target.value)}
                  style={{ width: 70 }}
                />
                <button type="button" className="btn-secondary" onClick={aplicarDescuentoLote}>Aplicar</button>
              </div>
            )}

            {carrito.length > 0 && (
              <div className="resumen-totales">
                <div className="resumen-linea"><span>Subtotal</span><span>{formatoMoneda(subtotalEstimado)}</span></div>
                {ajustePct !== 0 && (
                  <div className={`resumen-linea ${ajustePct < 0 ? 'descuento' : ''}`}>
                    <span>
                      {esTecnico ? 'Cliente técnico' : 'Público'} · {metodoPago.replace(/_/g, ' ')} ({ajustePct > 0 ? '+' : ''}{ajustePct}%)
                    </span>
                    <span>{montoAjuste >= 0 ? '+' : ''}{formatoMoneda(montoAjuste)}</span>
                  </div>
                )}
                <div className="resumen-linea total"><span>Total estimado</span><span>{formatoMoneda(totalEstimado)}</span></div>
                <div style={{ marginTop: 10 }}>
                  <label className="muted" style={{ fontSize: 12 }}>Total final (dejalo vacío para usar el estimado)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={totalEstimado}
                    value={totalManual}
                    onChange={(e) => setTotalManual(e.target.value)}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Cliente</h2>
            {clienteSeleccionado ? (
              <div className="cliente-chip">
                <div>
                  <span>{clienteSeleccionado.nombre} {clienteSeleccionado.apellido}</span>
                  <div className="muted" style={{ fontSize: 12 }}>Cliente técnico</div>
                </div>
                <button type="button" onClick={() => setClienteSeleccionado(null)} className="btn-link-danger">Quitar</button>
              </div>
            ) : (
              <>
                <input
                  className="buscador"
                  placeholder="Buscar cliente..."
                  value={busquedaCliente}
                  onChange={(e) => buscarClientes(e.target.value)}
                  onFocus={() => setClienteBuscadorEnfocado(true)}
                  onBlur={() => setTimeout(() => setClienteBuscadorEnfocado(false), 150)}
                />
                {resultadosCliente.length > 0 && (
                  <ul className="resultados-lista" onMouseDown={evitarPerderFoco}>
                    {resultadosCliente.map((c) => (
                      <li key={c.id} onClick={() => { setClienteSeleccionado(c); setBusquedaCliente(''); setClienteBuscadorEnfocado(false); }}>
                        {c.nombre} {c.apellido}{c.nombre_negocio && <span className="muted"> · {c.nombre_negocio}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {!mostrarNuevoCliente ? (
                  <button type="button" className="btn-link" onClick={() => setMostrarNuevoCliente(true)}>+ Cliente nuevo</button>
                ) : (
                  <div className="nuevo-cliente-form">
                    <input placeholder="Nombre" value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente((n) => ({ ...n, nombre: e.target.value }))} />
                    <input placeholder="Apellido" value={nuevoCliente.apellido} onChange={(e) => setNuevoCliente((n) => ({ ...n, apellido: e.target.value }))} />
                    <input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente((n) => ({ ...n, telefono: e.target.value }))} />
                    <div className="form-row">
                      <button type="button" onClick={crearClienteAlVuelo} className="btn-primary" disabled={guardandoClienteRapido}>
                        {guardandoClienteRapido ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" onClick={() => setMostrarNuevoCliente(false)} className="btn-secondary">Cancelar</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Forma de pago</h2>
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ width: '100%' }}>
              {metodosPago.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
            {metodoPago === 'efectivo' && (
              <>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Monto recibido (opcional, para calcular el vuelto)"
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  style={{ width: '100%', marginTop: 10 }}
                />
                {vueltoEnVivo != null && (
                  <div
                    className={`resumen-linea ${vueltoEnVivo < 0 ? 'descuento' : ''}`}
                    style={{ marginTop: 8, fontWeight: 600 }}
                  >
                    <span>{vueltoEnVivo < 0 ? 'Falta' : 'Vuelto'}</span>
                    <span>{formatoMoneda(Math.abs(vueltoEnVivo))}</span>
                  </div>
                )}
              </>
            )}
            <textarea
              placeholder="Notas (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              style={{ width: '100%', marginTop: 10, minHeight: 60 }}
            />
            {errorVenta && <p className="login-error">{errorVenta}</p>}
            <button
              type="button"
              onClick={confirmarVenta}
              disabled={carrito.length === 0 || guardando}
              className="btn-primary"
              style={{ width: '100%', marginTop: 14, padding: 12 }}
            >
              {guardando ? 'Guardando...' : 'Confirmar venta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
