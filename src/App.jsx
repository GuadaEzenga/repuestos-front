import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { UiProvider } from './context/UiContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NuevaVenta from './pages/NuevaVenta';
import Presupuestos from './pages/Presupuestos';
import Ventas from './pages/Ventas';
import Devoluciones from './pages/Devoluciones';
import Productos from './pages/Productos';
import Grupos from './pages/Grupos';
import Categorias from './pages/Categorias';
import Clientes from './pages/Clientes';
import Gastos from './pages/Gastos';
import Reportes from './pages/Reportes';
import Empleado from './pages/Empleado';
import Configuracion from './pages/Configuracion';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <UiProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/nueva-venta" element={<NuevaVenta />} />
            <Route path="/presupuestos" element={<Presupuestos />} />
            <Route path="/ventas" element={<Ventas />} />
            <Route path="/devoluciones" element={<Devoluciones />} />
            <Route path="/productos" element={<Productos />} />
            <Route path="/grupos" element={<Grupos />} />
            <Route path="/categorias" element={<Categorias />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/gastos" element={<Gastos />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/empleado" element={<Empleado />} />
            <Route path="/configuracion" element={<Configuracion />} />
          </Route>
        </Routes>
      </UiProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
