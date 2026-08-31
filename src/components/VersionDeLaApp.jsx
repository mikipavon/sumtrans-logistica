/**
 * La versión que lleva puesta este móvil.
 *
 * Cuando a un repartidor le falla algo, lo primero que hay que saber en la oficina es
 * si tiene el código nuevo o sigue con el viejo — la app es una PWA y puede quedarse
 * con la versión anterior hasta que se cierra del todo. Hasta ahora no había forma de
 * saberlo: `app_version` salía de package.json y siempre valía lo mismo.
 *
 * El NÚMERO sube con cada cambio, así que dos versiones nunca se confunden y se ve de
 * un vistazo cuál es más nueva. Debajo, la fecha (para preguntarla por teléfono) y el
 * commit en pequeño (para localizarlo en el repositorio).
 */
const VersionDeLaApp = () => {
    const numero = typeof __APP_BUILD_NUMBER__ !== 'undefined' ? __APP_BUILD_NUMBER__ : null;
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    const compilada = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : null;

    const fecha = compilada
        ? new Date(compilada).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
        : null;

    return (
        <div className="text-center py-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Versión de la app
            </p>
            <p className="text-2xl font-black text-slate-600 leading-none mt-1">
                {numero != null ? numero : '—'}
            </p>
            <p className="text-xs font-bold text-slate-500 mt-1">
                {fecha || 'sin fecha'}
            </p>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{version}</p>
        </div>
    );
};

export default VersionDeLaApp;
