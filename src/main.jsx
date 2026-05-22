import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// --- EMERGENCY GLOBAL ERROR HANDLER ---
const displayError = (msg) => {
  const root = document.getElementById('root');
  if (root) {
    const sbUrl = import.meta.env.VITE_SUPABASE_URL || '❌ (Variable vacía en Vercel)';
    root.innerHTML = `<div style="padding: 20px; color: #ef4444; font-family: sans-serif; background: #fee2e2; border: 4px solid #f87171;">
      <h2 style="margin-top:0">⚠️ Error Crítico en Aplicación</h2>
      <p>La web no ha podido cargar por un error técnico interno.</p>
      
      <div style="background: #fff; padding: 10px; margin-bottom: 10px; border: 1px solid #f87171; font-size: 13px;">
        <strong>Diagnóstico de Red:</strong><br/>
        VITE_SUPABASE_URL: <code style="background:#eee; padding:2px 4px;">${sbUrl}</code>
      </div>

      <pre style="white-space: pre-wrap; font-size: 12px; background: #fff; padding: 10px; border: 1px solid #f87171;">${msg}</pre>
      
      <p style="font-size: 13px; color: #7f1d1d;">Si la URL de arriba es vacía o incorrecta, por favor revisa el panel de Vercel.</p>
      
      <button onclick="window.location.reload()" style="background: #ef4444; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">Reintentar Carga</button>
    </div>`;
  }
};

window.onerror = (message, source, lineno, colno, error) => {
  displayError(`${message}\n\nEn: ${source}:${lineno}:${colno}`);
  return false;
};

window.onunhandledrejection = (event) => {
  displayError(`Promesa fallida: ${event.reason}`);
};

try {
  const container = document.getElementById('root');
  if (!container) throw new Error('No se encontró el elemento #root en el DOM');
  
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  displayError(e.message);
}

// PWA Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW Registration error', err));
  });
}
