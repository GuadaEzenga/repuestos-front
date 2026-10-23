import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Si después de publicar una versión nueva el navegador intenta cargar un
// archivo de la versión vieja que ya no existe, recarga una vez sola.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  if (!sessionStorage.getItem('recargado-por-version')) {
    sessionStorage.setItem('recargado-por-version', '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('recargado-por-version'), 10000));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
