import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';
import { coincideTexto } from '../utils/busqueda';
import { parseNumero } from '../utils/numero';
import { useUi } from '../context/UiContext';

const TIPOS_DOC = ['DNI', 'CUIT', 'CUIL'];
const CONDICIONES_FISCALES = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];
const METODOS_DEFAULT = ['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito'];
const PAGE_SIZE = 30;

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

// Si nunca se guardó la tabla de ajustes de técnico desde Configuración
// (clave ausente o vacía), no hay que aplicar 0% en silencio -- mismo
// default que el backend (ver carrito.js) hasta que ella lo cambie a mano.
const DEFAULT_AJUSTES_TECNICO = '{"efectivo": -10, "transferencia": -5}';

function parsearTabla(json, defaultJson = '{}') {
  try { return JSON.parse(json || defaultJson); } catch { return {}; }
}

function ordenarAlfabetico(lista, textoDe) {
  return [...lista].sort((a, b) => textoDe(a).localeCompare(textoDe(b), 'es', { sensitivity: 'base' }));
}

// Evita que un click adentro del listado de resultados (checkbox, item,
// botón de agregar seleccionados) le sague el foco al buscador -- eso es lo
// que hacía que la tabla se cierre y se vuelva a abrir sola. Al frenar el
// mousedown, el input nunca pierde el foco mientras se interactúa con SUS
// PROPIOS resultados.
function evitarPerderFoco(e) {
  e.preventDefault();
}

