import { Component } from 'react';

// Si una pantalla falla al dibujarse, en vez de quedar la página en blanco
// muestra un aviso con el error y botones para recargar o volver al inicio.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error en pantalla:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Algo falló al mostrar esta pantalla</h2>
        <p style={{ color: '#6b7280' }}>Probá recargar. Si vuelve a pasar, sacale una captura a este mensaje:</p>
        <pre style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, textAlign: 'left', whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Recargar</button>
          <button type="button" className="btn-secondary" onClick={() => { window.location.href = '/'; }}>Ir al inicio</button>
        </div>
      </div>
    );
  }
}
