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
//                         condicionFiscal se bloquea SOLO si el backend pudo inferirla con certeza
//                         (ver inferirCondicionFiscal en utils/afip.js) -- si vino null, queda
//                         editable con un aviso, porque ahi la "adivinanza" es nuestra, no de AFIP.
//   NOT_FOUND_OR_ERROR -> el padron no devolvio nada o AFIP no respondio: todo se desbloquea para
//                         carga manual, con una advertencia visual.
export const ESTADO_CLIENTE_FACTURA = {
  IDLE: 'IDLE',
  SEARCHING: 'SEARCHING',
  FOUND: 'FOUND',
  NOT_FOUND_OR_ERROR: 'NOT_FOUND_OR_ERROR',
};

// Condiciones fiscales que, como en ARCA, exigen SI O SI un CUIT/CUIL
// valido y una razon social cargada -- "Consumidor Final" es la unica que
// se puede facturar sin ningun dato del cliente.
const CONDICIONES_QUE_REQUIEREN_DOCUMENTO = ['Responsable Inscripto', 'Monotributista', 'Exento', 'No Responsable'];

const CAMPOS_VACIOS = { nombre: '', tipo_documento: 'CUIT', documento: '', condicion_fiscal: 'Consumidor Final', direccion: '' };

export function useFacturacionCliente() {
  const [estado, setEstado] = useState(ESTADO_CLIENTE_FACTURA.IDLE);
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [errorPadron, setErrorPadron] = useState(null);
  // true si el ultimo FOUND vino con una condicionFiscal que el backend
  // pudo inferir (no null) -- determina si ese campo en particular queda
  // bloqueado o no (ver comentario de arriba).
  const [condicionFiscalConfirmada, setCondicionFiscalConfirmada] = useState(false);

  // Evita aplicar la respuesta de una busqueda vieja si el documento volvio
  // a cambiar mientras la peticion estaba en vuelo (el usuario borro y
  // tipeo otro CUIT antes de que vuelva la primera respuesta).
  const idBusquedaRef = useRef(0);

  const reset = useCallback((siguiente = {}) => {
    idBusquedaRef.current += 1;
    setEstado(ESTADO_CLIENTE_FACTURA.IDLE);
    setErrorPadron(null);
    setCondicionFiscalConfirmada(false);
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
        condicion_fiscal: datos.condicionFiscal || c.condicion_fiscal,
        direccion: datos.domicilio || c.direccion,
      }));
      setCondicionFiscalConfirmada(Boolean(datos.condicionFiscal));
      setEstado(ESTADO_CLIENTE_FACTURA.FOUND);
    } catch (err) {
      if (idBusqueda !== idBusquedaRef.current) return;
      setErrorPadron(err.message);
      setCondicionFiscalConfirmada(false);
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
  // ningun dato del cliente). Cualquier otra condicion elegida A MANO
  // (antes de que responda el padron) queda editable hasta que se busque
  // o se cargue un documento.
  function setCondicionFiscal(condicion_fiscal) {
    if (condicion_fiscal === 'Consumidor Final') {
      reset({ condicion_fiscal });
      return;
    }
    setCondicionFiscalConfirmada(false);
    setCampos((c) => ({ ...c, condicion_fiscal }));
  }

  function setNombreManual(nombre) {
    setCampos((c) => ({ ...c, nombre }));
  }

  function setDireccionManual(direccion) {
    setCampos((c) => ({ ...c, direccion }));
  }

  const requiereDocumento = CONDICIONES_QUE_REQUIEREN_DOCUMENTO.includes(campos.condicion_fiscal);

  // Bloqueo de campos, UNO POR UNO -- no todo junto, por la salvedad de
  // condicionFiscal explicada arriba.
  const nombreBloqueado = estado === ESTADO_CLIENTE_FACTURA.FOUND;
  const domicilioBloqueado = estado === ESTADO_CLIENTE_FACTURA.FOUND && Boolean(campos.direccion);
  const condicionFiscalBloqueada = estado === ESTADO_CLIENTE_FACTURA.FOUND && condicionFiscalConfirmada;

  // Matriz de validacion: que hace falta para habilitar "Emitir factura".
  let errorValidacion = null;
  if (requiereDocumento) {
    const docLimpio = campos.documento.replace(/\D/g, '');
    if (estado === ESTADO_CLIENTE_FACTURA.SEARCHING) {
      errorValidacion = 'Esperando la respuesta de AFIP...';
    } else if (docLimpio.length !== 11 || !campos.nombre.trim()) {
      errorValidacion = 'Para esta condición fiscal, el CUIT y la Razón Social son obligatorios.';
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
    condicionFiscalBloqueada,
    condicionFiscalConfirmada,
    buscarEnPadron,
    setDocumento,
    setTipoDocumento,
    setCondicionFiscal,
    setNombreManual,
    setDireccionManual,
    reset,
  };
}