export default function Presupuestos() {
  const { toast, confirm } = useUi();
  const buscadorRef = useRef(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null); // id del presupuesto que se esta modificando (null = creando uno nuevo)

  // --- Carrito para armar un presupuesto nuevo o editar uno existente ---
  const [productos, setProductos] = useState([]);
  const [productosPorId, setProductosPorId] = useState({});
  const [grupos, setGrupos] = useState([]);
  const [config, setConfig] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [buscadorEnfocado, setBuscadorEnfocado] = useState(false);
  const [clienteBuscadorEnfocado, setClienteBuscadorEnfocado] = useState(false);
  const [clientesTodos, setClientesTodos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [expandido, setExpandido] = useState({});
  const [lineasSeleccionadas, setLineasSeleccionadas] = useState(new Set());
  const [descuentoLote, setDescuentoLote] = useState('');
  // Texto a medio escribir de la cantidad de un producto dentro de un kit
  // (mismo motivo que con la cantidad del carrito: mientras se tipea "2,5"
  // no se puede ir convirtiendo a numero en cada letra). Clave: `${idxLinea}-${producto_id}`.
  const [textoComponente, setTextoComponente] = useState({});
  const [seleccionBusqueda, setSeleccionBusqueda] = useState(new Set());
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState(null);
  const [presupuestoCreado, setPresupuestoCreado] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  // Menu "⋯" por fila del historial con el resto de las acciones (antes
  // estaban todas sueltas en fila y en celular se cortaban a la mitad).
  const [menuAbiertoId, setMenuAbiertoId] = useState(null);

  // --- Historial ---
  const [presupuestos, setPresupuestos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  const [facturando, setFacturando] = useState(null);
  const [datosFactura, setDatosFactura] = useState({ tipo_documento: 'DNI', documento: '', condicion_fiscal: 'Consumidor Final' });
  const [errorFactura, setErrorFactura] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);

  async function cargarHistorial(paginaParam) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/presupuestos', { page: paginaParam, pageSize: PAGE_SIZE });
      setPresupuestos(data.presupuestos);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargarHistorial(1); }, []);

  async function cargarDatosCarrito() {
    if (clientesTodos.length === 0) {
      api.get('/clientes', { pageSize: 2000 }).then((data) => {
        setClientesTodos(ordenarAlfabetico(data.clientes, (c) => `${c.nombre || ''} ${c.apellido || ''}`));
      });
    }
    if (productos.length > 0) return;
    const dataProductos = await api.get('/productos', { pageSize: 2000 });
    const ordenados = ordenarAlfabetico(dataProductos.productos, (p) => p.descripcion || '');
    setProductos(ordenados);
    const mapa = {};
    for (const p of ordenados) mapa[p.id] = p;
    setProductosPorId(mapa);
    api.get('/grupos').then((data) => setGrupos(ordenarAlfabetico(data.grupos, (g) => g.nombre || '')));
    api.get('/config').then((data) => setConfig(data));
  }

  function abrirForm() {
    setEditandoId(null);
    setCarrito([]);
    setExpandido({});
    setLineasSeleccionadas(new Set());
    setDescuentoLote('');
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setNotas('');
    setMetodoPago('efectivo');
    setErrorForm(null);
    setMostrarForm(true);
    cargarDatosCarrito();
    setTimeout(() => buscadorRef.current?.focus(), 50);
  }

  async function abrirEditar(p) {
    await cargarDatosCarrito();
    const detalle = await api.get(`/presupuestos/${p.id}`);
    setEditandoId(p.id);
    setCarrito(detalle.items.map((it) => ({
      kind: 'producto',
      id: it.producto_id,
      descripcion: it.descripcion,
      cantidad: Number(it.cantidad),
      precioEstimado: Number(it.precio_original ?? it.precio_unitario),
      descuentoPct: Number(it.ajuste_pct) || 0,
    })));
    setExpandido({});
    setLineasSeleccionadas(new Set());
    setDescuentoLote('');
    if (p.cliente_id) {
      const cliente = await api.get(`/clientes/${p.cliente_id}`);
      setClienteSeleccionado(cliente);
    } else {
      setClienteSeleccionado(null);
    }
    setBusquedaCliente('');
    setNotas(p.notas || '');
    setMetodoPago('efectivo');
    setErrorForm(null);
    setMostrarForm(true);
    setTimeout(() => buscadorRef.current?.focus(), 50);
  }

  const ajustesPublico = useMemo(() => parsearTabla(config?.ajustes_metodo_pago), [config]);
  const ajustesTecnico = useMemo(() => parsearTabla(config?.ajustes_metodo_pago_tecnico, DEFAULT_AJUSTES_TECNICO), [config]);
  // Todos los clientes de la agenda son tecnicos -- si hay uno seleccionado
  // se usa la tabla tecnico, si no la publica (venta/presupuesto de mostrador).
  const esTecnico = !!clienteSeleccionado;
  const tablaVigente = esTecnico ? ajustesTecnico : ajustesPublico;
  // Antes esto unia las claves de METODOS_DEFAULT con las claves sueltas de
  // la config de ajustes por metodo de pago (texto libre en Configuracion).
  // Si ahi se escribia "debito" en vez de "tarjeta_debito" aparecia como un
  // metodo de pago repetido y ademas invalido (el backend no lo reconoce).
  // El dropdown debe mostrar siempre los 4 metodos validos, nada mas.
  const metodosPago = METODOS_DEFAULT;

  // Busqueda igual que el programa original: aparece apenas se hace foco, y
  // busca por palabras sueltas en cualquier orden sin importar mayusc/tildes.
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

  const resultadosCliente = useMemo(() => {
    if (!clienteBuscadorEnfocado) return [];
    const hayQuery = busquedaCliente.trim() !== '';
    return clientesTodos
      .filter((c) => !hayQuery || coincideTexto(`${c.nombre || ''} ${c.apellido || ''} ${c.documento || ''} ${c.nombre_negocio || ''}`, busquedaCliente))
      .slice(0, hayQuery ? 8 : 20);
  }, [busquedaCliente, clienteBuscadorEnfocado, clientesTodos]);

  async function agregarAlCarrito(item) {
    if (item.kind === 'producto') {
      setCarrito((prev) => {
        const existente = prev.find((l) => l.kind === 'producto' && l.id === item.id);
        if (existente) return prev.map((l) => (l === existente ? { ...l, cantidad: cantidadNum(l) + 1 } : l));
        return [...prev, { kind: 'producto', id: item.id, codigo: item.codigo, descripcion: item.descripcion, cantidad: 1, precioEstimado: item.precio, descuentoPct: 0 }];
      });
    } else {
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
  // para este presupuesto (cantidadPorGrupo × cantidad de kits de la línea),
  // no la receta "por kit" -- así, si arriba subís la cantidad de kits (ej.
  // de 1 a 2), cada producto adentro se duplica solo. Si en cambio se edita
  // este campo a mano, se recalcula la receta por kit (total ÷ cantidad de
  // kits) para que siga escalando bien si después se vuelve a cambiar la
  // cantidad de kits. A partir de ahí el kit se manda como productos sueltos.
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

  function quitarComponenteDeKit(idxLinea, producto_id) {
    setCarrito((prev) => prev.map((l, i) => {
      if (i !== idxLinea || l.kind !== 'grupo') return l;
      const componentes = l.componentes.filter((c) => c.producto_id !== producto_id);
      const precioEstimado = componentes.reduce((acc, c) => acc + c.precioEstimado * c.cantidadPorGrupo, 0);
      return { ...l, componentes, precioEstimado, modificado: true };
    }));
  }

  async function agregarUnItem(item) {
    setBusqueda('');
    await agregarAlCarrito(item);
  }

  // Enter en el buscador agrega el primer resultado, sin soltar el teclado
  // para pasar al mouse -- pensado para cargar varios items seguidos rápido.
  function manejarKeyDownBuscador(e) {
    if (e.key === 'Enter' && resultadosBusqueda.length > 0) {
      e.preventDefault();
      agregarUnItem(resultadosBusqueda[0]);
    }
  }

  // Ctrl/Cmd+Enter en cualquier parte del formulario guarda el presupuesto,
  // para no tener que soltar el teclado e ir a buscar el botón con el mouse.
  function manejarKeyDownForm(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (carrito.length > 0 && !guardando) guardarPresupuesto();
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

  function buscarClientes(texto) {
    setBusquedaCliente(texto);
  }

  function itemsParaEnviar() {
    return carrito.flatMap((l) => {
      if (l.kind === 'grupo') {
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

  // Al ver el PDF de una pestana nueva, abrirla YA (antes del await) para
  // que el navegador no la bloquee como popup.
  async function abrirPdfPresupuesto(id) {
    const ventana = window.open('', '_blank');
    const blob = await api.get(`/presupuestos/${id}/comprobante`);
    const url = URL.createObjectURL(blob);
    if (ventana) ventana.location.href = url;
  }

  async function descargarComprobantePresupuesto() {
    const blob = await api.get(`/presupuestos/${presupuestoCreado.id}/comprobante`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presupuesto-${presupuestoCreado.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function nuevoPresupuestoDesdeResultado() {
    setPresupuestoCreado(null);
    abrirForm();
  }

  useEffect(() => {
    if (!presupuestoCreado) { setPdfUrl(null); return; }
    let urlActual = null;
    let cancelado = false;
    setCargandoPdf(true);
    (async () => {
      try {
        const blob = await api.get(`/presupuestos/${presupuestoCreado.id}/comprobante`);
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
  }, [presupuestoCreado]);

  async function guardarPresupuesto() {
    if (carrito.length === 0) return;
    setGuardando(true);
    setErrorForm(null);
    try {
      const body = {
        cliente_id: clienteSeleccionado?.id || null,
        items: itemsParaEnviar(),
        metodo_pago: metodoPago,
        notas: notas || null,
      };
      const creado = editandoId
        ? await api.put(`/presupuestos/${editandoId}`, body)
        : await api.post('/presupuestos', body);
      setMostrarForm(false);
      setEditandoId(null);
      cargarHistorial(1);
      setPage(1);
      toast(editandoId ? 'Presupuesto actualizado ✓' : 'Presupuesto guardado ✓');
      // En vez de abrir el PDF en una pestaña nueva, se muestra el
      // presupuesto directamente acá, centrado, igual que la pantalla de
      // venta registrada.
      setPresupuestoCreado(creado);
    } catch (err) {
      setErrorForm(err.message);
    } finally {
      setGuardando(false);
    }
  }

  function cambiarPagina(p) {
    setPage(p);
    cargarHistorial(p);
  }

  async function eliminarPresupuesto(id) {
    const ok = await confirm('¿Dar de baja este presupuesto?', { danger: true, confirmLabel: 'Dar de baja' });
    if (!ok) return;
    setEliminandoId(id);
    try {
      await api.delete(`/presupuestos/${id}`);
      setPresupuestos((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => t - 1);
      toast('Presupuesto dado de baja ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoId(null);
    }
  }

  function abrirFacturar(p) {
    setFacturando(p.id);
    setErrorFactura(null);
    setDatosFactura({ tipo_documento: 'DNI', documento: '', condicion_fiscal: 'Consumidor Final' });
  }

  async function emitirFactura(id) {
    setEmitiendo(true);
    setErrorFactura(null);
    try {
      const actualizado = await api.post(`/presupuestos/${id}/facturar`, { ...datosFactura, confirmar: true });
      setPresupuestos((prev) => prev.map((p) => (p.id === id ? { ...p, ...actualizado } : p)));
      setFacturando(null);
      toast('Factura emitida ✓');
    } catch (err) {
      setErrorFactura(err.message);
    } finally {
      setEmitiendo(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ajustePct = Number(tablaVigente[metodoPago] || 0);

  // --- Pantalla de resultado despues de guardar un presupuesto ---
  if (presupuestoCreado) {
    return (
      <div className="page">
        <div className="comprobante-pantalla">
          <h1 style={{ textAlign: 'center' }}>Presupuesto #{presupuestoCreado.numero ?? presupuestoCreado.id} guardado</h1>

          <div className="comprobante-visor panel">
            {cargandoPdf && <p className="muted">Generando presupuesto...</p>}
            {!cargandoPdf && pdfUrl && (
              <iframe title="Presupuesto" src={pdfUrl} className="comprobante-iframe" />
            )}
          </div>

          <div className="comprobante-acciones">
            <button type="button" onClick={descargarComprobantePresupuesto} className="btn-primary">Descargar PDF</button>
            <button type="button" onClick={() => setPresupuestoCreado(null)} className="btn-secondary">Ver listado</button>
            <button type="button" onClick={nuevoPresupuestoDesdeResultado} className="btn-secondary">Nuevo presupuesto</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="dashboard-toolbar">
        <h1>Presupuestos</h1>
        <button type="button" className="btn-primary" onClick={() => (mostrarForm ? setMostrarForm(false) : abrirForm())}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo presupuesto'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {mostrarForm && (
        <div className="venta-grid" style={{ marginBottom: 20 }} onKeyDown={manejarKeyDownForm}>
          <div className="panel">
            <h2>{editandoId ? `Editando presupuesto #${presupuestos.find((p) => p.id === editandoId)?.numero ?? editandoId}` : 'Productos'}</h2>
            <input
              ref={buscadorRef}
              className="buscador"
              placeholder="Buscar por código o descripción... (Enter agrega el primero, Ctrl+Enter guarda)"
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
              <thead><tr><th /><th>Producto</th><th>Cant.</th><th>Subtotal</th><th /></tr></thead>
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
                              Este kit se modificó (se vende/presupuesta como productos sueltos, con estas cantidades).
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
                                    title="Cantidad total para este presupuesto -- se multiplica sola si cambiás la cantidad de kits arriba"
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
                <div className="resumen-linea total"><span>Subtotal estimado</span><span>{formatoMoneda(subtotalEstimado)}</span></div>
                <p className="muted" style={{ fontSize: 12 }}>El total final se recalcula con el ajuste por forma de pago (según cliente técnico/público) al guardar.</p>
              </div>
            )}
          </div>

          <div>
            <div className="panel">
              <h2>Cliente</h2>
              {clienteSeleccionado ? (
                <div className="cliente-chip">
                  <span>{clienteSeleccionado.nombre} {clienteSeleccionado.apellido} <span className="muted">· técnico</span></span>
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
                </>
              )}
            </div>
            <div className="panel" style={{ marginTop: 16 }}>
              <h2>Forma de pago</h2>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ width: '100%' }}>
                {metodosPago.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
              {ajustePct !== 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Ajuste {esTecnico ? 'cliente técnico' : 'público'}: {ajustePct > 0 ? '+' : ''}{ajustePct}%
                </p>
              )}
              <textarea placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} style={{ width: '100%', marginTop: 10, minHeight: 60 }} />
              {errorForm && <p className="login-error">{errorForm}</p>}
              <button
                type="button"
                onClick={guardarPresupuesto}
                disabled={carrito.length === 0 || guardando}
                className="btn-primary"
                style={{ width: '100%', marginTop: 10, padding: 12 }}
              >
                {guardando ? 'Guardando...' : (editandoId ? 'Guardar cambios' : 'Guardar presupuesto')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Historial</h2>
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th /></tr>
              </thead>
              <tbody>
                {presupuestos.length === 0 && (
                  <tr><td colSpan={6} className="muted">Sin presupuestos registrados</td></tr>
                )}
                {presupuestos.map((p) => (
                  <>
                    <tr key={p.id}>
                      <td>{p.numero}</td>
                      <td>{String(p.fecha).slice(0, 10)}</td>
                      <td>{p.cliente_nombre ? `${p.cliente_nombre} ${p.cliente_apellido || ''}` : 'Sin cliente'}</td>
                      <td>{formatoMoneda(p.total)}</td>
                      <td>
                        {p.afip_cae ? <span style={{ color: 'var(--success)' }}>Facturado</span> : <span className="muted">Pendiente</span>}
                      </td>
                      <td className="celda-acciones">
                        <div className="menu-acciones">
                          <button
                            type="button"
                            className="btn-link menu-acciones-toggle"
                            onClick={() => setMenuAbiertoId(menuAbiertoId === p.id ? null : p.id)}
                            aria-label="Más acciones"
                          >
                            ⋯
                          </button>
                          {menuAbiertoId === p.id && (
                            <>
                              <div className="menu-acciones-fondo" onClick={() => setMenuAbiertoId(null)} />
                              <div className="menu-acciones-lista">
                                <button type="button" onClick={() => { setMenuAbiertoId(null); abrirPdfPresupuesto(p.id); }}>Descargar PDF</button>
                                <button type="button" onClick={() => { setMenuAbiertoId(null); abrirEditar(p); }}>Editar</button>
                                {!p.afip_cae && (
                                  <button type="button" onClick={() => { setMenuAbiertoId(null); abrirFacturar(p); }}>Facturar</button>
                                )}
                                <button
                                  type="button"
                                  className="danger"
                                  disabled={eliminandoId === p.id}
                                  onClick={() => { setMenuAbiertoId(null); eliminarPresupuesto(p.id); }}
                                >
                                  {eliminandoId === p.id ? 'Eliminando...' : 'Eliminar'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {facturando === p.id && (
                      <tr key={`${p.id}-facturar`}>
                        <td colSpan={6}>
                          <div className="factura-box">
                            <p className="muted" style={{ marginTop: 0 }}>
                              Esto emite una factura real ante AFIP con el certificado de producción. No se puede deshacer.
                            </p>
                            <div className="form-row">
                              <select value={datosFactura.tipo_documento} onChange={(e) => setDatosFactura((d) => ({ ...d, tipo_documento: e.target.value }))}>
                                {TIPOS_DOC.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input placeholder="Número de documento" value={datosFactura.documento} onChange={(e) => setDatosFactura((d) => ({ ...d, documento: e.target.value }))} />
                            </div>
                            <select value={datosFactura.condicion_fiscal} onChange={(e) => setDatosFactura((d) => ({ ...d, condicion_fiscal: e.target.value }))} style={{ marginTop: 8, width: '100%' }}>
                              {CONDICIONES_FISCALES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {errorFactura && <p className="login-error">{errorFactura}</p>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button type="button" onClick={() => emitirFactura(p.id)} disabled={emitiendo} className="btn-danger">
                                {emitiendo ? 'Emitiendo...' : 'Confirmar y emitir factura real'}
                              </button>
                              <button type="button" onClick={() => setFacturando(null)} className="btn-secondary">Cancelar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>

            <div className="paginacion-bar">
              <span className="muted" style={{ fontSize: 13 }}>{total} presupuesto{total === 1 ? '' : 's'}</span>
              <div className="paginacion-botones">
                <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => cambiarPagina(page - 1)}>Anterior</button>
                <span className="muted" style={{ fontSize: 13 }}>Página {page} de {totalPaginas}</span>
                <button type="button" className="btn-secondary" disabled={page >= totalPaginas} onClick={() => cambiarPagina(page + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
