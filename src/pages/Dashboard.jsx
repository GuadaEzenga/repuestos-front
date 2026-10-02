import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import api from '../api/client';

const COLORES = ['#166e79', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0d2035'];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// 30 días atrás (en horario local, no UTC, para que no se corra un día
// según la zona horaria del navegador) — el default de toda la vida, antes
// de que quedara "desde el 1 del mes" sin querer.
function hace30DiasISO() {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 29);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

// Los nombres de eje en un gráfico de barras se cortan si son muy largos.
function nombreCorto(texto, max = 22) {
  const t = texto || '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor || 0);
}

// Mismo rango de días, inmediatamente anterior al elegido (si el período es
// "del 1 al 15", el anterior es "del 16 al 30 del mes pasado" según la
// cantidad de días, no fijo a "mes anterior"). Sirve para la comparación de
// cada card ("+12% vs. período anterior").
function rangoAnterior(desdeStr, hastaStr) {
  const desdeDate = new Date(`${desdeStr}T00:00:00`);
  const hastaDate = new Date(`${hastaStr}T00:00:00`);
  const cantidadDias = Math.round((hastaDate - desdeDate) / 86400000) + 1;
  const prevHasta = new Date(desdeDate);
  prevHasta.setDate(prevHasta.getDate() - 1);
  const prevDesde = new Date(prevHasta);
  prevDesde.setDate(prevDesde.getDate() - (cantidadDias - 1));
  const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { desde: aISO(prevDesde), hasta: aISO(prevHasta) };
}

// Ícono chico (18x18) para las stat-cards, mismo estilo que los de la
// sidebar: trazo monocromo que hereda el color del texto.
function IconoStat({ path }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const ICONOS_STAT = {
  ingresos: <IconoStat path={<><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>} />,
  ganancia: <IconoStat path={<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>} />,
  margen: <IconoStat path={<><path d="M5 19 19 5" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>} />,
  neto: <IconoStat path={<><rect x="2.5" y="6" width="19" height="14" rx="2" /><path d="M2.5 10h19" /><circle cx="17.5" cy="15" r="1.3" /></>} />,
  ventas: <IconoStat path={<><path d="M3 3h2l.4 2M7 13h10l3-8H5.4" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></>} />,
  stock: <IconoStat path={<><path d="M21 8l-9-5-9 5v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>} />,
};

// Flechita + "% vs. período anterior" para cada card. `masEsMejor=false` es
// para las cards donde subir es malo (ej. gastos): invierte el color.
function Tendencia({ actual, anterior, masEsMejor = true }) {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  const variacionPct = ((actual - anterior) / Math.abs(anterior)) * 100;
  if (!Number.isFinite(variacionPct) || Math.abs(variacionPct) < 0.5) {
    return <div className="stat-trend muted">= vs. período anterior</div>;
  }
  const subio = variacionPct > 0;
  const esBueno = subio === masEsMejor;
  return (
    <div className={`stat-trend ${esBueno ? 'trend-up' : 'trend-down'}`}>
      {subio ? '↑' : '↓'} {Math.abs(variacionPct).toFixed(0)}% vs. período anterior
    </div>
  );
}

// Tooltip del grafico de ingresos x dia: muestra el ingreso del dia y, como
// detalle debajo, la cantidad de ventas de ese dia (pedido del Notion).
function TooltipIngresosPorDia({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  return (
    <div style={{ background: '#111827', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Día {label}</div>
      <div>Ingresos: {formatoMoneda(punto.ingresos)}</div>
      <div className="muted">{punto.cantidad_ventas} venta{punto.cantidad_ventas === 1 ? '' : 's'}</div>
    </div>
  );
}

export default function Dashboard() {
  // Por defecto muestra el mes en curso (del día 1 hasta hoy), asi al entrar
  // no aparece todo vacío y hay que ponerse a elegir fechas. Se puede
  // cambiar el rango libremente desde los filtros de abajo.
  const [desde, setDesde] = useState(hace30DiasISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [data, setData] = useState(null);
  const [dataAnterior, setDataAnterior] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function cargar(desdeParam, hastaParam) {
    setLoading(true);
    setError(null);
    try {
      const anterior = rangoAnterior(desdeParam, hastaParam);
      const [resultado, resultadoAnterior] = await Promise.all([
        api.get('/dashboard', { desde: desdeParam, hasta: hastaParam }),
        api.get('/dashboard', anterior),
      ]);
      setData(resultado);
      setDataAnterior(resultadoAnterior);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar(desde, hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicarFiltro(e) {
    e.preventDefault();
    cargar(desde, hasta);
  }

  return (
    <div className="page">
      <div className="dashboard-toolbar">
        <h1>Dashboard</h1>
        <Link to="/nueva-venta">
          <button type="button" className="primary" style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600 }}>
            + Nueva venta
          </button>
        </Link>
      </div>

      <form className="date-filters" onSubmit={aplicarFiltro} style={{ marginBottom: 20 }}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span className="muted">a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button type="submit" className="primary">Filtrar</button>
      </form>

      {loading && <div className="loading">Cargando...</div>}
      {error && <div className="error-box">{error}</div>}

      {data && !loading && (
        <>
          <div className="cards-row">
            <div className="stat-card">
              <div className="stat-card-top">
                <div className="label">Ingresos</div>
                <span className="stat-icon">{ICONOS_STAT.ingresos}</span>
              </div>
              <div className="value">{formatoMoneda(data.ingresos)}</div>
              {dataAnterior && <Tendencia actual={data.ingresos} anterior={dataAnterior.ingresos} />}
            </div>
            <div className={`stat-card ${data.ganancia >= 0 ? 'positive' : 'negative'}`}>
              <div className="stat-card-top">
                <div className="label">Ganancia</div>
                <span className="stat-icon">{ICONOS_STAT.ganancia}</span>
              </div>
              <div className="value">{formatoMoneda(data.ganancia)}</div>
              {dataAnterior && <Tendencia actual={data.ganancia} anterior={dataAnterior.ganancia} />}
            </div>
            <div className={`stat-card ${data.ingresos > 0 && data.ganancia >= 0 ? 'positive' : data.ingresos > 0 ? 'negative' : ''}`}>
              <div className="stat-card-top">
                <div className="label">Margen de ganancia</div>
                <span className="stat-icon">{ICONOS_STAT.margen}</span>
              </div>
              <div className="value">
                {data.ingresos > 0 ? `${((data.ganancia / data.ingresos) * 100).toFixed(1)}%` : '—'}
              </div>
              {dataAnterior && dataAnterior.ingresos > 0 && data.ingresos > 0 && (
                <Tendencia
                  actual={(data.ganancia / data.ingresos) * 100}
                  anterior={(dataAnterior.ganancia / dataAnterior.ingresos) * 100}
                />
              )}
            </div>
            <div className={`stat-card tooltip-host ${data.neto >= 0 ? 'positive' : 'negative'}`}>
              <div className="stat-card-top">
                <div className="label">Neto</div>
                <span className="stat-icon">{ICONOS_STAT.neto}</span>
              </div>
              <div className="value">{formatoMoneda(data.neto)}</div>
              {dataAnterior && <Tendencia actual={data.neto} anterior={dataAnterior.neto} />}
              <div className="tooltip-panel">
                <div className="tooltip-fila">
                  <span>Ingresos</span>
                  <span>{formatoMoneda(data.ingresos)}</span>
                </div>
                <div className="tooltip-fila">
                  <span>− Gastos</span>
                  <span>
                    {formatoMoneda(
                      data.dona_gastos_por_tipo.reduce((acc, g) => acc + Number(g.total || 0), 0)
                    )}
                  </span>
                </div>
                <div className="tooltip-separador" />
                <div className="tooltip-fila tooltip-total">
                  <span>Neto</span>
                  <span>{formatoMoneda(data.neto)}</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-top">
                <div className="label">Ventas</div>
                <span className="stat-icon">{ICONOS_STAT.ventas}</span>
              </div>
              <div className="value">{data.cantidad_ventas}</div>
              {dataAnterior && <Tendencia actual={data.cantidad_ventas} anterior={dataAnterior.cantidad_ventas} />}
            </div>
            <div className="stat-card">
              <div className="stat-card-top">
                <div className="label">Gastos en stock</div>
                <span className="stat-icon">{ICONOS_STAT.stock}</span>
              </div>
              <div className="value">{formatoMoneda(data.gastos_stock)}</div>
              {dataAnterior && <Tendencia actual={data.gastos_stock} anterior={dataAnterior.gastos_stock} masEsMejor={false} />}
            </div>
          </div>

          <div className="charts-grid">
            <div className="panel">
              <h2>Ingresos por día</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.serie_ingresos_por_dia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="dia" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => formatoMoneda(v)} width={90} />
                  <Tooltip content={<TooltipIngresosPorDia />} />
                  <Line type="monotone" dataKey="ingresos" stroke="#166e79" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="panel panel-chart">
              <h2>Ventas por método de pago</h2>
              <div className="panel-chart-body">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.dona_metodo_pago} dataKey="cantidad_ventas" nameKey="metodo_pago" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {data.dona_metodo_pago.map((entry, i) => (
                        <Cell key={entry.metodo_pago} fill={COLORES[i % COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => [`${value} venta${value === 1 ? '' : 's'} (${formatoMoneda(props.payload.total)})`, props.payload.metodo_pago]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="charts-grid-3">
            <div className="panel panel-chart">
              <h2>Gastos por tipo</h2>
              <div className="panel-chart-body">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.dona_gastos_por_tipo} dataKey="total" nameKey="tipo" cx="50%" cy="50%" innerRadius={45} outerRadius={75}>
                      {data.dona_gastos_por_tipo.map((entry, i) => (
                        <Cell key={entry.tipo} fill={COLORES[i % COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatoMoneda(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel">
              <h2>Productos más vendidos</h2>
              {data.top_productos.length === 0 ? (
                <p className="muted">Sin datos en el período</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, data.top_productos.slice(0, 8).length * 36)}>
                  <BarChart data={data.top_productos.slice(0, 8).map((p) => ({ nombre: nombreCorto(p.descripcion), unidades: p.unidades }))} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                    <XAxis type="number" fontSize={12} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" fontSize={12} width={140} />
                    <Tooltip formatter={(value) => [`${value} unidad${value === 1 ? '' : 'es'}`, 'Vendidas']} />
                    <Bar dataKey="unidades" fill="#166e79" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="panel">
              <h2>Mejores clientes</h2>
              {data.top_clientes.length === 0 ? (
                <p className="muted">Sin datos en el período</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, data.top_clientes.slice(0, 8).length * 36)}>
                  <BarChart data={data.top_clientes.slice(0, 8).map((c) => ({ nombre: nombreCorto(`${c.nombre} ${c.apellido || ''}`.trim()), gastado: Number(c.total_gastado) }))} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                    <XAxis type="number" fontSize={12} tickFormatter={(v) => formatoMoneda(v)} />
                    <YAxis type="category" dataKey="nombre" fontSize={12} width={140} />
                    <Tooltip formatter={(value) => formatoMoneda(value)} />
                    <Bar dataKey="gastado" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
