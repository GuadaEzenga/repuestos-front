import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { coincideTexto } from '../utils/busqueda';
import { useUi } from '../context/UiContext';

function formatoMoneda(valor, moneda = 'ARS') {
  if (valor == null || valor === '') return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(valor);
}

function formatoPct(valor) {
  if (valor == null) return '—';
  return `${Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
}

function formatoFecha(fechaTexto) {
  if (!fechaTexto) return '—';
  const d = new Date(fechaTexto);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
}

const PAGE_SIZE = 50;
const RESTOCK_VACIO = { cantidad: '', costo: '', costoMoneda: 'ARS', envio_pct: '', iva_pct: '', margen_venta_pct: '' };

const VACIO = { codigo: '', descripcion: '', categoria: '', stock: '', costo: '', costoMoneda: 'ARS', precio_manual_ars: '', margen_venta_pct: '', envio_pct: '', iva_pct: '' };

// Calcula en vivo el precio final mientras se va cargando costo/iva/envio/
// margen, igual que el programa viejo -- sin esperar a guardar. Mismo orden
// que el backend: costo -> +IVA% -> +envio% -> +margen% (ver utils/precio.js).
// El costo se puede estar cargando en ARS o en USD (según el selector de
// moneda); todo lo demás se calcula directo en pesos para no perder
// precisión por ida y vuelta de conversión.
function previsualizarPrecio(form, config, cotizacion) {
  if (form.precio_manual_ars !== '' && form.precio_manual_ars != null) {
    const manual = parseNumero(form.precio_manual_ars);
    return manual != null ? { precio: manual, esManual: true } : null;
  }
  const costoNum = parseNumero(form.costo);
  if (costoNum == null) return null;
  const costoArs = form.costoMoneda === 'ARS' ? costoNum : costoNum * (cotizacion || 0);
  if (!costoArs) return null;

  const ivaPct = form.iva_pct !== '' && form.iva_pct != null ? parseNumero(form.iva_pct) : Number(config.iva_pct || 0);
  const envioPct = form.envio_pct !== '' && form.envio_pct != null ? parseNumero(form.envio_pct) : Number(config.envio_pct || 0);
  const margenPct = form.margen_venta_pct !== '' && form.margen_venta_pct != null ? parseNumero(form.margen_venta_pct) : Number(config.margen_venta_pct || 0);

  const costoConIva = costoArs * (1 + (ivaPct || 0) / 100);
  const costoFinalArs = costoConIva * (1 + (envioPct || 0) / 100);
  const precioSinRedondear = costoFinalArs * (1 + (margenPct || 0) / 100);
  const unidad = Number(config.redondeo_unidad || 10);
  const precio = Math.round(precioSinRedondear / unidad) * unidad;
  return { precio, costoFinalArs, esManual: false };
}

// --- Importación desde una planilla exportada como CSV ---
// Se parsea acá mismo en el navegador (sin librerías de terceros -- las que
// leen .xlsx directo tienen vulnerabilidades conocidas sin arreglo, asi que
// se pide CSV, que Excel/Sheets exportan con "Guardar como" en dos clics).
function detectarDelimitadorCsv(linea) {
  const puntoYComa = (linea.match(/;/g) || []).length;
  const coma = (linea.match(/,/g) || []).length;
  return puntoYComa > coma ? ';' : ',';
}

function parsearLineaCsv(linea, delimitador) {
  const campos = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else entreComillas = !entreComillas;
    } else if (ch === delimitador && !entreComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += ch;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

function parsearCsv(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return [];
  const delimitador = detectarDelimitadorCsv(lineas[0]);
  const encabezados = parsearLineaCsv(lineas[0], delimitador).map((h) => h.toLowerCase().trim());
  return lineas.slice(1).map((linea) => {
    const campos = parsearLineaCsv(linea, delimitador);
    const fila = {};
    encabezados.forEach((h, i) => { fila[h] = campos[i] ?? ''; });
    return fila;
  });
}

// Acepta distintos nombres de columna (con o sin tilde, en inglés) para no
// depender de que la planilla tenga exactamente un formato.
function normalizarFilaImportada(fila) {
  const buscar = (...claves) => {
    for (const c of claves) {
      if (fila[c] != null && String(fila[c]).trim() !== '') return String(fila[c]).trim();
    }
    return '';
  };
  return {
    codigo: buscar('codigo', 'código', 'code', 'sku'),
    descripcion: buscar('descripcion', 'descripción', 'nombre', 'producto'),
    costo: buscar('costo', 'costo usd', 'costo_usd', 'costo (usd)'),
    stock: buscar('stock', 'cantidad', 'stock inicial'),
    categoria: buscar('categoria', 'categoría'),
    margen_venta_pct: buscar('margen', 'margen %', 'margen_venta_pct'),
    envio_pct: buscar('envio', 'envio %', 'envío', 'envío %', 'envio_pct'),
    iva_pct: buscar('iva', 'iva %', 'iva_pct'),
  };
}

// Acepta tanto "1234.56" (punto decimal) como "1.234,56" o "1234,56"
// (formato AR, coma decimal) segun que separadores tenga el valor.
function numeroCsv(valor) {
  if (valor === '' || valor == null) return null;
  let texto = String(valor).trim();
  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }
  const num = Number(texto);
  return Number.isNaN(num) ? null : num;
}

export default function Productos() {
  const { toast, confirm } = useUi();
  const [searchParams] = useSearchParams();
  const categoriaInicial = searchParams.get('categoria') || '';

  // Se trae toda la lista (para la categoría elegida) una sola vez y se
  // busca en memoria -- misma idea que el buscador de Nueva venta: instantáneo
  // a medida que se escribe, por palabras sueltas en cualquier orden, sin
  // tildes/mayúsculas y sin tener que apretar "Buscar".
  const [productosCompletos, setProductosCompletos] = useState([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState(categoriaInicial);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);

  const [nuevo, setNuevo] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cotizacion, setCotizacion] = useState(0);
  const [configFull, setConfigFull] = useState({});

  // --- Modal "Editar producto": historial, datos generales editables,
  // lotes (cada uno editable por separado) y restock, todo en un solo lugar ---
  const [detalleAbiertoId, setDetalleAbiertoId] = useState(null);
  const [detalleData, setDetalleData] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState(null);

  const [generalForm, setGeneralForm] = useState(VACIO);
  const [guardandoGeneral, setGuardandoGeneral] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState(null);

  // Edición de un lote puntual (cuando se cargó mal el costo/envío/IVA/
  // cantidad de un restock reciente).
  const [loteEditId, setLoteEditId] = useState(null);
  const [loteEditForm, setLoteEditForm] = useState({ cantidad: '', costo: '', costoMoneda: 'ARS', envio_pct: '', iva_pct: '', margen_venta_pct: '' });
  const [guardandoLote, setGuardandoLote] = useState(false);
  const [errorLote, setErrorLote] = useState(null);

  // --- Restock rápido (sumar stock a un producto existente sin volver a
  // tipear el código en el form de "Cargar producto") -- vive dentro del
  // modal de Editar, no como fila aparte en la tabla.
  const [restockForm, setRestockForm] = useState(RESTOCK_VACIO);
  const [guardandoRestock, setGuardandoRestock] = useState(false);
  const [errorRestock, setErrorRestock] = useState(null);

  // --- Actualizacion masiva de margen de ganancia ---
  const [mostrarMargenMasivo, setMostrarMargenMasivo] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set()); // ids marcados con checkbox (selección manual)
  const [margenMasivoModo, setMargenMasivoModo] = useState('seleccion'); // 'seleccion' | 'todos' | 'categoria'
  const [margenMasivoCategoria, setMargenMasivoCategoria] = useState('');
  const [margenMasivoValor, setMargenMasivoValor] = useState('');
  const [aplicandoMargen, setAplicandoMargen] = useState(false);

  // --- Recarga de gas por kilo con garrafas del stock ---
  // Da de baja 1 garrafa y reemplaza el stock del producto "gas x kg"
  // correspondiente por la cantidad de kg que traía esa garrafa. Las filas
  // (qué garrafa va con qué gas x kg, y la cantidad) quedan guardadas en
  // Configuración para la próxima vez -- así después solo hay que apretar
  // "Recargar".
  const [mostrarRecarga, setMostrarRecarga] = useState(false);
  const [productosTodos, setProductosTodos] = useState([]);
  const [recargaFilas, setRecargaFilas] = useState([]);
  const [recargaGuardandoId, setRecargaGuardandoId] = useState(null);
  const [recargaErrores, setRecargaErrores] = useState({});

  // --- Importación masiva desde Excel (exportado como CSV) ---
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [filasImportar, setFilasImportar] = useState([]);
  // Cómo viene cargado el costo en la planilla: en qué moneda, y si es el
  // costo de una unidad o el total de todo el stock de esa fila (en ese caso
  // se divide por el stock para sacar el costo unitario antes de mandarlo).
  const [importCostoMoneda, setImportCostoMoneda] = useState('USD');
  const [importCostoTipo, setImportCostoTipo] = useState('unitario');
  const [errorImportar, setErrorImportar] = useState(null);
  const [importando, setImportando] = useState(false);
  const [progresoImportar, setProgresoImportar] = useState(null);
  const [resultadoImportar, setResultadoImportar] = useState(null);

  async function cargar(categoriaParam) {
    setLoading(true);
    setError(null);
    try {
      const [dataProductos, dataCategorias, config] = await Promise.all([
        api.get('/productos', { pageSize: 5000, categoria: categoriaParam || undefined }),
        api.get('/categorias'),
        api.get('/config'),
      ]);
      setProductosCompletos(dataProductos.productos);
      setCategorias(dataCategorias.categorias);
      setCotizacion(Number(config.cotizacion_dolar || 0));
      setConfigFull(config);
      try { setRecargaFilas(JSON.parse(config.recargas_garrafa || '[]')); } catch { setRecargaFilas([]); }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(categoriaInicial); }, []);

  // Escape cierra el modal de Recarga, como cualquier otro modal de la app.
  useEffect(() => {
    if (!mostrarRecarga) return;
    function alEscape(e) {
      if (e.key === 'Escape') setMostrarRecarga(false);
    }
    window.addEventListener('keydown', alEscape);
    return () => window.removeEventListener('keydown', alEscape);
  }, [mostrarRecarga]);

  // Búsqueda instantánea en memoria sobre lo ya cargado (misma lógica que
  // Nueva venta: por palabras sueltas, en cualquier orden, sin tildes).
  const productosFiltrados = useMemo(() => {
    if (!q.trim()) return productosCompletos;
    return productosCompletos.filter((p) => coincideTexto(`${p.codigo || ''} ${p.descripcion || ''} ${p.categoria || ''}`, q));
  }, [productosCompletos, q]);

  const total = productosFiltrados.length;
  const productosVisibles = useMemo(
    () => productosFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [productosFiltrados, page]
  );

  function buscarEnVivo(texto) {
    setQ(texto);
    setPage(1);
  }

  function filtrarCategoria(cat) {
    setCategoriaFiltro(cat);
    setPage(1);
    cargar(cat);
  }

  function cambiarPagina(nuevaPagina) {
    setPage(nuevaPagina);
  }

  function actualizarLocal(id, campo, valor) {
    setProductosCompletos((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  async function guardarCampo(id, campo, valor) {
    try {
      const producto = await api.put(`/productos/${id}`, { [campo]: valor === '' ? null : valor });
      setProductosCompletos((prev) => prev.map((p) => (p.id === id ? producto : p)));
      setFlashId(id);
      setTimeout(() => setFlashId((prev) => (prev === id ? null : prev)), 900);
      toast('Guardado ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    }
  }

  async function eliminarProducto(id) {
    const ok = await confirm('¿Dar de baja este producto?', { danger: true, confirmLabel: 'Dar de baja' });
    if (!ok) return;
    setEliminandoId(id);
    try {
      await api.delete(`/productos/${id}`);
      setProductosCompletos((prev) => prev.filter((p) => p.id !== id));
      toast('Producto dado de baja ✓');
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setEliminandoId(null);
    }
  }

  // --- Modal Editar: historial + datos generales + lotes + restock ---
  // El costo se guarda siempre en USD por dentro, pero se muestra en pesos
  // (convertido con la cotización actual) porque es como ella lo quiere ver
  // y cargar -- el USD queda solo como un detalle interno.
  function datosGeneralesDesdeProducto(p) {
    return {
      codigo: p.codigo || '',
      descripcion: p.descripcion || '',
      categoria: p.categoria || '',
      stock: p.stock ?? '',
      costo: p.costo != null && cotizacion ? Number((Number(p.costo) * cotizacion).toFixed(2)) : (p.costo ?? ''),
      costoMoneda: 'ARS',
      precio_manual_ars: p.precio_manual_ars ?? '',
      margen_venta_pct: p.margen_venta_pct ?? '',
      envio_pct: p.envio_pct ?? '',
      iva_pct: p.iva_pct ?? '',
    };
  }

  // Refresca el detalle del modal Y la fila de la tabla con el mismo cálculo
  // (misma cotización, mismo momento) para que nunca queden desincronizados.
  async function refrescarDetalle(productoId) {
    setCargandoDetalle(true);
    setErrorDetalle(null);
    try {
      const data = await api.get(`/productos/${productoId}/detalle`);
      setDetalleData(data);
      setProductosCompletos((prev) => prev.map((p) => (p.id === productoId ? {
        ...p,
        ...data.producto,
        costo_final: data.costo_unitario_usd,
        costo_final_ars: data.costo_unitario_ars,
        costo_ars: data.producto.costo != null && data.cotizacion_dolar ? Number(data.producto.costo) * data.cotizacion_dolar : null,
        precio: data.precio_ars,
      } : p)));
      return data;
    } catch (err) {
      setErrorDetalle(err.message);
      return null;
    } finally {
      setCargandoDetalle(false);
    }
  }

  async function abrirEditar(producto) {
    if (detalleAbiertoId === producto.id) {
      setDetalleAbiertoId(null);
      setDetalleData(null);
      return;
    }
    setDetalleAbiertoId(producto.id);
    setDetalleData(null);
    setGeneralForm(datosGeneralesDesdeProducto(producto));
    setErrorGeneral(null);
    setLoteEditId(null);
    setErrorLote(null);
    setRestockForm(RESTOCK_VACIO);
    setErrorRestock(null);
    await refrescarDetalle(producto.id);
  }

  function cerrarEditar() {
    setDetalleAbiertoId(null);
    setDetalleData(null);
  }

  async function guardarGeneral(producto) {
    setGuardandoGeneral(true);
    setErrorGeneral(null);
    try {
      let costoUsd = parseNumero(generalForm.costo);
      if (costoUsd != null && generalForm.costoMoneda === 'ARS') {
        if (!cotizacion) throw new Error('No se pudo convertir: no hay cotización del dólar cargada en Configuración.');
        costoUsd = costoUsd / cotizacion;
      }
      await api.put(`/productos/${producto.id}`, {
        codigo: generalForm.codigo || null,
        descripcion: generalForm.descripcion,
        categoria: generalForm.categoria || null,
        stock: parseNumero(generalForm.stock) ?? 0,
        costo: costoUsd,
        precio_manual_ars: parseNumero(generalForm.precio_manual_ars),
        margen_venta_pct: parseNumero(generalForm.margen_venta_pct),
        envio_pct: parseNumero(generalForm.envio_pct),
        iva_pct: parseNumero(generalForm.iva_pct),
      });
      await refrescarDetalle(producto.id);
      toast('Datos del producto guardados ✓');
    } catch (err) {
      setErrorGeneral(err.message);
    } finally {
      setGuardandoGeneral(false);
    }
  }

  // --- Edición de un lote puntual ---
  function abrirEditarLote(lote) {
    setLoteEditId(lote.id);
    setErrorLote(null);
    // Si el lote es viejo (de antes de guardar el desglose) no hay costo
    // base propio -- se arranca desde el costo final como punto de partida.
    const costoUsdBase = lote.costo_usd_base ?? lote.costo_usd ?? null;
    setLoteEditForm({
      cantidad: lote.cantidad ?? '',
      costo: costoUsdBase != null && cotizacion ? Number((Number(costoUsdBase) * cotizacion).toFixed(2)) : (costoUsdBase ?? ''),
      costoMoneda: 'ARS',
      envio_pct: lote.envio_pct ?? '',
      iva_pct: lote.iva_pct ?? '',
      margen_venta_pct: lote.margen_venta_pct ?? '',
    });
  }

  function cerrarEditarLote() {
    setLoteEditId(null);
    setErrorLote(null);
  }

  async function guardarLote(productoId, loteId) {
    setGuardandoLote(true);
    setErrorLote(null);
    try {
      let costoUsd = parseNumero(loteEditForm.costo);
      if (costoUsd != null && loteEditForm.costoMoneda === 'ARS') {
        if (!cotizacion) throw new Error('No se pudo convertir: no hay cotización del dólar cargada en Configuración.');
        costoUsd = costoUsd / cotizacion;
      }
      await api.put(`/productos/${productoId}/lotes/${loteId}`, {
        cantidad: parseNumero(loteEditForm.cantidad),
        costo_usd_base: costoUsd,
        envio_pct: parseNumero(loteEditForm.envio_pct),
        iva_pct: parseNumero(loteEditForm.iva_pct),
        margen_venta_pct: parseNumero(loteEditForm.margen_venta_pct),
      });
      setLoteEditId(null);
      await refrescarDetalle(productoId);
      toast('Lote actualizado ✓');
    } catch (err) {
      setErrorLote(err.message);
    } finally {
      setGuardandoLote(false);
    }
  }

  // --- Restock rápido (dentro del modal) ---
  async function confirmarRestock(producto) {
    if (!producto.codigo) {
      setErrorRestock('Este producto no tiene código cargado -- el restock rápido necesita un código para identificar qué producto reponer. Cargale un código primero (en "Datos generales") o usá "+ Nuevo producto" con el mismo código.');
      return;
    }
    const cantidadRestock = parseNumero(restockForm.cantidad);
    if (cantidadRestock == null || cantidadRestock <= 0) {
      setErrorRestock('Ingresá la cantidad que entró.');
      return;
    }
    setGuardandoRestock(true);
    setErrorRestock(null);
    try {
      let costoUsd = parseNumero(restockForm.costo);
      if (costoUsd == null) throw new Error('Ingresá el costo del lote nuevo.');
      if (restockForm.costoMoneda === 'ARS') {
        if (!cotizacion) throw new Error('No se pudo convertir: no hay cotización del dólar cargada en Configuración.');
        costoUsd = costoUsd / cotizacion;
      }
      const resultado = await api.post('/productos', {
        codigo: producto.codigo,
        descripcion: producto.descripcion,
        categoria: producto.categoria,
        stock: cantidadRestock,
        costo: costoUsd,
        envio_pct: parseNumero(restockForm.envio_pct),
        iva_pct: parseNumero(restockForm.iva_pct),
        margen_venta_pct: parseNumero(restockForm.margen_venta_pct),
      });
      setProductosCompletos((prev) => prev.map((p) => (p.id === resultado.id ? { ...p, ...resultado } : p)));
      toast(resultado.mensaje || 'Restock registrado ✓', { duration: 5000 });
      setRestockForm(RESTOCK_VACIO);
      await refrescarDetalle(producto.id);
    } catch (err) {
      setErrorRestock(err.message);
    } finally {
      setGuardandoRestock(false);
    }
  }

  // --- Recarga de gas por kilo ---
  async function abrirRecarga() {
    const abriendo = !mostrarRecarga;
    setMostrarRecarga(abriendo);
    if (abriendo && productosTodos.length === 0) {
      const data = await api.get('/productos', { pageSize: 2000 });
      setProductosTodos(data.productos);
    }
    if (abriendo && recargaFilas.length === 0) {
      setRecargaFilas([{ id: `r${Date.now()}`, garrafaId: '', cantidad: '', gasId: '' }]);
    }
  }

  function guardarFilasRecarga(filas) {
    // No bloquea la UI si falla -- es solo para que la próxima vez ya esté
    // todo cargado, no hace falta avisar si no se pudo guardar la preferencia.
    api.put('/config', { recargas_garrafa: JSON.stringify(filas) }).catch(() => {});
  }

  function actualizarFilaRecarga(id, campo, valor) {
    setRecargaFilas((prev) => {
      const nuevas = prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f));
      guardarFilasRecarga(nuevas);
      return nuevas;
    });
  }

  function agregarFilaRecarga() {
    setRecargaFilas((prev) => {
      const nuevas = [...prev, { id: `r${Date.now()}`, garrafaId: '', cantidad: '', gasId: '' }];
      guardarFilasRecarga(nuevas);
      return nuevas;
    });
  }

  function quitarFilaRecarga(id) {
    setRecargaFilas((prev) => {
      const nuevas = prev.filter((f) => f.id !== id);
      guardarFilasRecarga(nuevas);
      return nuevas;
    });
    setRecargaErrores((prev) => ({ ...prev, [id]: null }));
  }

  async function confirmarRecarga(fila) {
    if (!fila.garrafaId || !fila.gasId || !fila.cantidad) {
      setRecargaErrores((prev) => ({ ...prev, [fila.id]: 'Elegí la garrafa, el gas x kg y la cantidad.' }));
      return;
    }
    const cantidadNum = parseNumero(fila.cantidad);
    if (cantidadNum == null || cantidadNum <= 0) {
      setRecargaErrores((prev) => ({ ...prev, [fila.id]: 'La cantidad tiene que ser mayor a 0.' }));
      return;
    }
    setRecargaGuardandoId(fila.id);
    setRecargaErrores((prev) => ({ ...prev, [fila.id]: null }));
    try {
      const resultado = await api.post('/productos/recargar-garrafa', {
        garrafa_id: fila.garrafaId,
        gas_id: fila.gasId,
        cantidad: cantidadNum,
      });
      toast(
        `Recarga hecha: "${resultado.gas.descripcion}" quedó con ${resultado.gas.stock}kg de stock, y se le descontó 1 unidad a "${resultado.garrafa.descripcion}" (stock ${resultado.garrafa.stock}).`,
        { duration: 6000 }
      );
      cargar(categoriaFiltro);
      const data = await api.get('/productos', { pageSize: 2000 });
      setProductosTodos(data.productos);
    } catch (err) {
      setRecargaErrores((prev) => ({ ...prev, [fila.id]: err.message }));
    } finally {
      setRecargaGuardandoId(null);
    }
  }

  function toggleSeleccionado(id) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });
  }

  function toggleSeleccionarTodosVisibles() {
    setSeleccionados((prev) => {
      const todosMarcados = productosVisibles.length > 0 && productosVisibles.every((p) => prev.has(p.id));
      if (todosMarcados) return new Set();
      return new Set(productosVisibles.map((p) => p.id));
    });
  }

  // Aplica un margen nuevo a: la selección manual marcada con checkbox, TODOS
  // los productos activos, o una categoría entera (no solo lo visible en esta
  // página -- categoria y todos actúan sobre toda la base).
  async function aplicarMargenMasivo() {
    if (margenMasivoValor === '') return;
    setAplicandoMargen(true);
    setError(null);
    try {
      const body = { margen_venta_pct: parseNumero(margenMasivoValor) };
      let descripcionAplicado;
      if (margenMasivoModo === 'todos') {
        body.todos = true;
        descripcionAplicado = 'todos los productos';
      } else if (margenMasivoModo === 'categoria') {
        if (!margenMasivoCategoria) throw new Error('Elegí una categoría');
        body.categoria = margenMasivoCategoria;
        descripcionAplicado = `la categoría "${margenMasivoCategoria}"`;
      } else {
        if (seleccionados.size === 0) throw new Error('Marcá al menos un producto con el checkbox');
        body.producto_ids = Array.from(seleccionados);
        descripcionAplicado = `${seleccionados.size} producto${seleccionados.size === 1 ? '' : 's'} seleccionado${seleccionados.size === 1 ? '' : 's'}`;
      }
      const resultado = await api.put('/productos/margen-masivo', body);
      toast(`Margen actualizado a ${margenMasivoValor}% en ${descripcionAplicado} (${resultado.actualizados} producto${resultado.actualizados === 1 ? '' : 's'}).`, { duration: 5000 });
      setSeleccionados(new Set());
      setMargenMasivoValor('');
      cargar(categoriaFiltro);
    } catch (err) {
      setError(err.message);
    } finally {
      setAplicandoMargen(false);
    }
  }

  async function elegirArchivoImportar(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorImportar(null);
    setResultadoImportar(null);
    try {
      const texto = await archivo.text();
      const filas = parsearCsv(texto)
        .map(normalizarFilaImportada)
        .filter((f) => f.descripcion);
      if (filas.length === 0) {
        setErrorImportar('No se encontraron filas con descripción. Revisá que el CSV tenga una columna "descripcion".');
      }
      setFilasImportar(filas);
    } catch (err) {
      setErrorImportar('No se pudo leer el archivo: ' + err.message);
    } finally {
      e.target.value = '';
    }
  }

  // Manda cada fila a POST /productos -- si el código ya existe, el backend
  // solo la toma como restock (suma stock con su costo nuevo) en vez de
  // fallar, asi que una misma planilla sirve tanto para altas como para
  // reponer stock de productos que ya existen.
  async function confirmarImportar() {
    if (filasImportar.length === 0) return;
    setImportando(true);
    setErrorImportar(null);
    let creados = 0;
    let restockeados = 0;
    const errores = [];
    for (let i = 0; i < filasImportar.length; i++) {
      const fila = filasImportar[i];
      setProgresoImportar(`${i + 1} de ${filasImportar.length}...`);
      try {
        const stockFila = numeroCsv(fila.stock) ?? 0;
        let costoFila = numeroCsv(fila.costo);
        // Si el costo de la planilla es el TOTAL de todo el stock de esa
        // fila (no el unitario), se divide por la cantidad para mandar el
        // costo unitario que espera el backend.
        if (costoFila != null && importCostoTipo === 'total') {
          if (!stockFila) throw new Error('El costo viene como "total" pero la fila no tiene stock para poder dividir');
          costoFila = costoFila / stockFila;
        }
        // Si el costo viene en pesos, se convierte a USD con la cotización
        // actual -- el sistema siempre guarda el costo en USD.
        if (costoFila != null && importCostoMoneda === 'ARS') {
          if (!cotizacion) throw new Error('No se pudo convertir: no hay cotización del dólar cargada en Configuración');
          costoFila = costoFila / cotizacion;
        }
        const resultado = await api.post('/productos', {
          codigo: fila.codigo || null,
          descripcion: fila.descripcion,
          categoria: fila.categoria || null,
          stock: stockFila,
          costo: costoFila,
          margen_venta_pct: numeroCsv(fila.margen_venta_pct),
          envio_pct: numeroCsv(fila.envio_pct),
          iva_pct: numeroCsv(fila.iva_pct),
        });
        if (resultado.restock) restockeados++; else creados++;
      } catch (err) {
        errores.push(`${fila.codigo || fila.descripcion}: ${err.message}`);
      }
    }
    setProgresoImportar(null);
    setResultadoImportar({ creados, restockeados, errores, total: filasImportar.length });
    setFilasImportar([]);
    setImportando(false);
    cargar(categoriaFiltro);
    setQ('');
    setPage(1);
  }

  async function crearProducto(e) {
    e.preventDefault();
    if (!nuevo.descripcion.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      // Si cargó el costo en pesos, se convierte a USD con la cotización
      // actual antes de mandarlo -- el sistema siempre guarda el costo en
      // USD para que se recalcule solo cuando sube el dólar.
      let costoUsd = parseNumero(nuevo.costo);
      if (costoUsd != null && nuevo.costoMoneda === 'ARS') {
        if (!cotizacion) throw new Error('No se pudo convertir: no hay cotización del dólar cargada en Configuración.');
        costoUsd = costoUsd / cotizacion;
      }

      const creado = await api.post('/productos', {
        codigo: nuevo.codigo || null,
        descripcion: nuevo.descripcion,
        categoria: nuevo.categoria || null,
        stock: parseNumero(nuevo.stock) ?? 0,
        costo: costoUsd,
        precio_manual_ars: parseNumero(nuevo.precio_manual_ars),
        margen_venta_pct: parseNumero(nuevo.margen_venta_pct),
        envio_pct: parseNumero(nuevo.envio_pct),
        iva_pct: parseNumero(nuevo.iva_pct),
      });

      if (creado.restock) {
        // Restock de un producto que ya existía (mismo código): actualiza
        // esa fila en vez de agregar una nueva.
        setProductosCompletos((prev) => prev.map((p) => (p.id === creado.id ? creado : p)));
        toast(creado.mensaje, { duration: 5000 });
      } else {
        setProductosCompletos((prev) => [creado, ...prev]);
        toast('Producto cargado ✓');
      }
      setNuevo(VACIO);
      setMostrarForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="dashboard-toolbar">
        <h1>Productos</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={abrirRecarga}>
            {mostrarRecarga ? 'Cancelar' : 'Recarga (garrafa → gas x kg)'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setMostrarImportar((m) => !m)}>
            {mostrarImportar ? 'Cancelar' : 'Importar Excel (CSV)'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setMostrarMargenMasivo((m) => !m)}>
            {mostrarMargenMasivo ? 'Cancelar' : 'Actualizar margen (masivo)'}
          </button>
          <button type="button" className="btn-primary" onClick={() => setMostrarForm((m) => !m)}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo producto'}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {mostrarForm && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Cargar producto</h2>
          <form onSubmit={crearProducto} className="gasto-form">
            <label className="campo">
              <span>Código</span>
              <input placeholder="Código" value={nuevo.codigo} onChange={(e) => setNuevo((n) => ({ ...n, codigo: e.target.value }))} style={{ width: 110 }} />
            </label>
            <label className="campo" style={{ flex: 1, minWidth: 180 }}>
              <span>Descripción</span>
              <input placeholder="Descripción" value={nuevo.descripcion} onChange={(e) => setNuevo((n) => ({ ...n, descripcion: e.target.value }))} required />
            </label>
            <label className="campo">
              <span>Categoría</span>
              <input placeholder="Categoría" value={nuevo.categoria} onChange={(e) => setNuevo((n) => ({ ...n, categoria: e.target.value }))} style={{ width: 140 }} />
            </label>
            <label className="campo">
              <span>Stock</span>
              <input type="text" inputMode="decimal" placeholder="Stock" value={nuevo.stock} onChange={(e) => setNuevo((n) => ({ ...n, stock: e.target.value }))} style={{ width: 90 }} />
            </label>
            <label className="campo">
              <span>{nuevo.costoMoneda === 'ARS' ? 'Costo en $' : 'Costo en USD'}</span>
              <input
                type="text" inputMode="decimal"
                placeholder={nuevo.costoMoneda === 'ARS' ? 'Costo en $' : 'Costo en USD'}
                value={nuevo.costo}
                onChange={(e) => setNuevo((n) => ({ ...n, costo: e.target.value }))}
                style={{ width: 120 }}
              />
            </label>
            <label className="campo">
              <span>Moneda</span>
              <select
                value={nuevo.costoMoneda}
                onChange={(e) => setNuevo((n) => ({ ...n, costoMoneda: e.target.value }))}
                title="Moneda en la que estás cargando el costo"
                style={{ width: 80 }}
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </label>
            <label className="campo">
              <span>IVA % (opcional)</span>
              <input type="text" inputMode="decimal" placeholder="IVA %" value={nuevo.iva_pct} onChange={(e) => setNuevo((n) => ({ ...n, iva_pct: e.target.value }))} style={{ width: 120 }} />
            </label>
            <label className="campo">
              <span>Envío % (opcional)</span>
              <input type="text" inputMode="decimal" placeholder="Envío %" value={nuevo.envio_pct} onChange={(e) => setNuevo((n) => ({ ...n, envio_pct: e.target.value }))} style={{ width: 130 }} />
            </label>
            <label className="campo">
              <span>Margen % (opcional)</span>
              <input type="text" inputMode="decimal" placeholder="Margen %" value={nuevo.margen_venta_pct} onChange={(e) => setNuevo((n) => ({ ...n, margen_venta_pct: e.target.value }))} style={{ width: 140 }} />
            </label>
            <label className="campo">
              <span>Precio manual ARS (opcional)</span>
              <input type="text" inputMode="decimal" placeholder="Precio manual ARS" value={nuevo.precio_manual_ars} onChange={(e) => setNuevo((n) => ({ ...n, precio_manual_ars: e.target.value }))} style={{ width: 170 }} />
            </label>
            <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </form>
          {(() => {
            const preview = previsualizarPrecio(nuevo, configFull, cotizacion);
            return preview ? (
              <p style={{ fontSize: 14, marginTop: 10, marginBottom: 0 }}>
                Precio de venta estimado: <strong>{formatoMoneda(preview.precio)}</strong>
                {preview.esManual && <span className="muted"> (precio manual)</span>}
              </p>
            ) : null;
          })()}
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Si no sabés el costo todavía, dejalo vacío y cargá un "Precio manual ARS": ese precio se usa tal cual, sin recalcular.
            Al costo se le suma primero el IVA%, y sobre ese resultado el envío% (costo final); son opcionales, y si los dejás vacíos usan el valor general de Configuración.
            El margen se aplica sobre ese costo final, y también es opcional — si no lo cargás, se usa el margen general de Configuración.
            {' '}Si el código ya existe, esto se toma como un <strong>restock</strong> (se suma stock nuevo al producto existente).
          </p>
        </div>
      )}

      {mostrarRecarga && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setMostrarRecarga(false); }}>
          <div className="modal-ventana modal-ventana-ancha">
            <div className="modal-header">
              <h2>Recarga: garrafa → gas x kg</h2>
              <button type="button" className="modal-cerrar" onClick={() => setMostrarRecarga(false)} aria-label="Cerrar">×</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Se descuenta 1 unidad de la garrafa elegida y el stock del gas x kg se reemplaza (no se suma) por la cantidad que traía esa garrafa.
            </p>
            <div className="modal-body">
              {recargaFilas.map((fila) => (
                <Fragment key={fila.id}>
                  <div className="recarga-fila">
                    <select
                      value={fila.garrafaId}
                      onChange={(e) => actualizarFilaRecarga(fila.id, 'garrafaId', e.target.value)}
                    >
                      <option value="">Elegí la garrafa...</option>
                      {productosTodos.map((p) => (
                        <option key={p.id} value={p.id}>{p.descripcion} (stock: {p.stock})</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="kg"
                      value={fila.cantidad}
                      onChange={(e) => actualizarFilaRecarga(fila.id, 'cantidad', e.target.value)}
                    />
                    <span className="recarga-flecha">→</span>
                    <select
                      value={fila.gasId}
                      onChange={(e) => actualizarFilaRecarga(fila.id, 'gasId', e.target.value)}
                    >
                      <option value="">Elegí el gas x kg...</option>
                      {productosTodos.map((p) => (
                        <option key={p.id} value={p.id}>{p.descripcion} (stock: {p.stock})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={recargaGuardandoId === fila.id}
                      onClick={() => confirmarRecarga(fila)}
                    >
                      {recargaGuardandoId === fila.id ? 'Recargando...' : 'Recargar'}
                    </button>
                    <button type="button" className="recarga-quitar" title="Quitar fila" onClick={() => quitarFilaRecarga(fila.id)}>×</button>
                    {recargaErrores[fila.id] && (
                      <div className="error-box">{recargaErrores[fila.id]}</div>
                    )}
                  </div>
                </Fragment>
              ))}
              <button type="button" className="btn-secondary" style={{ marginTop: 10, width: '100%' }} onClick={agregarFilaRecarga}>+ Agregar otra</button>
            </div>
          </div>
        </div>
      )}

      {detalleAbiertoId != null && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarEditar(); }}>
          <div className="modal-ventana modal-ventana-ancha">
            <div className="modal-header">
              <h2>Editar producto{generalForm.descripcion ? `: ${generalForm.descripcion}` : ''}</h2>
              <button type="button" className="modal-cerrar" onClick={cerrarEditar} aria-label="Cerrar">×</button>
            </div>
            <div className="modal-body">
              {cargandoDetalle && !detalleData && <div className="loading">Cargando...</div>}
              {errorDetalle && <div className="error-box">{errorDetalle}</div>}

              {detalleData && (() => {
                const p = productosCompletos.find((x) => x.id === detalleAbiertoId) || detalleData.producto;
                return (
                <>
                  {/* --- Datos generales (editables) --- */}
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Datos generales</p>
                  {errorGeneral && <div className="error-box">{errorGeneral}</div>}
                  <div className="form-row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                    <label className="campo">
                      <span>Código</span>
                      <input value={generalForm.codigo} onChange={(e) => setGeneralForm((f) => ({ ...f, codigo: e.target.value }))} style={{ width: 100 }} />
                    </label>
                    <label className="campo" style={{ flex: 1, minWidth: 180 }}>
                      <span>Descripción</span>
                      <input value={generalForm.descripcion} onChange={(e) => setGeneralForm((f) => ({ ...f, descripcion: e.target.value }))} />
                    </label>
                    <label className="campo">
                      <span>Categoría</span>
                      <input value={generalForm.categoria} onChange={(e) => setGeneralForm((f) => ({ ...f, categoria: e.target.value }))} style={{ width: 130 }} />
                    </label>
                    <label className="campo">
                      <span>Stock</span>
                      <input type="text" inputMode="decimal" value={generalForm.stock} onChange={(e) => setGeneralForm((f) => ({ ...f, stock: e.target.value }))} style={{ width: 80 }} />
                    </label>
                    <label className="campo">
                      <span>{generalForm.costoMoneda === 'ARS' ? 'Costo en $' : 'Costo en USD'}</span>
                      <input type="text" inputMode="decimal" value={generalForm.costo} onChange={(e) => setGeneralForm((f) => ({ ...f, costo: e.target.value }))} style={{ width: 100 }} />
                    </label>
                    <label className="campo">
                      <span>Moneda</span>
                      <select value={generalForm.costoMoneda} onChange={(e) => setGeneralForm((f) => ({ ...f, costoMoneda: e.target.value }))} style={{ width: 80 }}>
                        <option value="USD">USD</option>
                        <option value="ARS">ARS</option>
                      </select>
                    </label>
                    <label className="campo">
                      <span>IVA %</span>
                      <input type="text" inputMode="decimal" placeholder="—" value={generalForm.iva_pct} onChange={(e) => setGeneralForm((f) => ({ ...f, iva_pct: e.target.value }))} style={{ width: 80 }} />
                    </label>
                    <label className="campo">
                      <span>Envío %</span>
                      <input type="text" inputMode="decimal" placeholder="—" value={generalForm.envio_pct} onChange={(e) => setGeneralForm((f) => ({ ...f, envio_pct: e.target.value }))} style={{ width: 80 }} />
                    </label>
                    <label className="campo">
                      <span>Margen %</span>
                      <input type="text" inputMode="decimal" placeholder="—" value={generalForm.margen_venta_pct} onChange={(e) => setGeneralForm((f) => ({ ...f, margen_venta_pct: e.target.value }))} style={{ width: 80 }} />
                    </label>
                    <label className="campo">
                      <span>Precio manual ARS</span>
                      <input type="text" inputMode="decimal" placeholder="—" value={generalForm.precio_manual_ars} onChange={(e) => setGeneralForm((f) => ({ ...f, precio_manual_ars: e.target.value }))} style={{ width: 120 }} />
                    </label>
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>
                    El costo primero se le suma el IVA%, y sobre eso el envío% (costo final). El margen se aplica después, sobre el costo final convertido a pesos. Si dejás IVA/Envío/Margen vacíos, usan el valor general de Configuración.
                  </p>
                  {(() => {
                    const preview = previsualizarPrecio(generalForm, configFull, cotizacion);
                    return preview ? (
                      <p style={{ fontSize: 14, marginTop: 0, marginBottom: 10 }}>
                        Precio de venta estimado: <strong>{formatoMoneda(preview.precio)}</strong>
                        {preview.esManual && <span className="muted"> (precio manual)</span>}
                      </p>
                    ) : null;
                  })()}
                  <button type="button" className="btn-primary" disabled={guardandoGeneral} onClick={() => guardarGeneral(p)} style={{ marginBottom: 20 }}>
                    {guardandoGeneral ? 'Guardando...' : 'Guardar datos generales'}
                  </button>

                  {/* --- Resumen --- */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 20 }}>
                    <div style={{ minWidth: 220 }}>
                      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Resumen</p>
                      <p style={{ margin: '2px 0' }}>Costo final: <strong>{detalleData.costo_unitario_ars != null ? formatoMoneda(detalleData.costo_unitario_ars) : '—'}</strong></p>
                      <p style={{ margin: '2px 0' }}>Precio de venta: <strong>{detalleData.precio_ars != null ? formatoMoneda(detalleData.precio_ars) : '—'}</strong></p>
                      <p style={{ margin: '2px 0' }}>Stock: <strong>{detalleData.stock}</strong></p>
                      <p style={{ margin: '2px 0' }}>Cantidad vendida (histórico): <strong>{detalleData.cantidad_vendida}</strong></p>
                    </div>
                    <div style={{ minWidth: 220 }}>
                      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>En USD (solo acá)</p>
                      <p style={{ margin: '2px 0' }}>Cotización dólar hoy: <strong>{detalleData.cotizacion_dolar ? formatoMoneda(detalleData.cotizacion_dolar) : '—'}</strong></p>
                      <p style={{ margin: '2px 0' }}>Costo unitario: <strong>{detalleData.costo_unitario_usd != null ? formatoMoneda(detalleData.costo_unitario_usd, 'USD') : '—'}</strong></p>
                    </div>
                  </div>

                  {/* --- Lotes --- */}
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Lotes (historial de stock)</p>
                  {detalleData.lotes.length === 0 && <p className="muted" style={{ margin: '0 0 14px' }}>Sin lotes registrados.</p>}
                  {detalleData.lotes.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      {detalleData.lotes.map((l) => (
                        <div key={l.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                          {loteEditId === l.id ? (
                            <div>
                              {errorLote && <div className="error-box">{errorLote}</div>}
                              <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
                                <input type="text" inputMode="decimal" placeholder="Cantidad" value={loteEditForm.cantidad} onChange={(e) => setLoteEditForm((f) => ({ ...f, cantidad: e.target.value }))} style={{ width: 90 }} />
                                <input type="text" inputMode="decimal" placeholder={loteEditForm.costoMoneda === 'ARS' ? 'Costo en $' : 'Costo en USD'} value={loteEditForm.costo} onChange={(e) => setLoteEditForm((f) => ({ ...f, costo: e.target.value }))} style={{ width: 110 }} />
                                <select value={loteEditForm.costoMoneda} onChange={(e) => setLoteEditForm((f) => ({ ...f, costoMoneda: e.target.value }))} style={{ width: 80 }}>
                                  <option value="USD">USD</option>
                                  <option value="ARS">ARS</option>
                                </select>
                                <input type="text" inputMode="decimal" placeholder="IVA % (opcional)" value={loteEditForm.iva_pct} onChange={(e) => setLoteEditForm((f) => ({ ...f, iva_pct: e.target.value }))} style={{ width: 120 }} />
                                <input type="text" inputMode="decimal" placeholder="Envío % (opcional)" value={loteEditForm.envio_pct} onChange={(e) => setLoteEditForm((f) => ({ ...f, envio_pct: e.target.value }))} style={{ width: 130 }} />
                                <input type="text" inputMode="decimal" placeholder="Margen %" value={loteEditForm.margen_venta_pct} onChange={(e) => setLoteEditForm((f) => ({ ...f, margen_venta_pct: e.target.value }))} style={{ width: 100 }} />
                                <button type="button" className="btn-primary" disabled={guardandoLote} onClick={() => guardarLote(detalleAbiertoId, l.id)}>
                                  {guardandoLote ? 'Guardando...' : 'Guardar lote'}
                                </button>
                                <button type="button" className="btn-secondary" onClick={cerrarEditarLote}>Cancelar</button>
                              </div>
                              <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                                El costo acá es el costo BASE del lote (antes de IVA/envío) -- se recalcula el costo final solo.
                                {l.costo_usd_base == null && ' Este lote es anterior a esta función y no tenía el desglose guardado: el costo ya viene precargado con el costo final de entonces -- revisalo antes de guardar.'}
                              </p>
                              {(() => {
                                const preview = previsualizarPrecio(loteEditForm, configFull, cotizacion);
                                return preview ? (
                                  <p style={{ fontSize: 14, marginTop: 6, marginBottom: 0 }}>
                                    Precio de venta estimado con este lote: <strong>{formatoMoneda(preview.precio)}</strong>
                                  </p>
                                ) : null;
                              })()}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span>{l.cantidad} producto{Number(l.cantidad) === 1 ? '' : 's'} · {formatoPct(l.margen_venta_pct)} ganancia · {formatoFecha(l.fecha)}</span>
                              <button type="button" className="btn-link" onClick={() => abrirEditarLote(l)}>Editar</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* --- Restock rápido --- */}
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>+ Nuevo restock (lote nuevo)</p>
                  {errorRestock && <div className="error-box">{errorRestock}</div>}
                  <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
                    <input
                      type="text" inputMode="decimal"
                      placeholder="Cantidad que entró"
                      value={restockForm.cantidad}
                      onChange={(e) => setRestockForm((f) => ({ ...f, cantidad: e.target.value }))}
                      style={{ width: 140 }}
                    />
                    <input
                      type="text" inputMode="decimal"
                      placeholder={restockForm.costoMoneda === 'ARS' ? 'Costo en $' : 'Costo en USD'}
                      value={restockForm.costo}
                      onChange={(e) => setRestockForm((f) => ({ ...f, costo: e.target.value }))}
                      style={{ width: 120 }}
                    />
                    <select
                      value={restockForm.costoMoneda}
                      onChange={(e) => setRestockForm((f) => ({ ...f, costoMoneda: e.target.value }))}
                      style={{ width: 80 }}
                    >
                      <option value="USD">USD</option>
                      <option value="ARS">ARS</option>
                    </select>
                    <input type="text" inputMode="decimal" placeholder="IVA % (opcional)" value={restockForm.iva_pct} onChange={(e) => setRestockForm((f) => ({ ...f, iva_pct: e.target.value }))} style={{ width: 120 }} />
                    <input type="text" inputMode="decimal" placeholder="Envío % (opcional)" value={restockForm.envio_pct} onChange={(e) => setRestockForm((f) => ({ ...f, envio_pct: e.target.value }))} style={{ width: 130 }} />
                    <input type="text" inputMode="decimal" placeholder="Margen % (opcional)" value={restockForm.margen_venta_pct} onChange={(e) => setRestockForm((f) => ({ ...f, margen_venta_pct: e.target.value }))} style={{ width: 140 }} />
                    <button type="button" className="btn-primary" disabled={guardandoRestock} onClick={() => confirmarRestock(p)}>
                      {guardandoRestock ? 'Guardando...' : 'Confirmar restock'}
                    </button>
                  </div>
                  {(() => {
                    const preview = previsualizarPrecio(restockForm, configFull, cotizacion);
                    return preview ? (
                      <p style={{ fontSize: 14, marginTop: 8, marginBottom: 0 }}>
                        Precio de venta estimado con este lote: <strong>{formatoMoneda(preview.precio)}</strong>
                      </p>
                    ) : null;
                  })()}
                  <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                    Si dejás IVA/Envío/Margen vacíos, se usa lo que ya tenía el producto (o el general de Configuración).
                  </p>
                </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {mostrarMargenMasivo && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Actualizar margen de ganancia (masivo)</h2>
          <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <select value={margenMasivoModo} onChange={(e) => setMargenMasivoModo(e.target.value)}>
              <option value="seleccion">Selección manual ({seleccionados.size} marcado{seleccionados.size === 1 ? '' : 's'})</option>
              <option value="categoria">Por categoría</option>
              <option value="todos">Todos los productos</option>
            </select>
            {margenMasivoModo === 'categoria' && (
              <select value={margenMasivoCategoria} onChange={(e) => setMargenMasivoCategoria(e.target.value)}>
                <option value="">Elegí una categoría...</option>
                {categorias.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.cantidad_productos})</option>)}
              </select>
            )}
            <input
              type="text" inputMode="decimal"
              placeholder="Margen % nuevo"
              value={margenMasivoValor}
              onChange={(e) => setMargenMasivoValor(e.target.value)}
              style={{ width: 140 }}
            />
            <button type="button" className="btn-primary" onClick={aplicarMargenMasivo} disabled={aplicandoMargen || margenMasivoValor === ''}>
              {aplicandoMargen ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
          {margenMasivoModo === 'seleccion' && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Marcá los productos con el checkbox de la tabla (podés usar "seleccionar todos" en el encabezado para esta página).
            </p>
          )}
          {margenMasivoModo === 'todos' && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
              Esto va a cambiar el margen de <strong>todos</strong> los productos activos, no solo los de esta página.
            </p>
          )}
        </div>
      )}

      {mostrarImportar && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Importar productos desde Excel</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            En Excel o Google Sheets: <strong>Archivo → Guardar como / Exportar → CSV</strong>, y subí ese archivo acá.
            Columnas que reconoce (no hace falta que estén todas, ni en ese orden): <code>codigo</code>, <code>descripcion</code>, <code>costo</code>, <code>stock</code>, <code>categoria</code>, <code>margen</code>, <code>envio</code>, <code>iva</code>.
            Si el código ya existe, esa fila se suma como restock en vez de crear un producto duplicado.
          </p>
          <div className="form-row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <label className="muted" style={{ fontSize: 12 }}>
              La columna "costo" de esta planilla es:{' '}
              <select value={importCostoTipo} onChange={(e) => setImportCostoTipo(e.target.value)} style={{ marginLeft: 4 }}>
                <option value="unitario">costo de 1 unidad</option>
                <option value="total">costo total de esa fila (se divide por el stock)</option>
              </select>
            </label>
            <label className="muted" style={{ fontSize: 12 }}>
              está en:{' '}
              <select value={importCostoMoneda} onChange={(e) => setImportCostoMoneda(e.target.value)} style={{ marginLeft: 4 }}>
                <option value="USD">USD</option>
                <option value="ARS">Pesos (ARS)</option>
              </select>
            </label>
          </div>
          {errorImportar && <div className="error-box">{errorImportar}</div>}
          <input type="file" accept=".csv,text/csv" onChange={elegirArchivoImportar} disabled={importando} />

          {filasImportar.length > 0 && (
            <>
              <p style={{ marginTop: 12, marginBottom: 6, fontSize: 13 }}>
                Se leyeron <strong>{filasImportar.length}</strong> fila{filasImportar.length === 1 ? '' : 's'}. Vista previa:
              </p>
              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
                <table className="simple-table">
                  <thead><tr><th>Código</th><th>Descripción</th><th>Costo</th><th>Stock</th><th>Categoría</th><th>Margen</th></tr></thead>
                  <tbody>
                    {filasImportar.slice(0, 20).map((f, i) => (
                      <tr key={i}>
                        <td>{f.codigo || <span className="muted">—</span>}</td>
                        <td>{f.descripcion}</td>
                        <td>{f.costo || <span className="muted">—</span>}</td>
                        <td>{f.stock || <span className="muted">0</span>}</td>
                        <td>{f.categoria || <span className="muted">—</span>}</td>
                        <td>{f.margen_venta_pct || <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filasImportar.length > 20 && (
                  <p className="muted" style={{ fontSize: 12 }}>...y {filasImportar.length - 20} más.</p>
                )}
              </div>
              <button type="button" className="btn-primary" onClick={confirmarImportar} disabled={importando}>
                {importando ? `Importando... ${progresoImportar || ''}` : `Importar ${filasImportar.length} producto${filasImportar.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}

          {resultadoImportar && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <p style={{ margin: 0 }}>
                Listo: <strong>{resultadoImportar.creados}</strong> producto{resultadoImportar.creados === 1 ? '' : 's'} nuevo{resultadoImportar.creados === 1 ? '' : 's'},{' '}
                <strong>{resultadoImportar.restockeados}</strong> restock{resultadoImportar.restockeados === 1 ? '' : 's'},{' '}
                {resultadoImportar.errores.length} error{resultadoImportar.errores.length === 1 ? '' : 'es'} (de {resultadoImportar.total} filas).
              </p>
              {resultadoImportar.errores.length > 0 && (
                <ul style={{ marginTop: 8, color: 'var(--danger, #b91c1c)', fontSize: 12 }}>
                  {resultadoImportar.errores.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="date-filters" style={{ marginBottom: 14 }}>
        <input
          placeholder="Buscar por código o descripción..."
          value={q}
          onChange={(e) => buscarEnVivo(e.target.value)}
          style={{ flex: 1, maxWidth: 320 }}
        />
        <select value={categoriaFiltro} onChange={(e) => filtrarCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.cantidad_productos})</option>)}
        </select>
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : (
          <>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={productosVisibles.length > 0 && productosVisibles.every((p) => seleccionados.has(p.id))}
                      onChange={toggleSeleccionarTodosVisibles}
                      title="Seleccionar todos (esta página)"
                    />
                  </th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Stock</th>
                  <th>Costo final</th>
                  <th>Precio</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {productosVisibles.length === 0 && (
                  <tr><td colSpan={8} className="muted">Sin productos que coincidan</td></tr>
                )}
                {productosVisibles.map((p) => (
                  <Fragment key={p.id}>
                  <tr className={flashId === p.id ? 'fila-flash' : ''}>
                    <td>
                      <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggleSeleccionado(p.id)} />
                    </td>
                    <td>
                      <input
                        className="input-inline"
                        defaultValue={p.codigo || ''}
                        onBlur={(e) => guardarCampo(p.id, 'codigo', e.target.value)}
                        style={{ width: 90 }}
                      />
                    </td>
                    <td>
                      <input
                        className="input-inline"
                        defaultValue={p.descripcion || ''}
                        onBlur={(e) => guardarCampo(p.id, 'descripcion', e.target.value)}
                        style={{ width: '100%', minWidth: 280 }}
                      />
                    </td>
                    <td>
                      <input
                        className="input-inline"
                        defaultValue={p.categoria || ''}
                        onBlur={(e) => guardarCampo(p.id, 'categoria', e.target.value)}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text" inputMode="decimal"
                        className={`input-inline ${Number(p.stock) <= 0 ? 'valor-critico' : Number(p.stock) <= 3 ? 'valor-alerta' : ''}`}
                        defaultValue={p.stock ?? ''}
                        onChange={(e) => actualizarLocal(p.id, 'stock', e.target.value)}
                        onBlur={(e) => guardarCampo(p.id, 'stock', parseNumero(e.target.value) ?? 0)}
                        style={{ width: 70 }}
                        title={Number(p.stock) <= 0 ? 'Sin stock' : Number(p.stock) <= 3 ? 'Stock bajo' : undefined}
                      />
                    </td>
                    <td>
                      {p.costo_final_ars == null ? <span className="muted">—</span> : formatoMoneda(p.costo_final_ars)}
                    </td>
                    <td>
                      {p.precio == null ? (
                        <span className="muted">Sin costo/precio</span>
                      ) : (
                        formatoMoneda(p.precio)
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => abrirEditar(p)} className="btn-link">
                        {detalleAbiertoId === p.id ? 'Cerrar' : 'Editar'}
                      </button>
                      {' · '}
                      <button type="button" onClick={() => eliminarProducto(p.id)} disabled={eliminandoId === p.id} className="btn-link-danger">
                        {eliminandoId === p.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>

            <div className="paginacion-bar">
              <span className="muted" style={{ fontSize: 13 }}>{total} producto{total === 1 ? '' : 's'}</span>
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
