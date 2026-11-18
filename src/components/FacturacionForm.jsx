import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client';

export const CONDICIONES_FISCALES = ['Consumidor Final', 'Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];

export function resumenDatoFacturacion(d) {
  const doc = d.documento ? `${d.tipo_documento || 'Doc.'} ${d.documento}` : 'sin documento';
  return [d.razon_social || 'SIN RAZÓN SOCIAL', doc, d.condicion_fiscal].join(' · ');
}

// Formulario "¿A quién se factura?" con dos botones:
// - "A mí": Consumidor Final sin identificar, sin más.
// Al completar un CUIT/CUIL de 11 digitos se consulta el padron de ARCA y se
// completan razon social y domicilio (se pueden corregir a mano). Si ARCA no
// responde, se cargan a mano. Los datos quedan guardados en el cliente para
// autocompletar la proxima vez.
// - "A cliente": datos fiscales (razón social, CUIT/CUIL/DNI, condición
//   frente al IVA, domicilio). Si la venta tiene un cliente de la agenda,
//   se puede elegir uno de sus datos guardados para autocompletar, o
//   cargar datos nuevos (que se guardan en ese cliente al facturar). Sin
//   cliente de la agenda, los datos se usan solo para esta factura.
//
// El nombre del cliente de la agenda NO se usa para facturar.
//
// onChange recibe { facturacion, valido, error } cada vez que algo cambia;
// facturacion es lo que hay que mandar al backend.
// mostrarNoFacturar: agrega el boton "No facturar" (ventas). Arranca
// seleccionado si noFacturarPorDefecto (efectivo, o venta de un presupuesto
// ya facturado).
export default function FacturacionForm({ clienteId = null, onChange, compacto = false, mostrarNoFacturar = false, noFacturarPorDefecto = false, config = null }) {
  const CAMPOS_VACIOS = { condicion_fiscal: 'Consumidor Final', tipo_documento: 'DNI', documento: '', nombre: '', direccion: '' };
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const form = {
    reset: (sig = {}) => setCampos({ ...CAMPOS_VACIOS, ...sig }),
    setCondicionFiscal: (condicion_fiscal) => setCampos((x) => ({ ...x, condicion_fiscal, tipo_documento: condicion_fiscal === 'Consumidor Final' ? 'DNI' : 'CUIT' })),
    setTipoDocumento: (tipo_documento) => setCampos((x) => ({ ...x, tipo_documento })),
    setDocumento: (documento) => setCampos((x) => ({ ...x, documento })),
    setNombreManual: (nombre) => setCampos((x) => ({ ...x, nombre })),
    setDireccionManual: (direccion) => setCampos((x) => ({ ...x, direccion })),
  };
  const [modo, setModo] = useState('mi');
  const [noFacturar, setNoFacturar] = useState(noFacturarPorDefecto);
  useEffect(() => { setNoFacturar(noFacturarPorDefecto); }, [noFacturarPorDefecto]);
  const sinFactura = mostrarNoFacturar && noFacturar;
  const [datosGuardados, setDatosGuardados] = useState([]);
  const [datoId, setDatoId] = useState('');
  const [cargando, setCargando] = useState(false);

  // Consulta al padron de ARCA por CUIT/CUIL (completa razon social y domicilio).
  const [padron, setPadron] = useState({ estado: 'idle', mensaje: null, condicion: null });
  const busquedaPadronRef = useRef(0);
  async function buscarPadron(doc) {
    const id = ++busquedaPadronRef.current;
    setPadron({ estado: 'buscando', mensaje: null, condicion: null });
    try {
      const d = await api.get(`/clientes/padron/${doc}`);
      if (id !== busquedaPadronRef.current) return; // llego tarde: el documento ya cambio
      setCampos((x) => ({
        ...x,
        nombre: d.razonSocial ? String(d.razonSocial).toUpperCase() : x.nombre,
        direccion: d.domicilio ? String(d.domicilio).toUpperCase() : x.direccion,
      }));
      setPadron({ estado: 'ok', mensaje: null, condicion: d.condicionFiscal || null });
    } catch (err) {
      if (id !== busquedaPadronRef.current) return;
      setPadron({ estado: 'error', mensaje: err.message || 'No se pudo consultar ARCA', condicion: null });
    }
  }
  function cambiarDocumento(valor) {
    busquedaPadronRef.current += 1; // invalida cualquier consulta en curso
    setPadron({ estado: 'idle', mensaje: null, condicion: null });
    form.setDocumento(valor);
    const limpio = valor.replace(/\D/g, '');
    if (limpio.length === 11) buscarPadron(limpio);
  }

  // Al cambiar de cliente, se traen sus datos de facturacion. Si tiene
  // alguno, arranca en "A cliente" con el primero ya cargado.
  useEffect(() => {
    let cancelado = false;
    setDatosGuardados([]);
    setDatoId('');
    form.reset();
    if (!clienteId) { setModo('mi'); return; }
    setCargando(true);
    api.get(`/clientes/${clienteId}/facturacion`)
      .then((data) => {
        if (cancelado) return;
        const lista = data.datos_facturacion || [];
        setDatosGuardados(lista);
        if (lista.length > 0) {
          setModo('cliente');
          elegirDato(String(lista[0].id), lista);
        } else {
          setModo('mi');
        }
      })
      .catch(() => { if (!cancelado) setModo('mi'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function elegirDato(id, lista = datosGuardados) {
    setDatoId(id);
    const d = lista.find((x) => String(x.id) === String(id));
    if (!d) {
      form.reset({ condicion_fiscal: 'Responsable Inscripto', tipo_documento: 'CUIT' });
      return;
    }
    form.reset({
      condicion_fiscal: d.condicion_fiscal || 'Consumidor Final',
      tipo_documento: d.tipo_documento || (d.condicion_fiscal === 'Consumidor Final' ? 'DNI' : 'CUIT'),
      documento: d.documento || '',
      nombre: d.razon_social || '',
      direccion: d.direccion || '',
    });
  }

  function elegirModo(m) {
    setNoFacturar(false);
    setModo(m);
    if (m === 'cliente' && !datoId) {
      if (datosGuardados.length > 0) elegirDato(String(datosGuardados[0].id));
      else form.reset({ condicion_fiscal: 'Consumidor Final', tipo_documento: 'DNI' });
    }
  }

  const c = campos;
  const esCF = c.condicion_fiscal === 'Consumidor Final';
  const docLimpio = (c.documento || '').replace(/\D/g, '');

  // Validacion propia de Consumidor Final identificado (el hook solo
  // valida las condiciones que exigen CUIT/CUIL).
  let error = null;
  if (!sinFactura && modo === 'cliente') {
    if (esCF) {
      if (docLimpio && c.tipo_documento === 'DNI' && (docLimpio.length < 7 || docLimpio.length > 8)) error = 'El DNI tiene que tener 7 u 8 dígitos.';
      else if (docLimpio && c.tipo_documento !== 'DNI' && docLimpio.length !== 11) error = `El ${c.tipo_documento} tiene que tener 11 dígitos.`;
    } else {
      if (docLimpio.length !== 11) error = 'Para esta condición hace falta un CUIT o CUIL válido (11 dígitos).';
      else if (!c.nombre.trim()) error = 'Falta la razón social.';
    }
  }

  const facturacion = useMemo(() => (
    sinFactura ? { modo: 'no' } : modo === 'mi'
      ? { modo: 'mi' }
      : {
          modo: 'cliente',
          condicion_fiscal: c.condicion_fiscal,
          tipo_documento: docLimpio ? c.tipo_documento : null,
          documento: docLimpio || null,
          razon_social: c.nombre || null,
          direccion: c.direccion || null,
        }
  ), [sinFactura, modo, c.condicion_fiscal, c.tipo_documento, docLimpio, c.nombre, c.direccion]);

  useEffect(() => {
    onChange?.({ facturacion, valido: !error && !cargando, error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturacion, error, cargando]);

  const esNuevo = modo === 'cliente' && !datoId;

  return (
    <div className={compacto ? '' : 'factura-box'}>
      <div style={{ display: 'flex', gap: 8 }}>
        {mostrarNoFacturar && (
          <button type="button" className={sinFactura ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1 }} onClick={() => setNoFacturar(true)}>
            No facturar
          </button>
        )}
        <button type="button" className={!sinFactura && modo === 'cliente' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1 }} onClick={() => elegirModo('cliente')}>
          A cliente
        </button>
        <button type="button" className={!sinFactura && modo === 'mi' ? 'btn-primary' : 'btn-secondary'} style={{ flex: 1 }} onClick={() => elegirModo('mi')}>
          A mí
        </button>
      </div>

      {sinFactura && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Venta sin factura (se puede facturar después desde Ventas si hace falta).</p>
      )}

      {!sinFactura && modo === 'mi' && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Factura a Consumidor Final, sin datos del cliente.</p>
      )}

      {!sinFactura && modo === 'cliente' && (
        <div style={{ marginTop: 10 }}>
          {clienteId && (
            <label className="campo">
              <span>Datos de facturación guardados</span>
              <select value={datoId} onChange={(e) => elegirDato(e.target.value)} style={{ width: '100%' }} disabled={cargando}>
                {datosGuardados.map((d) => <option key={d.id} value={d.id}>{resumenDatoFacturacion(d)}</option>)}
                <option value="">+ Cargar datos nuevos</option>
              </select>
            </label>
          )}

          <label className="campo">
            <span>Condición frente al IVA</span>
            <select value={c.condicion_fiscal} onChange={(e) => form.setCondicionFiscal(e.target.value)} style={{ width: '100%' }}>
              {CONDICIONES_FISCALES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>

          <div className="form-row">
            <select value={c.tipo_documento} onChange={(e) => form.setTipoDocumento(e.target.value)} style={{ maxWidth: 90 }}>
              {(esCF ? ['DNI', 'CUIT', 'CUIL'] : ['CUIT', 'CUIL']).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              placeholder={esCF ? 'Documento (opcional)' : 'Número de CUIT/CUIL'}
              value={c.documento}
              onChange={(e) => cambiarDocumento(e.target.value)}
              inputMode="numeric"
            />
            <button type="button" className="btn-secondary" disabled={docLimpio.length !== 11 || padron.estado === 'buscando'} onClick={() => buscarPadron(docLimpio)} title="Buscar razón social y domicilio en ARCA">
              {padron.estado === 'buscando' ? 'Buscando...' : 'Buscar en ARCA'}
            </button>
          </div>
          {padron.estado === 'ok' && (
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              ✓ Datos traídos de ARCA{padron.condicion ? ` (condición sugerida: ${padron.condicion}; revisá que la de arriba sea la correcta)` : ''}.
            </p>
          )}
          {padron.estado === 'error' && (
            <p className="login-error" style={{ margin: '4px 0 0' }}>
              No se pudo traer de ARCA: {padron.mensaje} Cargá los datos a mano.
            </p>
          )}
          <input
            placeholder={esCF ? 'Nombre y apellido / Razón social (opcional)' : 'Razón social'}
            value={c.nombre}
            onChange={(e) => form.setNombreManual(e.target.value.toUpperCase())}
            style={{ width: '100%', marginTop: 8 }}
          />
          <input
            placeholder="Domicilio (opcional)"
            value={c.direccion}
            onChange={(e) => form.setDireccionManual(e.target.value.toUpperCase())}
            style={{ width: '100%', marginTop: 8 }}
          />
          {error && <p className="login-error" style={{ marginTop: 6 }}>{error}</p>}
          {config
            && /responsable\s+inscripto/i.test(config.condicion_fiscal_negocio || '')
            && !/^s[ií]/i.test(config.factura_a_habilitada || '')
            && ['Responsable Inscripto', 'Monotributista'].includes(c.condicion_fiscal) && (
            <p className="login-error" style={{ marginTop: 6 }}>
              A este cliente le corresponde Factura A, que todavía no está habilitada. La venta se guarda como pendiente de facturar y la facturás desde Ventas cuando se habilite.
            </p>
          )}
          {esNuevo && (
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              {clienteId
                ? 'Estos datos se guardan en el cliente al facturar.'
                : 'La venta no tiene cliente de la agenda: estos datos se usan solo para esta factura.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
