import { useMemo, useRef, useState } from 'react';
import { coincideTexto } from '../utils/busqueda';

// Buscador compacto de un producto: se escribe por palabras sueltas en
// cualquier orden (igual que Nueva venta) y se elige de la lista. Una vez
// elegido queda como "chip" con su stock; la × lo vuelve a buscar.
export default function BuscadorProducto({ productos, value, onChange, placeholder = 'Buscar producto...', maxResultados = 30 }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const inputRef = useRef(null);
  const elegido = value ? productos.find((p) => String(p.id) === String(value)) : null;

  const resultados = useMemo(() => {
    if (!abierto) return [];
    const q = texto.trim();
    return productos
      .filter((p) => !q || coincideTexto(`${p.codigo || ''} ${p.descripcion || ''}`, q))
      .slice(0, maxResultados);
  }, [abierto, texto, productos, maxResultados]);

  function elegir(p) {
    onChange(String(p.id));
    setTexto('');
    setAbierto(false);
  }

  if (elegido) {
    return (
      <div className="buscador-chip" title={elegido.descripcion}>
        <span className="buscador-chip-texto">{elegido.descripcion}</span>
        <span className="buscador-chip-stock">stock {Number(elegido.stock ?? 0).toLocaleString('es-AR')}</span>
        <button type="button" aria-label="Cambiar" onClick={() => { onChange(''); setTimeout(() => inputRef.current?.focus(), 0); }}>×</button>
      </div>
    );
  }

  return (
    <div className="buscador-mini">
      <input
        ref={inputRef}
        value={texto}
        placeholder={placeholder}
        onChange={(e) => { setTexto(e.target.value); setResaltado(0); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setResaltado((i) => Math.min(i + 1, resultados.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setResaltado((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && resultados[resaltado]) { e.preventDefault(); elegir(resultados[resaltado]); }
          if (e.key === 'Escape') setAbierto(false);
        }}
      />
      {abierto && resultados.length > 0 && (
        <ul className="buscador-mini-lista">
          {resultados.map((p, i) => (
            <li
              key={p.id}
              className={i === resaltado ? 'activo' : ''}
              onMouseDown={(e) => { e.preventDefault(); elegir(p); }}
              onMouseEnter={() => setResaltado(i)}
            >
              <span>{p.codigo ? <span className="muted">#{p.codigo} · </span> : null}{p.descripcion}</span>
              <span className="muted">stock {Number(p.stock ?? 0).toLocaleString('es-AR')}</span>
            </li>
          ))}
        </ul>
      )}
      {abierto && texto.trim() && resultados.length === 0 && (
        <ul className="buscador-mini-lista"><li className="muted">Sin resultados</li></ul>
      )}
    </div>
  );
}
