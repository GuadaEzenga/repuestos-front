import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';

// Maquina de estados del formulario "Facturar" (Ventas.jsx y
// Presupuestos.jsx comparten exactamente esta logica -- antes estaba
// copiada y pegada en los dos archivos, lo que ya nos costo un bug: cuando
// arreglamos el autocompletado de condicion fiscal hubo que acordarse de
// tocar los dos lugares. Vive una sola vez aca.
//
// Replica el comportamiento del portal de ARCA al facturar:
//   IDLE               -> documento vacio, formulario recien abierto o reseteado.
//   SEARCHING          -> hay un CUIT/CUIL de 11 digitos y se esta consultando el padron de AFIP.
//   FOUND              -> el padron respondio con datos. razonSocial/domicilio quedan bloqueados
//                         (read-only) porque son el dato oficial de AFIP, igual que en ARCA. La
//                         condicionFiscal NO se toca: la elige la vendedora a mano ANTES de cargar
//                         el documento (es la unica forma de que aparezca el campo CUIT/CUIL), y el
//                         padron no devuelve un campo "condicion fiscal" real -- lo que
//                         inferirCondicionFiscal() calcula en el backend es una adivinanza sin
//                         validar contra AFIP, asi que nunca pisa ni bloquea la eleccion manual.
//   NOT_FOUND_OR_ERROR -> el padron no devolvio nada o AFIP no respondio: todo se desbloquea para
//                         carga manual, con una advertencia visual.
export const ESTADO_CLIENTE_FACTURA = {
  IDLE: 'IDLE',
  SEARCHING: 'SEARCHING',
  FOUND: 'FOUND',
  NOT_FOUND_OR_ERROR: 'NOT_FOUND_OR_ERROR',
};

