import { useEffect, useState } from 'react';
import api from '../api/client';
import { useUi } from '../context/UiContext';
import {
  CUOTAS_POSIBLES, METODOS_PAGO, comisionesDesdeConfig, costosCuotasDesdeConfig, cuotasMaxDesdeConfig, esMetodoCredito, formatoPct,
  minimoSobreLista, porcentajesCuotasDesdeConfig, porcentajesDesdeConfig, recargoListaSugerido,
} from '../utils/pagos';

// Claves conocidas, con su etiqueta y en que grupo van. El resto de las
// claves que existan en config (o que se agreguen) aparecen abajo, en
// "Otras claves", para no perder nada aunque no esten en esta lista.
const GRUPOS = [
  {
    titulo: 'Negocio (para tickets, presupuestos y facturas)',
    campos: [
      { clave: 'nombre_negocio', label: 'Nombre comercial' },
      { clave: 'direccion', label: 'Dirección del local' },
      { clave: 'telefono', label: 'Teléfono' },
      { clave: 'banco', label: 'Banco para transferencias (opcional)' },
      { clave: 'cbu_alias', label: 'CBU / Alias (opcional)' },
    ],
  },
  {
    titulo: 'Datos que van en la Factura (según figura en AFIP para tu CUIT)',
    campos: [
      { clave: 'razon_social_facturacion', label: 'Razón Social (si no se carga, usa el nombre comercial)' },
      {
        clave: 'condicion_fiscal_negocio',
        label: 'Condición frente al IVA del emisor (Responsable Inscripto = Factura A/B; Monotributo = Factura C)',
        opciones: ['Responsable Monotributo', 'Responsable Inscripto'],
      },
      {
        clave: 'factura_a_habilitada',
        label: 'Factura A habilitada en ARCA (si es "No", las ventas a Responsables Inscriptos y Monotributistas quedan pendientes de facturar)',
        opciones: ['No', 'Sí'],
      },
      { clave: 'domicilio_facturacion', label: 'Domicilio Comercial (si no se carga, usa la dirección del local)' },
      { clave: 'ingresos_brutos', label: 'Ingresos Brutos' },
      { clave: 'fecha_inicio_actividades', label: 'Fecha de Inicio de Actividades' },
      { clave: 'afip_cuit', label: 'CUIT' },
      { clave: 'afip_punto_venta', label: 'Punto de Venta' },
    ],
  },
  {
    titulo: 'Precios',
    campos: [
      { clave: 'envio_pct', label: 'Envío general (%, opcional — se suma al costo antes del margen)' },
      { clave: 'iva_pct', label: 'IVA general (%, opcional — se suma al costo antes del margen)' },
      { clave: 'margen_venta_pct', label: 'Margen de venta general (%)' },
      { clave: 'redondeo_unidad', label: 'Redondeo de precios (a múltiplos de)' },
    ],
  },
  {
    titulo: 'Numeración',
    campos: [
      { clave: 'proximo_numero_comprobante', label: 'Próximo N° de venta' },
      { clave: 'proximo_numero_presupuesto', label: 'Próximo N° de presupuesto' },
    ],
  },
];

const CLAVES_CONOCIDAS = new Set(
  GRUPOS.flatMap((g) => g.campos.map((c) => c.clave)).concat([
    'ajustes_metodo_pago',
    'ajustes_metodo_pago_tecnico',
    'comisiones_metodo_pago',
    'costos_cuotas_sin_interes',
    'cuotas_sin_interes_max',
    'impuesto_cobros_pct',
    'porcentajes_pago',
    'porcentajes_cuotas',
    'recargo_lista_pct',
    'cotizacion_dolar',
    'cotizacion_piso',
    'cotizacion_modo',
    'cotizacion_dolar_actualizada_en',
    'cotizacion_bna_referencia',
    'cotizacion_bna_actualizada_en',
    'cotizacion_bna_fecha',
    'migracion_clientes_facturacion_v1',
  ])
);

