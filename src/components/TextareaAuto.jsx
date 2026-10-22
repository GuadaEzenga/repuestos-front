import { useEffect, useLayoutEffect, useRef } from 'react';

// Textarea que crece sola con el texto (para que la descripción completa
// se lea sin cortar). Enter guarda (saca el foco) en vez de hacer salto de línea.
export default function TextareaAuto({ className = '', ...props }) {
  const ref = useRef(null);

  function ajustar() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  useLayoutEffect(ajustar);
  useEffect(() => {
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`textarea-auto ${className}`}
      onInput={ajustar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      {...props}
    />
  );
}
