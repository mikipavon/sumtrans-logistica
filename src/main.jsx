import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { registrarError, engancharErroresGlobales } from './utils/errorLog'
import { esRuidoDeSesion } from './utils/ruidoDeSesion'

// --- EMERGENCY GLOBAL ERROR HANDLER ---
//
// La pantalla roja es para una sola cosa: que la app NO haya llegado a arrancar
// (lo típico, las variables de Vercel vacías). En cuanto la app está en marcha,
// borrarla entera por un fallo suelto es peor que el fallo: al repartidor se le
// queda el móvil muerto a mitad de ruta por algo que a lo mejor no le afectaba.
//
// Con la app ya montada, un fallo de fondo se registra en la nube y se deja pasar;
// los fallos de pantalla los sigue recogiendo el ErrorBoundary, que enseña su aviso
// sin tirar la sesión.
let appMontada = false;
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
  if (!appMontada) displayError(`${message}\n\nEn: ${source}:${lineno}:${colno}`);
  return false;
};

window.onunhandledrejection = (event) => {
  // Supabase renueva la sesión sola en segundo plano. Si la app está abierta dos
  // veces en el mismo móvil, las dos copias forcejean por el mismo cerrojo y la
  // que lo pierde suelta un error que no le importa a nadie. No es un fallo.
  if (esRuidoDeSesion(event?.reason)) {
    event.preventDefault?.();
    return;
  }
  if (!appMontada) displayError(`Promesa fallida: ${event.reason}`);
};

// En producción Vite pre-carga los ficheros que necesita cada pantalla. Si uno no
// baja (justo después de un despliegue el trozo antiguo ya no existe), en vez de
// dejar caer el error se recarga la página y el navegador coge la versión nueva.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

// Se engancha DESPUÉS de los de arriba para no sustituirlos: la pantalla roja se
// sigue viendo igual, y además queda constancia del error en la nube.
engancharErroresGlobales();

try {
  const container = document.getElementById('root');
  if (!container) throw new Error('No se encontró el elemento #root en el DOM');

  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary origen="app">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )

  // A partir de aquí la app está en pie: la pantalla roja ya no debe salir nunca.
  appMontada = true;
} catch (e) {
  registrarError(e, { origen: 'arranque' });
  displayError(e.message);
}

// PWA Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW Registration error', err));
  });
}
