// Los campos numéricos de todo el sistema tienen que aceptar coma o punto
// como separador decimal indistintamente (pedido del Notion: "la coma y el
// punto deben funcionar igual, para marcar decimales"). Los <input
// type="number"> nativos del navegador no dejan escribir una coma en muchas
// configuraciones, así que estos campos usan <input type="text"
// inputMode="decimal"> y esta función para interpretar el valor tipeado.
export function parseNumero(valor) {
  if (valor === '' || valor == null) return null;
  const texto = String(valor).trim().replace(',', '.');
  if (texto === '') return null;
  const num = Number(texto);
  return Number.isNaN(num) ? null : num;
}
