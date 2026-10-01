import { useEffect, useState } from 'react';
import api from '../api/client';
import { useUi } from '../context/UiContext';

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
    'cotizacion_dolar_actualizada_en',
  ])
);

export default function Configuracion() {
  const { toast } = useUi();
  const [config, setConfig] = useState(null);
  const [valores, setValores] = useState({});
  const [ajustesMetodoPago, setAjustesMetodoPago] = useState('{}');
  const [ajustesMetodoPagoTecnico, setAjustesMetodoPagoTecnico] = useState('{}');
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
      setAjustesMetodoPago(data.ajustes_metodo_pago || '{}');
      setAjustesMetodoPagoTecnico(data.ajustes_metodo_pago_tecnico || '{"efectivo": -10, "transferencia": -5}');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function cambiarValor(clave, valor) {
    setValores((prev) => ({ ...prev, [clave]: valor }));
  }

  async function guardarTodo(e) {
    e?.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const body = { ...valores, ajustes_metodo_pago: ajustesMetodoPago, ajustes_metodo_pago_tecnico: ajustesMetodoPagoTecnico };
      try { JSON.parse(ajustesMetodoPago || '{}'); } catch { throw new Error('El JSON de "Ajustes por método de pago (público)" no es válido'); }
      try { JSON.parse(ajustesMetodoPagoTecnico || '{}'); } catch { throw new Error('El JSON de "Ajustes por método de pago (cliente técnico)" no es válido'); }
      const actualizado = await api.put('/config', body);
      setConfig(actualizado);
      setValores(actualizado);
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
                  <input
                    value={valores[campo.clave] ?? ''}
                    onChange={(e) => cambiarValor(campo.clave, e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
          </details>
        ))}

        <details className="panel" style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Ajustes por forma de pago — Público</summary>
          <div style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Se usa cuando la venta no tiene cliente seleccionado. JSON con el % de recargo (positivo) o descuento (negativo) por método de pago. Ejemplo: {'{"efectivo": -5, "tarjeta_credito": 10}'}
            </p>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              <strong>Importante:</strong> las claves válidas son exactamente estas cuatro: <code>efectivo</code>, <code>transferencia</code>, <code>tarjeta_debito</code>, <code>tarjeta_credito</code>. Si se escribe otra cosa (por ejemplo <code>debito</code> o <code>credito</code>) el ajuste nunca se aplica, aunque parezca correcto.
            </p>
            <textarea
              value={ajustesMetodoPago}
              onChange={(e) => setAjustesMetodoPago(e.target.value)}
              style={{ width: '100%', minHeight: 70, fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
        </details>

        <details className="panel" style={{ marginBottom: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Ajustes por forma de pago — Cliente técnico</summary>
          <div style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Se usa cuando la venta tiene un cliente de la agenda seleccionado (todos los de la agenda son técnicos). Ejemplo: {'{"efectivo": -10, "transferencia": -5}'}
            </p>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              <strong>Importante:</strong> las claves válidas son exactamente estas cuatro: <code>efectivo</code>, <code>transferencia</code>, <code>tarjeta_debito</code>, <code>tarjeta_credito</code>. Si se escribe otra cosa (por ejemplo <code>debito</code> o <code>credito</code>) el ajuste nunca se aplica, aunque parezca correcto.
            </p>
            <textarea
              value={ajustesMetodoPagoTecnico}
              onChange={(e) => setAjustesMetodoPagoTecnico(e.target.value)}
              style={{ width: '100%', minHeight: 70, fontFamily: 'monospace', fontSize: 13 }}
            />
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