// Condiciones fiscales que, como en ARCA, exigen SI O SI un CUIT/CUIL
// valido -- "Consumidor Final" es la unica que se puede facturar sin
// ningun dato del cliente. La razon social NO es requisito de AFIP para
// autorizar el CAE (fecaeSolicitar solo manda DocTipo/DocNro); se sigue
// autocompletando sola desde el padron para que el PDF salga bien, pero
// si el padron no responde no bloquea la emision.
const CONDICIONES_QUE_REQUIEREN_DOCUMENTO = ['Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];

const CAMPOS_VACIOS = { nombre: '', tipo_documento: 'CUIT', documento: '', condicion_fiscal: 'Consumidor Final', direccion: '' };

export function useFacturacionCliente() {
  const [estado, setEstado] = useState(ESTADO_CLIENTE_FACTURA.IDLE);
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [errorPadron, setErrorPadron] = useState(null);

  // Evita aplicar la respuesta de una busqueda vieja si el documento volvio
  // a cambiar mientras la peticion estaba en vuelo (el usuario borro y
  // tipeo otro CUIT antes de que vuelva la primera respuesta).
  const idBusquedaRef = useRef(0);

  const reset = useCallback((siguiente = {}) => {
    idBusquedaRef.current += 1;
    setEstado(ESTADO_CLIENTE_FACTURA.IDLE);
    setErrorPadron(null);
    setCampos({ ...CAMPOS_VACIOS, ...siguiente });
  }, []);

  const buscarEnPadron = useCallback(async (documentoForzado) => {
    const doc = (documentoForzado ?? campos.documento).replace(/\D/g, '');
    if (doc.length !== 11 || !['CUIT', 'CUIL'].includes(campos.tipo_documento)) return;

    const idBusqueda = ++idBusquedaRef.current;
    setEstado(ESTADO_CLIENTE_FACTURA.SEARCHING);
    setErrorPadron(null);
    try {
      const datos = await api.get(`/clientes/padron/${doc}`);
      if (idBusqueda !== idBusquedaRef.current) return; // llego tarde, ya no es la busqueda vigente
      setCampos((c) => ({
        ...c,
        nombre: datos.razonSocial || c.nombre,
        direccion: datos.domicilio || c.direccion,
      }));
      setEstado(ESTADO_CLIENTE_FACTURA.FOUND);
    } catch (err) {
      if (idBusqueda !== idBusquedaRef.current) return;
      setErrorPadron(err.message);
      setEstado(ESTADO_CLIENTE_FACTURA.NOT_FOUND_OR_ERROR);
    }
    // campos.documento/tipo_documento se leen directo del estado actual
    // (closure), no hace falta como dependencia porque buscarEnPadron
    // siempre se llama con el valor mas nuevo (ver el useEffect de abajo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campos.documento, campos.tipo_documento]);

  // Dispara la busqueda SOLA en cuanto el documento llega a 11 digitos (un
  // CUIT/CUIL completo) -- como en ARCA, no hace falta que el usuario
  // aprete ningun boton. El pequeno delay evita pegarle a AFIP en cada
  // tecla si el usuario sigue editando (pegar y corregir un numero).
  //
  // IMPORTANTE: solo se auto-dispara desde IDLE. Si fuera "distinto de FOUND
  // y SEARCHING" (como estaba antes), un NOT_FOUND_OR_ERROR hace que este
  // efecto se re-ejecute (porque "estado" cambio) y, como el documento sigue
  // teniendo 11 digitos, vuelve a buscar -- bucle infinito pegandole a AFIP
  // sin parar cada vez que el padron devuelve error. Que NOT_FOUND_OR_ERROR
  // no reintente solo es intencional: para eso esta el boton "Reintentar".
  useEffect(() => {
    const doc = campos.documento.replace(/\D/g, '');
    if (doc.length !== 11 || !['CUIT', 'CUIL'].includes(campos.tipo_documento)) return;
    if (estado !== ESTADO_CLIENTE_FACTURA.IDLE) return;
    const id = setTimeout(() => buscarEnPadron(doc), 300);
    return () => clearTimeout(id);
  }, [campos.documento, campos.tipo_documento, estado, buscarEnPadron]);

  function setDocumento(documento) {
    idBusquedaRef.current += 1; // cualquier busqueda en vuelo queda invalidada
    setErrorPadron(null);
    setCampos((c) => ({ ...c, documento }));
    // Cualquier edicion del documento vuelve a IDLE -- invalida un resultado
    // (FOUND) o un error (NOT_FOUND_OR_ERROR) anterior, y el efecto de
    // arriba dispara una busqueda nueva en cuanto vuelva a completar 11
    // digitos.
    setEstado(ESTADO_CLIENTE_FACTURA.IDLE);
  }

  function setTipoDocumento(tipo_documento) {
    setCampos((c) => ({ ...c, tipo_documento }));
  }

  // Al elegir "Consumidor Final" se limpia todo (no hace falta, ni se usa,
  // ningun dato del cliente). Cualquier otra condicion queda siempre editable
  // -- es una decision de la vendedora, el padron no la pisa (ver comentario
  // arriba de ESTADO_CLIENTE_FACTURA).
  function setCondicionFiscal(condicion_fiscal) {
    if (condicion_fiscal === 'Consumidor Final') {
      reset({ condicion_fiscal });
      return;
    }
    setCampos((c) => ({ ...c, condicion_fiscal }));
  }

  function setNombreManual(nombre) {
    setCampos((c) => ({ ...c, nombre }));
  }

  function setDireccionManual(direccion) {
    setCampos((c) => ({ ...c, direccion }));
  }

  const requiereDocumento = CONDICIONES_QUE_REQUIEREN_DOCUMENTO.includes(campos.condicion_fiscal);

  // Bloqueo de campos: solo nombre/domicilio, que son el dato oficial de
  // AFIP una vez que el padron respondio. condicionFiscal nunca se bloquea
  // (la elige la vendedora, ver comentario arriba).
  const nombreBloqueado = estado === ESTADO_CLIENTE_FACTURA.FOUND;
  const domicilioBloqueado = estado === ESTADO_CLIENTE_FACTURA.FOUND && Boolean(campos.direccion);

  // Matriz de validacion: que hace falta para habilitar "Emitir factura".
  let errorValidacion = null;
  if (requiereDocumento) {
    const docLimpio = campos.documento.replace(/\D/g, '');
    if (estado === ESTADO_CLIENTE_FACTURA.SEARCHING) {
      errorValidacion = 'Esperando la respuesta de AFIP...';
    } else if (docLimpio.length !== 11) {
      errorValidacion = 'Para esta condición fiscal hace falta un CUIT o CUIL válido (11 dígitos).';
    }
  }

  return {
    estado,
    campos,
    errorPadron,
    errorValidacion,
    puedeEmitir: errorValidacion === null,
    requiereDocumento,
    nombreBloqueado,
    domicilioBloqueado,
    buscarEnPadron,
    setDocumento,
    setTipoDocumento,
    setCondicionFiscal,
    setNombreManual,
    setDireccionManual,
    reset,
  };
}
