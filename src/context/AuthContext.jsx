import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

// Sistema de un solo usuario (ver Plan de Arquitectura): el login es solo
// con contraseña, no hay usuario/email. El token JWT dura 12hs.
export function AuthProvider({ children }) {
  const [autenticado, setAutenticado] = useState(() => !!localStorage.getItem('token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/auth/login', { password });
      localStorage.setItem('token', data.token);
      setAutenticado(true);
      return true;
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesion');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setAutenticado(false);
  }, []);

  const value = { isAuthenticated: autenticado, login, logout, loading, error };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>');
  return ctx;
}
