import api from '../api/client';

// Achica una imagen en el navegador antes de subirla (las fotos del celular
// pesan varios MB). Devuelve un data URL JPEG.
export function achicarImagen(archivo, maxLado, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const ancho = Math.max(1, Math.round(img.width * escala));
        const alto = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // fondo blanco para PNG con transparencia
        ctx.fillRect(0, 0, ancho, alto);
        ctx.drawImage(img, 0, 0, ancho, alto);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

export async function prepararImagen(archivo) {
  const [imagen, miniatura] = await Promise.all([
    achicarImagen(archivo, 1000, 0.8),
    achicarImagen(archivo, 160, 0.7),
  ]);
  return { imagen, miniatura };
}

// --- Cache de miniaturas (primera imagen de cada producto) ---
// Se piden por lotes y quedan en memoria mientras la app esté abierta.
const cache = new Map(); // productoId -> dataUrl | null
const pendientes = new Set();
const suscriptores = new Set();
let timer = null;

function avisar() {
  for (const fn of suscriptores) fn();
}

async function pedirLote() {
  timer = null;
  const ids = [...pendientes].slice(0, 200);
  ids.forEach((id) => pendientes.delete(id));
  if (ids.length === 0) return;
  try {
    const mapa = await api.get('/productos/miniaturas', { ids: ids.join(',') });
    for (const id of ids) cache.set(String(id), mapa?.[id] || null);
  } catch {
    for (const id of ids) cache.set(String(id), null);
  }
  avisar();
  if (pendientes.size > 0) timer = setTimeout(pedirLote, 0);
}

export function obtenerMiniatura(productoId) {
  const clave = String(productoId);
  if (cache.has(clave)) return cache.get(clave);
  if (!pendientes.has(clave)) {
    pendientes.add(clave);
    if (!timer) timer = setTimeout(pedirLote, 30);
  }
  return undefined; // cargando
}

export function olvidarMiniatura(productoId) {
  cache.delete(String(productoId));
  avisar();
}

export function suscribirMiniaturas(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}