// "1.600" o "1.600,50" (formato argentino) -> "1600" / "1600.50". "1535.5" se deja igual.
function normalizarNumero(valor) {
  let t = String(valor ?? '').trim().replace(/[$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return t;
}

function modoDolarDesdeConfig(config) {
  const modo = String(config?.cotizacion_modo || '').trim();
  if (['automatico', 'solo_sube', 'fijo'].includes(modo)) return modo;
  return config?.cotizacion_piso ? 'solo_sube' : 'automatico';
}

export default function Configuracion() {
  const { toast } = useUi();
  const [config, setConfig] = useState(null);
  const [valores, setValores] = useState({});
  // Tabla de formas de pago: { [metodo]: { publico, tecnico, comision } } como texto editable.
  // Formas de pago: { [metodo]: { publico, tecnico, comision } } como texto editable.
  const [tablaPagos, setTablaPagos] = useState({});
  // Cuotas sin interes: { [n]: { pct, costo } } como texto editable.
  const [tablaCuotas, setTablaCuotas] = useState({});
  const [cuotasMax, setCuotasMax] = useState(3);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const [claveNueva, setClaveNueva] = useState('');
  const [valorNuevo, setValorNuevo] = useState('');

  const [actualizandoCotizacion, setActualizandoCotizacion] = useState(false);
  const [modoDolar, setModoDolar] = useState('automatico');
  const [probandoAfip, setProbandoAfip] = useState(false);
  const [resultadoAfip, setResultadoAfip] = useState(null);

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordNuevaRepetir, setPasswordNuevaRepetir] = useState('');
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState(null);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/config');
      setConfig(data);
      setValores(data);
      setTablaPagos(armarTablaPagos(data));
      setTablaCuotas(armarTablaCuotas(data));
      setCuotasMax(cuotasMaxDesdeConfig(data));
      setModoDolar(modoDolarDesdeConfig(data));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const txt = (n) => (n == null ? '' : String(n).replace('.', ','));
  const num = (t) => Number(String(t ?? '').trim().replace(',', '.'));

  function armarTablaPagos(data) {
    const pct = porcentajesDesdeConfig(data);
    const com = comisionesDesdeConfig(data);
    const t = {};
    for (const m of METODOS_PAGO) {
      t[m.clave] = { publico: txt(pct.publico[m.clave]), tecnico: txt(pct.tecnico[m.clave]), comision: txt(com[m.clave]) };
    }
    return t;
  }

  function armarTablaCuotas(data) {
    const pct = porcentajesCuotasDesdeConfig(data);
    const costo = costosCuotasDesdeConfig(data);
    const t = {};
    for (const n of CUOTAS_POSIBLES.filter((x) => x > 1)) t[n] = { pct: txt(pct[n]), costo: txt(costo[n]) };
    return t;
  }

  function cambiarTablaPagos(metodo, columna, valor) {
    setTablaPagos((prev) => ({ ...prev, [metodo]: { ...prev[metodo], [columna]: valor } }));
  }
  function cambiarTablaCuotas(n, columna, valor) {
    setTablaCuotas((prev) => ({ ...prev, [n]: { ...prev[n], [columna]: valor } }));
  }

  // Pasa las tablas editables a las claves de config que lee el backend.
  function serializarTablaPagos() {
    const publico = {};
    const tecnico = {};
    const comisiones = {};
    for (const m of METODOS_PAGO) {
      const f = tablaPagos[m.clave] || {};
      for (const [col, destino] of [['publico', publico], ['tecnico', tecnico], ['comision', comisiones]]) {
        const v = String(f[col] ?? '').trim() === '' ? 0 : num(f[col]);
        if (Number.isNaN(v)) throw new Error(`Valor inválido en "${m.label}": ${f[col]}`);
        if (col !== 'comision' && (v < -50 || v > 200)) throw new Error(`El % de "${m.label}" tiene que estar entre -50 y 200`);
        if (col === 'comision' && (v < 0 || v >= 50)) throw new Error(`La comisión de "${m.label}" tiene que estar entre 0 y 50%`);
        destino[m.clave] = v;
      }
    }
    const pctCuotas = {};
    const costoCuotas = {};
    for (const n of CUOTAS_POSIBLES.filter((x) => x > 1)) {
      const f = tablaCuotas[n] || {};
      const p = num(f.pct);
      const c = num(f.costo);
      if (Number.isNaN(p) || Number.isNaN(c)) throw new Error(`Valor inválido en ${n} cuotas`);
      pctCuotas[n] = p;
      costoCuotas[n] = c;
    }
    return {
      porcentajes_pago: JSON.stringify({ publico, tecnico }),
      comisiones_metodo_pago: JSON.stringify(comisiones),
      porcentajes_cuotas: JSON.stringify(pctCuotas),
      costos_cuotas_sin_interes: JSON.stringify(costoCuotas),
      cuotas_sin_interes_max: String(cuotasMax),
    };
  }

  // Config "en edicion" (lo que esta tipeado, sin guardar) para calcular en
  // vivo el minimo de cada forma de pago.
  function configEnEdicion() {
    try {
      return { ...valores, ...serializarTablaPagos() };
    } catch {
      return valores;
    }
  }

  function cambiarValor(clave, valor) {
    setValores((prev) => ({ ...prev, [clave]: valor }));
  }

  async function guardarTodo(e) {
    e?.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const body = { ...valores, ...serializarTablaPagos() };
      if (body.cotizacion_dolar != null) body.cotizacion_dolar = normalizarNumero(body.cotizacion_dolar);
      body.cotizacion_modo = modoDolar;
      const actualizado = await api.put('/config', body);
      setConfig(actualizado);
      setValores(actualizado);
      setTablaPagos(armarTablaPagos(actualizado));
      setTablaCuotas(armarTablaCuotas(actualizado));
      setCuotasMax(cuotasMaxDesdeConfig(actualizado));
      toast('Guardado ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function agregarClave(e) {
    e.preventDefault();
    if (!claveNueva.trim()) return;
    setGuardando(true);
    try {
      const actualizado = await api.put('/config', { [claveNueva.trim()]: valorNuevo });
      setConfig(actualizado);
      setValores(actualizado);
      setClaveNueva('');
      setValorNuevo('');
      toast('Clave agregada ✓');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function actualizarCotizacion() {
    setActualizandoCotizacion(true);
    setError(null);
    try {
      const resultado = await api.post('/config/actualizar-cotizacion');
      const data = await api.get('/config');
      setConfig(data);
      setValores((prev) => ({
        ...prev,
        cotizacion_dolar: data.cotizacion_dolar,
        cotizacion_bna_referencia: data.cotizacion_bna_referencia,
        cotizacion_bna_fecha: data.cotizacion_bna_fecha,
      }));
      const bna = Number(resultado.cotizacion_bna).toLocaleString('es-AR');
      if (resultado.modo === 'fijo') toast(`Dólar BNA hoy: $${bna}. Tu cotización fija no cambió.`, { duration: 5000 });
      else if (!resultado.cambio) toast(`Dólar BNA hoy: $${bna}. La cotización se mantiene en $${Number(resultado.cotizacion_dolar).toLocaleString('es-AR')}.`, { duration: 5000 });
      else toast(`Cotización actualizada a $${Number(resultado.cotizacion_dolar).toLocaleString('es-AR')} ✓`, { duration: 5000 });
    } catch (err) {
      setError(err.message);
    } finally {
      setActualizandoCotizacion(false);
    }
  }

  async function cambiarPassword(e) {
    e.preventDefault();
    setErrorPassword(null);
    if (passwordNueva !== passwordNuevaRepetir) {
      setErrorPassword('La contraseña nueva no coincide en los dos campos');
      return;
    }
    if (passwordNueva.length < 6) {
      setErrorPassword('La contraseña nueva debe tener al menos 6 caracteres');
      return;
    }
    setCambiandoPassword(true);
    try {
      await api.put('/auth/password', { password_actual: passwordActual, password_nueva: passwordNueva });
      toast('Contraseña actualizada ✓ La vas a usar la próxima vez que inicies sesión.', { duration: 5000 });
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordNuevaRepetir('');
    } catch (err) {
      setErrorPassword(err.message);
    } finally {
      setCambiandoPassword(false);
    }
  }

  async function probarConexionAfip() {
    setProbandoAfip(true);
    setResultadoAfip(null);
    setError(null);
    try {
      const resultado = await api.post('/config/afip/probar-conexion', {});
      setResultadoAfip(resultado);
    } catch (err) {
      setError(err.message);
    } finally {
      setProbandoAfip(false);
    }
  }

  if (loading) return <div className="page"><div className="loading">Cargando...</div></div>;

  const otrasClaves = config ? Object.keys(config).filter((k) => !CLAVES_CONOCIDAS.has(k)).sort() : [];
  const ultimaActualizacionDolar = config?.cotizacion_dolar_actualizada_en
    ? new Date(config.cotizacion_dolar_actualizada_en).toLocaleString('es-AR')
    : null;
  const bnaReferencia = Number(valores.cotizacion_bna_referencia || 0);
  const fechaBna = valores.cotizacion_bna_fecha ? new Date(valores.cotizacion_bna_fecha).toLocaleDateString('es-AR') : null;
  const modoGuardado = config ? modoDolarDesdeConfig(config) : 'automatico';
  const hayCambiosDolar = modoDolar !== modoGuardado || String(valores.cotizacion_dolar ?? '') !== String(config?.cotizacion_dolar ?? '');

  return (
    <div className="page">
      <h1>Configuración</h1>

      {error && <div className="error-box">{error}</div>}

      {/* Card de la cotización del dólar: todos los costos están en USD y se pasan a pesos con este valor */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>Dólar que usa el sistema (costos USD → pesos)</p>
            {modoDolar === 'fijo' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700 }}>$</span>
                <input
                  inputMode="decimal"
                  value={valores.cotizacion_dolar ?? ''}
                  onChange={(e) => cambiarValor('cotizacion_dolar', e.target.value)}
                  style={{ fontSize: 22, fontWeight: 700, width: 150 }}
                />
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
                {valores.cotizacion_dolar ? `$${Number(valores.cotizacion_dolar).toLocaleString('es-AR')}` : '—'}
              </p>
            )}
            {ultimaActualizacionDolar && (
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>Último cambio: {ultimaActualizacionDolar}</p>
            )}
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              Dólar oficial BNA (venta): <strong>{bnaReferencia ? `$${bnaReferencia.toLocaleString('es-AR')}` : '—'}</strong>
              {fechaBna && ` · publicado el ${fechaBna}`}
            </p>
          </div>

          <div style={{ minWidth: 260, maxWidth: 380 }}>
            <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Cómo se actualiza</label>
            <select value={modoDolar} onChange={(e) => setModoDolar(e.target.value)} style={{ width: '100%' }}>
              <option value="automatico">Automático: sigue al BNA (sube y baja)</option>
              <option value="solo_sube">Solo sube: sigue al BNA, pero si baja no la toca</option>
              <option value="fijo">Fijo: la cargo yo y no cambia sola</option>
            </select>
            <p className="muted" style={{ margin: '6px 0 8px', fontSize: 11 }}>
              {modoDolar === 'automatico' && 'Se actualiza sola una vez por día con el dólar oficial del Banco Nación.'}
              {modoDolar === 'solo_sube' && 'Se actualiza sola una vez por día, pero nunca baja: si el BNA baja, los precios quedan como están.'}
              {modoDolar === 'fijo' && 'Escribí el valor a la izquierda. Los precios quedan fijos hasta que lo cambies vos (el BNA se muestra solo como referencia).'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hayCambiosDolar && (
                <button type="button" className="btn-primary" onClick={guardarTodo} disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar dólar'}
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={actualizarCotizacion} disabled={actualizandoCotizacion || hayCambiosDolar} title={hayCambiosDolar ? 'Primero guardá los cambios' : ''}>
                {actualizandoCotizacion ? 'Consultando...' : modoDolar === 'fijo' ? 'Ver BNA de hoy' : 'Actualizar ahora (BNA)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={guardarTodo}>
        {GRUPOS.map((grupo, i) => (
          <details className="panel" key={grupo.titulo} open={i === 0} style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>{grupo.titulo}</summary>
            <div style={{ marginTop: 14 }}>
              {grupo.campos.map((campo) => (
                <div key={campo.clave} style={{ marginBottom: 10 }}>
                  <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{campo.label}</label>
                  {campo.opciones ? (
                    <select value={valores[campo.clave] ?? campo.opciones[0]} onChange={(e) => cambiarValor(campo.clave, e.target.value)} style={{ width: '100%' }}>
                      {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      value={valores[campo.clave] ?? ''}
                      onChange={(e) => cambiarValor(campo.clave, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}

        <details className="panel" style={{ marginBottom: 16 }} open>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Formas de pago: precio de lista, descuentos y recargos</summary>
          {(() => {
            const cfg = configEnEdicion();
            const sugerido = recargoListaSugerido(cfg);
            const estiloMin = (pct, min) => (Number.isFinite(pct) && pct < min - 0.005 ? { color: 'var(--danger, #dc2626)', fontWeight: 600 } : {});
            return (
              <div style={{ marginTop: 14 }}>
                <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                  El <strong>precio de lista</strong> es el precio con Point débito: el precio cargado de cada producto (lo que querés que te quede) + el % de abajo.
                  Sobre esa lista, cada forma de pago tiene su descuento (−) o recargo (+), distinto para público y para técnicos (clientes de la agenda).
                  <br />
                  <strong>Mínimo:</strong> el % por debajo del cual perdés plata con las comisiones de Mercado Pago cargadas. Si un % queda abajo del mínimo se marca en rojo
                  (en descuentos de efectivo/transferencia puede ser a propósito, como promoción).
                </p>

                <label className="campo" style={{ maxWidth: 520 }}>
                  <span>Precio de lista = precio cargado + este % (vacío = automático, hoy {formatoPct(sugerido)}, el costo real de cobrar con débito)</span>
                  <input inputMode="decimal" value={valores.recargo_lista_pct ?? ''} placeholder={String(sugerido).replace('.', ',')} onChange={(e) => cambiarValor('recargo_lista_pct', e.target.value)} style={{ width: 100 }} />
                </label>

                <table className="simple-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr><th>Forma de pago</th><th>Público %</th><th>Técnico %</th><th>Mínimo</th><th>Comisión MP % (sin IVA)</th></tr>
                  </thead>
                  <tbody>
                    {METODOS_PAGO.map((m) => {
                      const f = tablaPagos[m.clave] || {};
                      const min = minimoSobreLista(cfg, m.clave);
                      const sinMp = m.clave === 'efectivo' || m.clave === 'transferencia';
                      return (
                        <tr key={m.clave}>
                          <td>{m.label}{esMetodoCredito(m.clave) && <span className="muted" style={{ fontSize: 11 }}> (1 pago)</span>}</td>
                          <td><input className="input-inline" inputMode="decimal" value={f.publico ?? ''} onChange={(e) => cambiarTablaPagos(m.clave, 'publico', e.target.value)} style={{ width: 60, ...estiloMin(num(f.publico), min) }} /></td>
                          <td><input className="input-inline" inputMode="decimal" value={f.tecnico ?? ''} onChange={(e) => cambiarTablaPagos(m.clave, 'tecnico', e.target.value)} style={{ width: 60, ...estiloMin(num(f.tecnico), min) }} /></td>
                          <td className="muted">{formatoPct(min)}</td>
                          <td>{sinMp ? <span className="muted">—</span> : <input className="input-inline" inputMode="decimal" value={f.comision ?? ''} onChange={(e) => cambiarTablaPagos(m.clave, 'comision', e.target.value)} style={{ width: 60 }} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <label className="campo" style={{ maxWidth: 520, marginTop: 14 }}>
                  <span>Impuesto sobre los créditos y débitos (%) — lo descuenta MP en cobros con Point y QR (no en efectivo ni transferencia). Solo se usa para calcular el mínimo.</span>
                  <input inputMode="decimal" value={valores.impuesto_cobros_pct ?? ''} placeholder="0,6" onChange={(e) => cambiarValor('impuesto_cobros_pct', e.target.value)} style={{ width: 100 }} />
                </label>

                <h3 style={{ margin: '18px 0 6px', fontSize: 14 }}>Crédito en cuotas sin interés (Point y QR)</h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                  Recargo sobre la lista para cada cantidad de cuotas (igual para público y técnicos). El costo de MP es el de "Por ofrecer cuotas" y se suma a la comisión de crédito.
                </p>
                <label className="campo" style={{ maxWidth: 260 }}>
                  <span>Ofrecés hasta (tiene que coincidir con Mercado Pago)</span>
                  <select value={cuotasMax} onChange={(e) => setCuotasMax(Number(e.target.value))}>
                    {CUOTAS_POSIBLES.map((n) => <option key={n} value={n}>{n === 1 ? 'Sin cuotas (solo 1 pago)' : `${n} cuotas`}</option>)}
                  </select>
                </label>
                <table className="simple-table" style={{ maxWidth: 560 }}>
                  <thead><tr><th>Cuotas</th><th>Recargo %</th><th>Mínimo</th><th>Costo MP % (sin IVA)</th></tr></thead>
                  <tbody>
                    {CUOTAS_POSIBLES.filter((n) => n > 1).map((n) => {
                      const f = tablaCuotas[n] || {};
                      const min = minimoSobreLista(cfg, 'tarjeta_credito', n);
                      return (
                        <tr key={n} style={{ opacity: n <= cuotasMax ? 1 : 0.5 }}>
                          <td>{n} cuotas</td>
                          <td><input className="input-inline" inputMode="decimal" value={f.pct ?? ''} onChange={(e) => cambiarTablaCuotas(n, 'pct', e.target.value)} style={{ width: 60, ...estiloMin(num(f.pct), min) }} /></td>
                          <td className="muted">{formatoPct(min)}</td>
                          <td><input className="input-inline" inputMode="decimal" value={f.costo ?? ''} onChange={(e) => cambiarTablaCuotas(n, 'costo', e.target.value)} style={{ width: 70 }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </details>

        <button type="submit" className="btn-primary" disabled={guardando} style={{ marginBottom: 16 }}>
          {guardando ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </form>

      <details className="panel" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Otras claves</summary>
        <div style={{ marginTop: 14 }}>
          {otrasClaves.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No hay otras claves cargadas.</p>
          ) : (
            <table className="simple-table" style={{ marginBottom: 14 }}>
              <thead><tr><th>Clave</th><th>Valor</th></tr></thead>
              <tbody>
                {otrasClaves.map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>
                      <input
                        className="input-inline"
                        defaultValue={config[k] ?? ''}
                        onBlur={async (e) => {
                          try {
                            const actualizado = await api.put('/config', { [k]: e.target.value });
                            setConfig(actualizado);
                            setValores(actualizado);
                            toast('Guardado ✓');
                          } catch (err) {
                            toast(err.message, { type: 'error', duration: 5000 });
                          }
                        }}
                        style={{ width: '100%' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={agregarClave} className="form-row">
            <input placeholder="Nombre de la clave nueva" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} />
            <input placeholder="Valor" value={valorNuevo} onChange={(e) => setValorNuevo(e.target.value)} />
            <button type="submit" className="btn-secondary">+ Agregar</button>
          </form>
        </div>
      </details>

      <details className="panel" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>AFIP / ARCA</summary>
        <div style={{ marginTop: 14 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Prueba el certificado y CUIT/punto de venta configurados, sin emitir ningún comprobante.
          </p>
          <button type="button" className="btn-secondary" onClick={probarConexionAfip} disabled={probandoAfip}>
            {probandoAfip ? 'Probando...' : 'Probar conexión con AFIP'}
          </button>
          {resultadoAfip && (
            <pre style={{ marginTop: 12, background: 'var(--bg)', padding: 10, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
              {JSON.stringify(resultadoAfip, null, 2)}
            </pre>
          )}
        </div>
      </details>

      <details className="panel" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Cambiar contraseña</summary>
        <div style={{ marginTop: 14 }}>
          {errorPassword && <div className="error-box">{errorPassword}</div>}
          <form onSubmit={cambiarPassword} style={{ maxWidth: 320 }}>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Contraseña actual</label>
              <input type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} style={{ width: '100%' }} required />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Contraseña nueva</label>
              <input type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} style={{ width: '100%' }} required minLength={6} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Repetir contraseña nueva</label>
              <input type="password" value={passwordNuevaRepetir} onChange={(e) => setPasswordNuevaRepetir(e.target.value)} style={{ width: '100%' }} required minLength={6} />
            </div>
            <button type="submit" className="btn-primary" disabled={cambiandoPassword}>
              {cambiandoPassword ? 'Cambiando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
