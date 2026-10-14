import { useEffect, useState } from 'react';
import api from '../api/client';
import { useUi } from '../context/UiContext';
import { CUOTAS_POSIBLES, METODOS_PAGO, IVA_COMISION, cuotasMaxDesdeConfig, impuestoCobrosDesdeConfig, metodoPagaImpuesto, tablasDesdeConfig } from '../utils/pagos';

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
      { clave: 'cotizacion_dolar', label: 'Cotización del dólar (ARS)' },
      { clave: 'cotizacion_piso', label: 'Piso de cotización (opcional)' },
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
    'cotizacion_dolar_actualizada_en',
    'migracion_clientes_facturacion_v1',
  ])
);

export default function Configuracion() {
  const { toast } = useUi();
  const [config, setConfig] = useState(null);
  const [valores, setValores] = useState({});
  // Tabla de formas de pago: { [metodo]: { publico, tecnico, comision } } como texto editable.
  const [tablaPagos, setTablaPagos] = useState({});
  // Costo de cuotas sin interes: { [cuotas]: texto } y maximo ofrecido.
  const [tablaCuotas, setTablaCuotas] = useState({});
  const [cuotasMax, setCuotasMax] = useState(3);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const [claveNueva, setClaveNueva] = useState('');
  const [valorNuevo, setValorNuevo] = useState('');

  const [actualizandoCotizacion, setActualizandoCotizacion] = useState(false);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function armarTablaPagos(data) {
    const { publico, tecnico, comisiones } = tablasDesdeConfig(data);
    const t = {};
    for (const m of METODOS_PAGO) {
      t[m.clave] = {
        publico: publico[m.clave] != null ? String(publico[m.clave]).replace('.', ',') : '',
        tecnico: tecnico[m.clave] != null ? String(tecnico[m.clave]).replace('.', ',') : '',
        comision: comisiones[m.clave] != null ? String(comisiones[m.clave]).replace('.', ',') : '',
      };
    }
    return t;
  }

  function armarTablaCuotas(data) {
    const { costosCuotas } = tablasDesdeConfig(data);
    const t = {};
    for (const n of CUOTAS_POSIBLES.filter((x) => x > 1)) t[n] = costosCuotas[n] != null ? String(costosCuotas[n]).replace('.', ',') : '';
    return t;
  }

  function cambiarTablaPagos(metodo, columna, valor) {
    setTablaPagos((prev) => ({ ...prev, [metodo]: { ...prev[metodo], [columna]: valor } }));
  }

  // Pasa la tabla editable a los 3 JSON que lee el backend (solo guarda
  // los metodos con un valor distinto de 0).
  function serializarTablaPagos() {
    const out = { publico: {}, tecnico: {}, comision: {} };
    for (const m of METODOS_PAGO) {
      for (const col of ['publico', 'tecnico', 'comision']) {
        const txt = String(tablaPagos[m.clave]?.[col] ?? '').trim().replace(',', '.');
        if (txt === '') continue;
        const n = Number(txt);
        if (Number.isNaN(n)) throw new Error(`Valor inválido en "${m.label}": ${tablaPagos[m.clave][col]}`);
        if (col === 'comision' && (n < 0 || n >= 50)) throw new Error(`La comisión de "${m.label}" tiene que estar entre 0 y 50%`);
        if (n !== 0) out[col][m.clave] = n;
      }
    }
    const cuotasOut = {};
    for (const n of CUOTAS_POSIBLES.filter((x) => x > 1)) {
      const txt = String(tablaCuotas[n] ?? '').trim().replace(',', '.');
      if (txt === '') continue;
      const v = Number(txt);
      if (Number.isNaN(v) || v < 0 || v >= 80) throw new Error(`Costo inválido para ${n} cuotas: ${tablaCuotas[n]}`);
      cuotasOut[n] = v;
    }
    return {
      costos_cuotas_sin_interes: JSON.stringify(cuotasOut),
      cuotas_sin_interes_max: String(cuotasMax),
      ajustes_metodo_pago: JSON.stringify(out.publico),
      ajustes_metodo_pago_tecnico: JSON.stringify(out.tecnico),
      comisiones_metodo_pago: JSON.stringify(out.comision),
    };
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
      setValores((prev) => ({ ...prev, cotizacion_dolar: String(resultado.cotizacion_dolar) }));
      setConfig((prev) => ({ ...prev, cotizacion_dolar: String(resultado.cotizacion_dolar) }));
      toast(`Cotización actualizada a $${resultado.cotizacion_dolar} (${resultado.fuente}) ✓`, { duration: 5000 });
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

  return (
    <div className="page">
      <h1>Configuración</h1>

      {error && <div className="error-box">{error}</div>}

      {/* Card con la cotización del dólar de hoy, bien visible arriba de todo */}
      <div className="panel" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>Dólar hoy</p>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
            {valores.cotizacion_dolar ? `$${Number(valores.cotizacion_dolar).toLocaleString('es-AR')}` : '—'}
          </p>
          {ultimaActualizacionDolar && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 11 }}>Actualizado: {ultimaActualizacionDolar}</p>
          )}
        </div>
        <button type="button" className="btn-secondary" onClick={actualizarCotizacion} disabled={actualizandoCotizacion}>
          {actualizandoCotizacion ? 'Actualizando...' : 'Actualizar ahora (BNA)'}
        </button>
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
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Formas de pago: descuentos, recargos y comisiones de Mercado Pago</summary>
          <div style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              <strong>Público / Técnico:</strong> % de descuento (negativo, ej. -10) o recargo (positivo) que decidís vos. Se usa "Técnico" cuando la venta tiene un cliente de la agenda, y "Público" cuando no.
              <br />
              <strong>Comisión MP:</strong> el % que te cobra Mercado Pago, <em>sin IVA</em>, tal cual figura en Mercado Pago → Costos y cuotas. El sistema le suma el IVA y se lo traslada al cliente para que te quede limpio lo mismo que en efectivo.
            </p>
            <table className="simple-table">
              <thead>
                <tr><th>Forma de pago</th><th>Público %</th><th>Técnico %</th><th>Comisión MP % (sin IVA)</th><th>Recargo real al cliente</th></tr>
              </thead>
              <tbody>
                {METODOS_PAGO.map((m) => {
                  const fila = tablaPagos[m.clave] || {};
                  const usaMp = m.clave !== 'efectivo' && m.clave !== 'transferencia';
                  const com = Number(String(fila.comision || '0').replace(',', '.')) || 0;
                  const imp = metodoPagaImpuesto(m.clave) ? impuestoCobrosDesdeConfig(valores) : 0;
                  const efectiva = ((usaMp ? com : 0) * IVA_COMISION) / 100 + imp / 100;
                  const recargoReal = efectiva > 0 && efectiva < 1 ? ((1 / (1 - efectiva) - 1) * 100).toFixed(2).replace('.', ',') : null;
                  return (
                    <tr key={m.clave}>
                      <td>{m.label}</td>
                      <td><input className="input-inline" inputMode="decimal" value={fila.publico ?? ''} onChange={(e) => cambiarTablaPagos(m.clave, 'publico', e.target.value)} placeholder="0" style={{ width: 70 }} /></td>
                      <td><input className="input-inline" inputMode="decimal" value={fila.tecnico ?? ''} onChange={(e) => cambiarTablaPagos(m.clave, 'tecnico', e.target.value)} placeholder="0" style={{ width: 70 }} /></td>
                      <td>
                        {usaMp
                          ? <input className="input-inline" inputMode="decimal" value={fila.comision ?? ''} onChange={(e) => cambiarTablaPagos(m.clave, 'comision', e.target.value)} placeholder="0" style={{ width: 70 }} />
                          : <span className="muted">—</span>}
                      </td>
                      <td className="muted">{recargoReal ? `+${recargoReal}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <label className="campo" style={{ maxWidth: 420, marginTop: 14 }}>
              <span>Impuesto sobre los créditos y débitos (%) — se suma solo en cobros con Point y QR (no en efectivo ni transferencia). Poné 0 para no trasladarlo.</span>
              <input
                inputMode="decimal"
                value={valores.impuesto_cobros_pct ?? ''}
                placeholder="0,6"
                onChange={(e) => cambiarValor('impuesto_cobros_pct', e.target.value)}
                style={{ width: 100 }}
              />
            </label>

            <h3 style={{ margin: '18px 0 6px', fontSize: 14 }}>Cuotas sin interés (Point y QR con crédito)</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              El costo de cada cantidad de cuotas, tal cual figura en Mercado Pago → Costos y cuotas → Por ofrecer cuotas. Se suma a la comisión de crédito (+ IVA) y se traslada al precio. Tiene que coincidir con lo que tenés activado en Mercado Pago.
            </p>
            <label className="campo" style={{ maxWidth: 260 }}>
              <span>Ofrecés hasta</span>
              <select value={cuotasMax} onChange={(e) => setCuotasMax(Number(e.target.value))}>
                {CUOTAS_POSIBLES.map((n) => <option key={n} value={n}>{n === 1 ? 'Sin cuotas (solo 1 pago)' : `${n} cuotas`}</option>)}
              </select>
            </label>
            <table className="simple-table" style={{ maxWidth: 420 }}>
              <thead><tr><th>Cuotas</th><th>Costo MP % (sin IVA)</th></tr></thead>
              <tbody>
                {CUOTAS_POSIBLES.filter((n) => n > 1).map((n) => (
                  <tr key={n} style={{ opacity: n <= cuotasMax ? 1 : 0.5 }}>
                    <td>{n} cuotas</td>
                    <td><input className="input-inline" inputMode="decimal" value={tablaCuotas[n] ?? ''} onChange={(e) => setTablaCuotas((t) => ({ ...t, [n]: e.target.value }))} style={{ width: 80 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
