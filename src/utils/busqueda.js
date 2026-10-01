// Búsqueda "como el programa original": sin importar mayúsculas/minúsculas ni
// tildes, y por palabras sueltas en cualquier orden (si buscás "1/4 ca" tiene
// que encontrar "[1] CAÑO DE COBRE 1/4" aunque el orden de las palabras sea
// distinto al de la descripción).
export function normalizarTexto(s) {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca tildes/diacríticos
    .toUpperCase();
}

// true si TODAS las palabras de la búsqueda aparecen (como substring, en
// cualquier orden) dentro del texto.
export function coincideTexto(texto, query) {
  const t = normalizarTexto(texto);
  const tokens = normalizarTexto(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => t.includes(tok));
}
