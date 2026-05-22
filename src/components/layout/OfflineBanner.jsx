import { WifiOff, RefreshCw, CheckCircle, CloudOff } from 'lucide-react';

/**
 * OfflineBanner
 * Shows a fixed banner at the top of the screen communicating the connectivity state.
 *
 * States:
 *  - offline:          Red banner — no connection, N operations queued
 *  - justReconnected:  Green banner — syncing queued operations
 *  - online (normal):  Nothing shown
 */
export default function OfflineBanner({ isOnline, justReconnected, pendingCount, isSyncing }) {
  // Fully online and no pending state — render nothing
  if (isOnline && !justReconnected) return null;

  if (!isOnline) {
    return (
      <div
        style={{ zIndex: 9999 }}
        className="fixed top-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-lg animate-in slide-in-from-top-2 duration-300"
      >
        <div className="flex items-center gap-2 shrink-0">
          <WifiOff size={16} className="shrink-0" />
          <span className="text-sm font-bold tracking-tight">SIN COBERTURA</span>
        </div>

        <div className="w-px h-4 bg-white/30" />

        <p className="text-xs font-medium opacity-90">
          {pendingCount > 0
            ? `${pendingCount} operación${pendingCount > 1 ? 'es' : ''} guardada${pendingCount > 1 ? 's' : ''} — se sincronizará${pendingCount > 1 ? 'n' : ''} al recuperar señal`
            : 'Trabajando en modo local. Los cambios se sincronizarán al recuperar señal.'}
        </p>

        {pendingCount > 0 && (
          <span className="ml-auto shrink-0 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full border border-white/30">
            {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  }

  // justReconnected — show syncing or done state
  if (justReconnected) {
    return (
      <div
        style={{ zIndex: 9999 }}
        className="fixed top-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-500 text-white shadow-lg animate-in slide-in-from-top-2 duration-300"
      >
        {isSyncing ? (
          <>
            <RefreshCw size={16} className="animate-spin shrink-0" />
            <span className="text-sm font-bold">Sincronizando operaciones pendientes...</span>
          </>
        ) : (
          <>
            <CheckCircle size={16} className="shrink-0" />
            <span className="text-sm font-bold">Conexión restaurada — todo sincronizado ✓</span>
          </>
        )}
      </div>
    );
  }

  return null;
}
