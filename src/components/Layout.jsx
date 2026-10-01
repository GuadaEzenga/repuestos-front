import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Iconos chicos (16x16, trazo) para que la sidebar se escanee de un vistazo
// en vez de ser 13 líneas de texto todas iguales. Nada de librerías nuevas:
// son paths SVG a mano, monocromos, heredan color del texto (currentColor).
function Icono({ path, viewBox = '0 0 24 24' }) {
  return (
    <svg width="16" height="16" viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const ICONOS = {
  dashboard: <Icono path={<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>} />,
  venta: <Icono path={<><path d="M3 3h2l.4 2M7 13h10l3-8H5.4" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></>} />,
  presupuesto: <Icono path={<><path d="M6 2h9l3 3v17H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>} />,
  ventas: <Icono path={<><path d="M4 4h16v4H4z" /><path d="M6 8v12h12V8" /><path d="M10 12h4" /></>} />,
  devolucion: <Icono path={<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>} />,
  producto: <Icono path={<><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>} />,
  grupo: <Icono path={<><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>} />,
  categoria: <Icono path={<><path d="M20.6 12.9 12 21.5 2.5 12 2.5 2.5 12 2.5z" /><circle cx="7" cy="7" r="1.3" /></>} />,
  cliente: <Icono path={<><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c1.4-3.5 4.2-5.5 7.5-5.5s6.1 2 7.5 5.5" /></>} />,
  gasto: <Icono path={<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14" r="1.2" /></>} />,
  reporte: <Icono path={<><path d="M4 20V10M11 20V4M18 20v-7" /></>} />,
  empleado: <Icono path={<><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a7 7 0 0 1 14 0v2" /><path d="M17 4.5a4 4 0 0 1 0 7.8" /></>} />,
  configuracion: <Icono path={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z" /></>} />,
  mas: <Icono path={<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>} />,
};

// En celular no entran los 13 links en una barra inferior, así que se fijan
// los 4 más usados en el día a día y el resto queda atrás de "Más".
const RUTAS_PRINCIPALES_MOBILE = ['/', '/nueva-venta', '/ventas', '/productos'];

// Agrupado en secciones en vez de 13 links sueltos al mismo nivel, para que
// se pueda escanear rápido dónde está cada cosa.
const NAV_SECTIONS = [
  {
    titulo: null,
    items: [{ to: '/', label: 'Dashboard', end: true, icono: ICONOS.dashboard }],
  },
  {
    titulo: 'Ventas',
    items: [
      { to: '/nueva-venta', label: 'Nueva venta', icono: ICONOS.venta },
      { to: '/presupuestos', label: 'Presupuestos', icono: ICONOS.presupuesto },
      { to: '/ventas', label: 'Ventas', icono: ICONOS.ventas },
      { to: '/devoluciones', label: 'Devoluciones y cambios', icono: ICONOS.devolucion },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { to: '/productos', label: 'Productos', icono: ICONOS.producto },
      { to: '/grupos', label: 'Grupos', icono: ICONOS.grupo },
      { to: '/categorias', label: 'Categorías', icono: ICONOS.categoria },
    ],
  },
  {
    titulo: 'Negocio',
    items: [
      { to: '/clientes', label: 'Clientes', icono: ICONOS.cliente },
      { to: '/gastos', label: 'Gastos', icono: ICONOS.gasto },
      { to: '/reportes', label: 'Reportes', icono: ICONOS.reporte },
    ],
  },
  {
    titulo: 'Sistema',
    items: [
      { to: '/empleado', label: 'Empleado', icono: ICONOS.empleado },
      { to: '/configuracion', label: 'Configuración', icono: ICONOS.configuracion },
    ],
  },
];

export default function Layout() {
  const { logout } = useAuth();
  const location = useLocation();
  const [mostrarMas, setMostrarMas] = useState(false);

  // Cerrar el panel "Más" al cambiar de página (si no, queda abierto tapando
  // la pantalla nueva) y con Escape, como el resto de los overlays de la app.
  useEffect(() => { setMostrarMas(false); }, [location.pathname]);
  useEffect(() => {
    if (!mostrarMas) return;
    function alEscape(e) { if (e.key === 'Escape') setMostrarMas(false); }
    window.addEventListener('keydown', alEscape);
    return () => window.removeEventListener('keydown', alEscape);
  }, [mostrarMas]);

  const todosLosItems = NAV_SECTIONS.flatMap((s) => s.items);
  const itemsPrincipalesMobile = RUTAS_PRINCIPALES_MOBILE
    .map((ruta) => todosLosItems.find((i) => i.to === ruta))
    .filter(Boolean);
  const seccionesMas = NAV_SECTIONS
    .map((seccion) => ({ ...seccion, items: seccion.items.filter((i) => !RUTAS_PRINCIPALES_MOBILE.includes(i.to)) }))
    .filter((seccion) => seccion.items.length > 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">
          <img src="/logo-icon.png" alt="" className="sidebar-logo" />
          <span>Casa de Refrigeración</span>
        </div>
        <nav>
          {NAV_SECTIONS.map((seccion) => (
            <div className="nav-section" key={seccion.titulo || 'inicio'}>
              {seccion.titulo && <div className="nav-section-title">{seccion.titulo}</div>}
              {seccion.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                >
                  {item.icono}
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="logout-btn" onClick={logout}>Cerrar sesión</button>
      </aside>

      {/* Barra inferior fija, solo visible en celular (ver @media en App.css).
          Reemplaza la barra horizontal scrolleable: con el pulgar es más
          cómodo tocar algo fijo abajo que ir a buscarlo arriba. */}
      <nav className="bottom-nav">
        {itemsPrincipalesMobile.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 'bottom-nav-link' + (isActive ? ' active' : '')}
          >
            {item.icono}
            <span>{item.label === 'Nueva venta' ? 'Venta' : item.label}</span>
          </NavLink>
        ))}
        <button type="button" className={'bottom-nav-link' + (mostrarMas ? ' active' : '')} onClick={() => setMostrarMas(true)}>
          {ICONOS.mas}
          <span>Más</span>
        </button>
      </nav>

      {mostrarMas && (
        <div className="modal-overlay bottom-sheet-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setMostrarMas(false); }}>
          <div className="bottom-sheet">
            <div className="modal-header">
              <h2>Más opciones</h2>
              <button type="button" className="modal-cerrar" onClick={() => setMostrarMas(false)} aria-label="Cerrar">×</button>
            </div>
            {seccionesMas.map((seccion) => (
              <div key={seccion.titulo || 'otros'} className="bottom-sheet-seccion">
                {seccion.titulo && <div className="nav-section-title">{seccion.titulo}</div>}
                <div className="bottom-sheet-grid">
                  {seccion.items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className="bottom-sheet-link">
                      {item.icono}
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: 4 }} onClick={logout}>Cerrar sesión</button>
          </div>
        </div>
      )}

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
