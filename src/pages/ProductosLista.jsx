import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { parseNumero } from '../utils/numero';
import { coincideTexto } from '../utils/busqueda';
import { useUi } from '../context/UiContext';
import Miniatura from '../components/Miniatura';
import TextareaAuto from '../components/TextareaAuto';
import BuscadorProducto from '../components/BuscadorProducto';
import ImagenesProducto from '../components/ImagenesProducto';
import OfertaModal from '../components/OfertaModal';
import { ofertaVigente, textoOferta, hoyArgentina } from '../utils/ofertas';
import { labelMetodo } from '../utils/pagos';

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
const RESTOCK_VACIO = { cantidad: '', costo: '', costoMoneda: 'ARS', envio_pct: '0', iva_pct: '0', margen_venta_pct: '' };

// Íconos chicos para la barra de herramientas.
function Icono({ d, children }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  );
}
const ICONOS = {
  oferta: <Icono><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.3" /></Icono>,
  gas: <Icono><path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-7.5Z" /></Icono>,
  margen: <Icono><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.2" /><circle cx="17" cy="17" r="2.2" /></Icono>,
  excel: <Icono><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></Icono>,
  flecha: <Icono d="m6 9 6 6 6-6" />,
};

// Botón con menú desplegable (Margen ▾, Excel ▾).
function MenuBoton({ icono, label, items }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="menu-acciones">
      <button type="button" className={`btn-tool${abierto ? ' activo' : ''}`} onClick={() => setAbierto((a) => !a)}>
        {icono}<span>{label}</span><span className="btn-tool-flecha">{ICONOS.flecha}</span>
      </button>
      {abierto && (
        <>
          <div className="menu-acciones-fondo" onClick={() => setAbierto(false)} />
          <div className="menu-acciones-lista menu-herramientas">
            {items.map((it) => (
              <button key={it.label} type="button" disabled={it.disabled} onClick={() => { setAbierto(false); it.onClick(); }}>
                <strong>{it.label}</strong>
                {it.descripcion && <small>{it.descripcion}</small>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Restock: IVA y envío arrancan con los del producto (o 0), nunca vacíos.
function restockDesdeProducto(p) {
  return { ...RESTOCK_VACIO, iva_pct: String(p?.iva_pct ?? 0), envio_pct: String(p?.envio_pct ?? 0) };
}

const VACIO = { codigo: '', descripcion: '', categoria: '', stock: '', costo: '', costoMoneda: 'ARS', precio_manual_ars: '', margen_venta_pct: '', envio_pct: '0', iva_pct: '0' };

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

export default function ProductosLista() {
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
  // Se incrementa cada vez que se recarga la tabla desde el servidor: los
  // inputs de la tabla son "defaultValue" (no controlados) y usan esto como
  // key para mostrar el valor nuevo después de editar en el modal.
  const [versionTabla, setVersionTabla] = useState(0);
  const [menuAbiertoId, setMenuAbiertoId] = useState(null);

  // --- Ofertas ---
  const [ofertaProducto, setOfertaProducto] = useState(null); // producto con la ventana de oferta abierta
  const [mostrarSelectorOferta, setMostrarSelectorOferta] = useState(false);
  const [busquedaOferta, setBusquedaOferta] = useState('');
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
  // Si el lote nuevo sale más barato: mantener el precio de venta actual (por defecto sí).
  const [mantenerPrecio, setMantenerPrecio] = useState(true);

  // --- Actualizacion masiva de margen de ganancia ---
  const [mostrarMargenMasivo, setMostrarMargenMasivo] = useState(false);
  const [margenOperacion, setMargenOperacion] = useState('fijar'); // 'fijar' | 'sumar'
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
  const [exportando, setExportando] = useState(false);

  // Excel para control de stock: TODOS los productos activos (no solo la
  // pagina/busqueda actual), de la A a la Z, para imprimir y tildar en el
  // local -- trae el archivo ya armado del backend (ver GET
  // /productos/exportar) y lo descarga como si fuera un link normal.
  async function exportarExcel(tipo) {
    setExportando(true);
    try {
      const blob = await api.get(tipo === 'precios' ? '/productos/exportar-precios' : '/productos/exportar');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tipo === 'precios' ? 'precios' : 'control-stock'}-${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Cordoba' })}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, { type: 'error', duration: 5000 });
    } finally {
      setExportando(false);
    }
  }

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

  // Recarga la tabla en silencio (sin el cartel de "Cargando...") después
  // de crear o editar un producto, para que se vea el precio/costo/stock
  // nuevo sin tener que recargar la página.
  async function refrescarTabla() {
    try {
      const dataProductos = await api.get('/productos', { pageSize: 5000, categoria: categoriaFiltro || undefined });
      setProductosCompletos(dataProductos.productos);
      setVersionTabla((v) => v + 1);
    } catch {
      // si falla, queda lo que había; no es grave
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
      envio_pct: p.envio_pct ?? '0',
      iva_pct: p.iva_pct ?? '0',
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
    setRestockForm(restockDesdeProducto(producto));
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
        envio_pct: parseNumero(generalForm.envio_pct) ?? 0,
        iva_pct: parseNumero(generalForm.iva_pct) ?? 0,
      });
      await refrescarDetalle(producto.id);
      await refrescarTabla();
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
      envio_pct: lote.envio_pct ?? '0',
      iva_pct: lote.iva_pct ?? '0',
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
        envio_pct: parseNumero(loteEditForm.envio_pct) ?? 0,
        iva_pct: parseNumero(loteEditForm.iva_pct) ?? 0,
        margen_venta_pct: parseNumero(loteEditForm.margen_venta_pct),
      });
      setLoteEditId(null);
      await refrescarDetalle(productoId);
      await refrescarTabla();
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
        envio_pct: parseNumero(restockForm.envio_pct) ?? 0,
        iva_pct: parseNumero(restockForm.iva_pct) ?? 0,
        margen_venta_pct: parseNumero(restockForm.margen_venta_pct),
        mantener_precio: mantenerPrecio,
      });
      setMantenerPrecio(true);
      setRestockForm(restockDesdeProducto({ ...producto, ...resultado }));
      setProductosCompletos((prev) => prev.map((p) => (p.id === resultado.id ? { ...p, ...resultado } : p)));
      toast(resultado.mensaje || 'Restock registrado ✓', { duration: 5000 });
      await refrescarDetalle(producto.id);
      await refrescarTabla();
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
      const valor = parseNumero(margenMasivoValor);
      if (valor == null) throw new Error('Poné un número');
      const body = margenOperacion === 'sumar' ? { puntos: valor } : { margen_venta_pct: valor };
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
      const resultado = await api.put(margenOperacion === 'sumar' ? '/productos/aumentar-margen' : '/productos/margen-masivo', body);
      const queHizo = margenOperacion === 'sumar'
        ? `Margen ${valor >= 0 ? 'aumentado' : 'bajado'} ${Math.abs(valor)} puntos`
        : `Margen actualizado a ${margenMasivoValor}%`;
      toast(`${queHizo} en ${descripcionAplicado} (${resultado.actualizados} producto${resultado.actualizados === 1 ? '' : 's'}).`, { duration: 5000 });
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
        envio_pct: parseNumero(nuevo.envio_pct) ?? 0,
        iva_pct: parseNumero(nuevo.iva_pct) ?? 0,
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
      await refrescarTabla();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="productos-toolbar">
        <h1>Productos</h1>
        <div className="toolbar-acciones">
          <button type="button" className="btn-tool" onClick={() => { setBusquedaOferta(''); setMostrarSelectorOferta(true); }}>
            {ICONOS.oferta}<span>Oferta</span>
          </button>
          <button type="button" className={`btn-tool${mostrarRecarga ? ' activo' : ''}`} onClick={abrirRecarga}>
            {ICONOS.gas}<span>Recarga gas</span>
          </button>
          <MenuBoton
            icono={ICONOS.margen}
            label="Margen"
            items={[
              { label: 'Fijar margen', descripcion: 'Poner un margen nuevo (ej. 45%)', onClick: () => { setMargenOperacion('fijar'); setMostrarMargenMasivo(true); } },
              { label: 'Aumentar margen', descripcion: 'Sumar puntos al margen actual (ej. +5)', onClick: () => { setMargenOperacion('sumar'); setMostrarMargenMasivo(true); } },
            ]}
          />
          <MenuBoton
            icono={ICONOS.excel}
            label={exportando ? 'Generando...' : 'Excel'}
            items={[
              { label: 'Exportar stock', descripcion: 'Planilla para controlar el stock', onClick: () => exportarExcel('stock'), disabled: exportando },
              { label: 'Exportar precios', descripcion: 'Costos finales, precios y total del stock', onClick: () => exportarExcel('precios'), disabled: exportando },
              { label: 'Importar productos (CSV)', descripcion: 'Cargar o reponer desde una planilla', onClick: () => setMostrarImportar(true) },
            ]}
          />
          <button type="button" className="btn-primary btn-tool-primario" onClick={() => setMostrarForm((m) => !m)}>
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
              <span>IVA %</span>
              <input type="text" inputMode="decimal" placeholder="IVA %" value={nuevo.iva_pct} onChange={(e) => setNuevo((n) => ({ ...n, iva_pct: e.target.value }))} style={{ width: 120 }} />
            </label>
            <label className="campo">
              <span>Envío %</span>
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
                    <BuscadorProducto
                      productos={productosTodos}
                      value={fila.garrafaId}
                      onChange={(id) => actualizarFilaRecarga(fila.id, 'garrafaId', id)}
                      placeholder="Garrafa (buscá ej. r410 11)"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="kg"
                      value={fila.cantidad}
                      onChange={(e) => actualizarFilaRecarga(fila.id, 'cantidad', e.target.value)}
                    />
                    <span className="recarga-flecha">→</span>
                    <BuscadorProducto
                      productos={productosTodos}
                      value={fila.gasId}
                      onChange={(id) => actualizarFilaRecarga(fila.id, 'gasId', id)}
                      placeholder="Gas x kg (buscá ej. r410 kg)"
                    />
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
                    El costo primero se le suma el IVA%, y sobre eso el envío% (costo final). El margen se aplica después, sobre el costo final convertido a pesos. IVA y envío vacíos se guardan como 0. Si dejás el margen vacío, usa el margen general de Configuración.
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

                  {/* --- Oferta --- */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 16px' }}>
                    <span style={{ fontWeight: 600 }}>Oferta:</span>
                    {ofertaVigente(p)
                      ? <span><span className="badge-oferta">OFERTA</span> {textoOferta(p, labelMetodo, formatoMoneda)}</span>
                      : <span className="muted">{Number(p.oferta_precio) > 0 ? 'vencida' : 'sin oferta'}</span>}
                    <button type="button" className="btn-secondary" onClick={() => setOfertaProducto(p)}>
                      {Number(p.oferta_precio) > 0 ? 'Editar oferta' : 'Nueva oferta'}
                    </button>
                  </div>

                  {/* --- Imágenes (solo vendedor) --- */}
                  <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Imágenes</p>
                  <div style={{ marginBottom: 18 }}>
                    <ImagenesProducto
                      productoId={p.id}
                      onCambio={(cantidad) => setProductosCompletos((prev) => prev.map((x) => (x.id === p.id ? { ...x, cantidad_imagenes: cantidad } : x)))}
                    />
                  </div>

                  {/* --- Resumen --- */}
                  <div className="detalle-cards">
                    <div className="detalle-card">
                      <span>Precio de venta</span>
                      <strong>{detalleData.precio_ars != null ? formatoMoneda(detalleData.precio_ars) : '—'}</strong>
                      <small>Lista {detalleData.precio_lista_ars != null ? formatoMoneda(detalleData.precio_lista_ars) : '—'}</small>
                    </div>
                    <div className="detalle-card">
                      <span>Costo hoy (por unidad)</span>
                      <strong>{detalleData.costo_unitario_ars != null ? formatoMoneda(detalleData.costo_unitario_ars) : '—'}</strong>
                      <small>{detalleData.costo_unitario_usd != null ? `${formatoMoneda(detalleData.costo_unitario_usd, 'USD')} · dólar ${formatoMoneda(detalleData.cotizacion_dolar)}` : 'Sin costo cargado'}</small>
                    </div>
                    <div className="detalle-card">
                      <span>Margen actual</span>
                      <strong>{p.precio_manual_ars != null ? 'Precio manual' : formatoPct(detalleData.margen_actual_pct)}</strong>
                      <small>{p.margen_venta_pct != null ? 'propio del producto' : 'el general de Configuración'}</small>
                    </div>
                    <div className="detalle-card">
                      <span>Stock</span>
                      <strong>{detalleData.stock}</strong>
                      <small>Pagaste {formatoMoneda(detalleData.stock_valorizado_ars)}</small>
                    </div>
                    <div className="detalle-card">
                      <span>Vendidos (total)</span>
                      <strong>{detalleData.cantidad_vendida}</strong>
                      <small>&nbsp;</small>
                    </div>
                  </div>

                  {/* --- Lotes --- */}
                  <p style={{ margin: '18px 0 4px', fontWeight: 600 }}>Lotes</p>
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
                    "Al cargar" es la foto de cuando entró el lote (no cambia nunca). "Ganancia hoy" compara lo que pagaste por ese lote con el precio de venta actual.
                  </p>
                  {detalleData.lotes.length === 0 && <p className="muted" style={{ margin: '0 0 14px' }}>Sin lotes registrados.</p>}
                  {detalleData.lotes.length > 0 && (
                    <div className="tabla-scroll" style={{ marginBottom: 18 }}>
                      <table className="simple-table tabla-lotes">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Quedan</th>
                            <th className="num">Costo pagado</th>
                            <th className="num">Al cargar</th>
                            <th className="num">Ganancia hoy</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {detalleData.lotes.map((l) => {
                            const quedan = Number(l.cantidad);
                            const entraron = Number(l.cantidad_original) || quedan;
                            const pctQuedan = entraron > 0 ? Math.min(100, (quedan / entraron) * 100) : 0;
                            if (loteEditId === l.id) {
                              return (
                                <tr key={l.id}>
                                  <td colSpan={6}>
                            <div>
                              {errorLote && <div className="error-box">{errorLote}</div>}
                              <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
                                <input type="text" inputMode="decimal" placeholder="Cantidad" value={loteEditForm.cantidad} onChange={(e) => setLoteEditForm((f) => ({ ...f, cantidad: e.target.value }))} style={{ width: 90 }} />
                                <input type="text" inputMode="decimal" placeholder={loteEditForm.costoMoneda === 'ARS' ? 'Costo en $' : 'Costo en USD'} value={loteEditForm.costo} onChange={(e) => setLoteEditForm((f) => ({ ...f, costo: e.target.value }))} style={{ width: 110 }} />
                                <select value={loteEditForm.costoMoneda} onChange={(e) => setLoteEditForm((f) => ({ ...f, costoMoneda: e.target.value }))} style={{ width: 80 }}>
                                  <option value="USD">USD</option>
                                  <option value="ARS">ARS</option>
                                </select>
                                <label className="campo-mini"><span>IVA %</span><input type="text" inputMode="decimal" placeholder="0" value={loteEditForm.iva_pct} onChange={(e) => setLoteEditForm((f) => ({ ...f, iva_pct: e.target.value }))} style={{ width: 70 }} /></label>
                                <label className="campo-mini"><span>Envío %</span><input type="text" inputMode="decimal" placeholder="0" value={loteEditForm.envio_pct} onChange={(e) => setLoteEditForm((f) => ({ ...f, envio_pct: e.target.value }))} style={{ width: 70 }} /></label>
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
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={l.id} className={quedan <= 0 ? 'lote-agotado' : ''}>
                                <td>
                                  {formatoFecha(l.fecha)}
                                  <div className="muted" style={{ fontSize: 11 }}>
                                    {l.tipo === 'ajuste' ? 'Ajuste' : l.tipo === 'recarga' ? 'Recarga' : 'Compra'}
                                    {l.aproximado && <span className="chip-aprox" title="Lote cargado antes de este cambio: el dólar de compra es estimado (el de cuando se actualizó el sistema).">aprox.</span>}
                                  </div>
                                </td>
                                <td style={{ minWidth: 110 }}>
                                  <div style={{ fontSize: 13 }}>{quedan <= 0 ? 'Agotado' : `${quedan} de ${entraron}`}</div>
                                  <div className="barra-lote"><span style={{ width: `${pctQuedan}%` }} /></div>
                                </td>
                                <td className="num">
                                  {l.costo_ars != null ? formatoMoneda(Number(l.costo_ars)) : '—'}
                                  <div className="muted" style={{ fontSize: 11 }}>
                                    {formatoMoneda(Number(l.costo_usd), 'USD')}{l.cotizacion != null ? ` · dólar ${formatoMoneda(Number(l.cotizacion))}` : ''}
                                  </div>
                                </td>
                                <td className="num">
                                  {l.precio_venta_ars != null ? formatoMoneda(Number(l.precio_venta_ars)) : '—'}
                                  <div className="muted" style={{ fontSize: 11 }}>margen {formatoPct(l.margen_venta_pct)}</div>
                                </td>
                                <td className="num">
                                  {l.ganancia_hoy_pct != null ? (
                                    <>
                                      <span className={l.ganancia_hoy_pct >= 0 ? 'texto-positivo' : 'texto-negativo'}>{formatoPct(l.ganancia_hoy_pct)}</span>
                                      <div className="muted" style={{ fontSize: 11 }}>{formatoMoneda(l.ganancia_hoy_ars)} por unidad</div>
                                    </>
                                  ) : '—'}
                                </td>
                                <td><button type="button" className="btn-link" onClick={() => abrirEditarLote(l)}>Editar</button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* --- Últimas ventas --- */}
                  {detalleData.ventas_recientes?.length > 0 && (
                    <>
                      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Últimas ventas</p>
                      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Ganancia bruta: lo cobrado menos lo que pagaste (antes de IVA y comisiones).</p>
                      <div className="tabla-scroll" style={{ marginBottom: 18 }}>
                        <table className="simple-table">
                          <thead><tr><th>Fecha</th><th>Venta</th><th className="num">Cant.</th><th className="num">Cobrado</th><th className="num">Costo</th><th className="num">Ganancia</th></tr></thead>
                          <tbody>
                            {detalleData.ventas_recientes.map((v) => (
                              <tr key={`${v.venta_id}-${v.cantidad}-${v.cobrado}`}>
                                <td>{formatoFecha(v.fecha)}</td>
                                <td>#{v.numero}</td>
                                <td className="num">{v.cantidad}</td>
                                <td className="num">{formatoMoneda(v.cobrado)}</td>
                                <td className="num">{v.costo != null ? formatoMoneda(v.costo) : <span className="muted">—</span>}</td>
                                <td className="num">
                                  {v.ganancia != null
                                    ? <span className={v.ganancia >= 0 ? 'texto-positivo' : 'texto-negativo'}>{formatoMoneda(v.ganancia)}</span>
                                    : <span className="muted" title="Venta anterior a este cambio: no se guardó el costo">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
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
                    <label className="campo-mini"><span>IVA %</span><input type="text" inputMode="decimal" placeholder="0" value={restockForm.iva_pct} onChange={(e) => setRestockForm((f) => ({ ...f, iva_pct: e.target.value }))} style={{ width: 70 }} /></label>
                    <label className="campo-mini"><span>Envío %</span><input type="text" inputMode="decimal" placeholder="0" value={restockForm.envio_pct} onChange={(e) => setRestockForm((f) => ({ ...f, envio_pct: e.target.value }))} style={{ width: 70 }} /></label>
                    <input type="text" inputMode="decimal" placeholder="Margen % (opcional)" value={restockForm.margen_venta_pct} onChange={(e) => setRestockForm((f) => ({ ...f, margen_venta_pct: e.target.value }))} style={{ width: 140 }} />
                    <button type="button" className="btn-primary" disabled={guardandoRestock} onClick={() => confirmarRestock(p)}>
                      {guardandoRestock ? 'Guardando...' : 'Confirmar restock'}
                    </button>
                  </div>
                  {(() => {
                    // Lo que no se carga en el restock se toma del producto (igual que el backend).
                    const conValoresDelProducto = {
                      ...restockForm,
                      precio_manual_ars: '',
                      iva_pct: restockForm.iva_pct !== '' ? restockForm.iva_pct : (p.iva_pct != null ? String(p.iva_pct) : ''),
                      envio_pct: restockForm.envio_pct !== '' ? restockForm.envio_pct : (p.envio_pct != null ? String(p.envio_pct) : ''),
                      margen_venta_pct: restockForm.margen_venta_pct !== '' ? restockForm.margen_venta_pct : (p.margen_venta_pct != null ? String(p.margen_venta_pct) : ''),
                    };
                    const preview = previsualizarPrecio(conValoresDelProducto, configFull, cotizacion);
                    if (!preview) return null;
                    const precioActual = detalleData.precio_ars;
                    const baja = precioActual != null && p.precio_manual_ars == null && preview.precio < precioActual;
                    const margenParaMantener = baja && preview.costoFinalArs ? (precioActual / preview.costoFinalArs - 1) * 100 : null;
                    return (
                      <div className="restock-preview">
                        <div>Precio actual: <strong>{formatoMoneda(precioActual)}</strong> → con este lote: <strong>{formatoMoneda(preview.precio)}</strong></div>
                        {baja && (
                          <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 6 }}>
                            <input type="checkbox" checked={mantenerPrecio} onChange={(e) => setMantenerPrecio(e.target.checked)} style={{ marginTop: 3 }} />
                            <span>
                              Mantener el precio actual ({formatoMoneda(precioActual)})
                              <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                                Este lote salió más barato. {mantenerPrecio ? `El margen pasa a ${formatoPct(margenParaMantener)}.` : `El precio baja a ${formatoMoneda(preview.precio)}.`}
                              </span>
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  })()}
                  <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                    IVA y envío arrancan con los del producto (vacío = 0). Si dejás el margen vacío, se usa el que ya tenía el producto.
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>{margenOperacion === 'sumar' ? 'Aumentar margen' : 'Fijar margen'}</h2>
            <button type="button" className="modal-cerrar" onClick={() => setMostrarMargenMasivo(false)} aria-label="Cerrar">×</button>
          </div>
          <div className="segmentado" style={{ margin: '10px 0' }}>
            <button type="button" className={margenOperacion === 'fijar' ? 'activo' : ''} onClick={() => setMargenOperacion('fijar')}>Fijar margen</button>
            <button type="button" className={margenOperacion === 'sumar' ? 'activo' : ''} onClick={() => setMargenOperacion('sumar')}>Aumentar margen</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
            {margenOperacion === 'sumar'
              ? 'Suma los puntos que pongas al margen que ya tiene cada producto (ej. 45% + 5 = 50%). Con un número negativo lo baja. Los de precio manual no se tocan.'
              : 'Pone el mismo margen a todos los productos elegidos.'}
          </p>
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
              placeholder={margenOperacion === 'sumar' ? 'Puntos a sumar (ej. 5)' : 'Margen % nuevo'}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>Importar productos desde Excel</h2>
            <button type="button" className="modal-cerrar" onClick={() => setMostrarImportar(false)} aria-label="Cerrar">×</button>
          </div>
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
            <div className="tabla-scroll">
            <table className="simple-table tabla-productos">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={productosVisibles.length > 0 && productosVisibles.every((p) => seleccionados.has(p.id))}
                      onChange={toggleSeleccionarTodosVisibles}
                      title="Seleccionar todos (esta página)"
                    />
                  </th>
                  <th>Producto</th>
                  <th className="num">Stock</th>
                  <th className="num col-costo">Costo final</th>
                  <th className="num">Precio</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {productosVisibles.length === 0 && (
                  <tr><td colSpan={6} className="muted">Sin productos que coincidan</td></tr>
                )}
                {productosVisibles.map((p) => (
                  <Fragment key={p.id}>
                  <tr className={flashId === p.id ? 'fila-flash' : ''}>
                    <td>
                      <input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggleSeleccionado(p.id)} />
                    </td>
                    <td>
                      <div className="prod-celda">
                        <Miniatura productoId={p.id} cantidadImagenes={p.cantidad_imagenes} tam={44} descripcion={p.descripcion} onSinImagen={() => abrirEditar(p)} />
                        <div className="prod-info">
                          <TextareaAuto
                            key={`descripcion-${versionTabla}`}
                            className="input-inline prod-descripcion"
                            defaultValue={p.descripcion || ''}
                            onBlur={(e) => { if (e.target.value !== (p.descripcion || '')) guardarCampo(p.id, 'descripcion', e.target.value); }}
                          />
                          <div className="prod-meta">
                            <span>Cód.</span>
                            <input
                              key={`codigo-${versionTabla}`}
                              className="input-inline"
                              defaultValue={p.codigo || ''}
                              placeholder="—"
                              onBlur={(e) => { if (e.target.value !== (p.codigo || '')) guardarCampo(p.id, 'codigo', e.target.value); }}
                              style={{ width: 90 }}
                            />
                            <span>·</span>
                            <input
                              key={`categoria-${versionTabla}`}
                              className="input-inline"
                              defaultValue={p.categoria || ''}
                              placeholder="Sin categoría"
                              onBlur={(e) => { if (e.target.value.toUpperCase() !== (p.categoria || '').toUpperCase()) guardarCampo(p.id, 'categoria', e.target.value); }}
                              style={{ width: 140 }}
                            />
                            {ofertaVigente(p) && (
                              <span title={textoOferta(p, labelMetodo, formatoMoneda)}>
                                <span className="badge-oferta">OFERTA</span> {formatoMoneda(Number(p.oferta_precio))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <input
                        key={`stock-${versionTabla}`}
                        type="text" inputMode="decimal"
                        className={`input-inline ${Number(p.stock) <= 0 ? 'valor-critico' : Number(p.stock) <= 3 ? 'valor-alerta' : ''}`}
                        defaultValue={p.stock ?? ''}
                        onChange={(e) => actualizarLocal(p.id, 'stock', e.target.value)}
                        onBlur={(e) => guardarCampo(p.id, 'stock', parseNumero(e.target.value) ?? 0)}
                        style={{ width: 58, textAlign: 'right' }}
                        title={Number(p.stock) <= 0 ? 'Sin stock' : Number(p.stock) <= 3 ? 'Stock bajo' : undefined}
                      />
                    </td>
                    <td className="num col-costo">
                      {p.costo_final_ars == null ? <span className="muted">—</span> : formatoMoneda(p.costo_final_ars)}
                    </td>
                    <td className="num">
                      {p.precio == null ? (
                        <span className="muted">Sin precio</span>
                      ) : (
                        <>
                          <strong>{formatoMoneda(p.precio)}</strong>
                          {p.precio_lista != null && (
                            <div className="muted" style={{ fontSize: 11 }} title="Precio de lista (Point débito): el que se cobra en ventas antes del descuento/recargo de la forma de pago">
                              Lista {formatoMoneda(p.precio_lista)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      <div className="celda-acciones">
                        <button type="button" onClick={() => abrirEditar(p)} className="btn-link">Editar</button>
                        <div className="menu-acciones">
                          <button
                            type="button"
                            className="btn-link menu-acciones-toggle"
                            onClick={() => setMenuAbiertoId((m) => (m === p.id ? null : p.id))}
                            aria-label="Más acciones"
                          >
                            ⋯
                          </button>
                          {menuAbiertoId === p.id && (
                            <>
                              <div className="menu-acciones-fondo" onClick={() => setMenuAbiertoId(null)} />
                              <div className="menu-acciones-lista">
                                <button type="button" onClick={() => { setMenuAbiertoId(null); setOfertaProducto(p); }}>
                                  {Number(p.oferta_precio) > 0 ? 'Editar oferta' : 'Nueva oferta'}
                                </button>
                                <button type="button" onClick={() => { setMenuAbiertoId(null); abrirEditar(p); }}>Imágenes</button>
                                <button type="button" className="danger" disabled={eliminandoId === p.id} onClick={() => { setMenuAbiertoId(null); eliminarProducto(p.id); }}>
                                  {eliminandoId === p.id ? 'Eliminando...' : 'Eliminar'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>

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

      {mostrarSelectorOferta && (() => {
        const hoy = hoyArgentina();
        const conOferta = productosCompletos.filter((x) => Number(x.oferta_precio) > 0);
        const encontrados = busquedaOferta.trim()
          ? productosCompletos.filter((x) => coincideTexto(`${x.codigo || ''} ${x.descripcion || ''}`, busquedaOferta)).slice(0, 40)
          : [];
        const elegir = (x) => { setMostrarSelectorOferta(false); setOfertaProducto(x); };
        return (
          <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setMostrarSelectorOferta(false); }}>
            <div className="modal-ventana modal-ventana-ancha">
              <div className="modal-header">
                <h2>Nueva oferta</h2>
                <button type="button" className="modal-cerrar" onClick={() => setMostrarSelectorOferta(false)} aria-label="Cerrar">×</button>
              </div>
              <div className="modal-body" style={{ gap: 10 }}>
                <input autoFocus placeholder="Buscá el producto (código o descripción)..." value={busquedaOferta} onChange={(e) => setBusquedaOferta(e.target.value)} style={{ width: '100%' }} />
                {encontrados.length > 0 && (
                  <ul className="resultados-lista" style={{ margin: 0 }}>
                    {encontrados.map((x) => (
                      <li key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => elegir(x)}>
                        <Miniatura productoId={x.id} cantidadImagenes={x.cantidad_imagenes} tam={28} descripcion={x.descripcion} />
                        <span style={{ flex: 1 }}>{x.codigo ? <span className="muted">#{x.codigo} — </span> : null}{x.descripcion}</span>
                        {ofertaVigente(x) && <span className="badge-oferta">OFERTA</span>}
                        <span className="muted">{formatoMoneda(x.precio_lista ?? x.precio)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {busquedaOferta.trim() && encontrados.length === 0 && <p className="muted" style={{ margin: 0 }}>No se encontraron productos.</p>}

                <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Ofertas cargadas ({conOferta.length})</p>
                {conOferta.length === 0 && <p className="muted" style={{ margin: 0 }}>Todavía no hay productos en oferta.</p>}
                {conOferta.length > 0 && (
                  <table className="simple-table">
                    <tbody>
                      {conOferta.map((x) => {
                        const vencida = x.oferta_hasta && String(x.oferta_hasta).slice(0, 10) < hoy;
                        return (
                          <tr key={x.id} style={{ cursor: 'pointer', opacity: vencida ? 0.6 : 1 }} onClick={() => elegir(x)}>
                            <td>{x.descripcion}</td>
                            <td>{vencida ? <span className="muted">vencida</span> : textoOferta(x, labelMetodo, formatoMoneda)}</td>
                            <td><button type="button" className="btn-link">Editar</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {ofertaProducto && (
        <OfertaModal
          producto={productosCompletos.find((x) => x.id === ofertaProducto.id) || ofertaProducto}
          config={configFull}
          onCerrar={() => setOfertaProducto(null)}
          onGuardado={async () => { setOfertaProducto(null); await refrescarTabla(); }}
        />
      )}
    </div>
  );
}
