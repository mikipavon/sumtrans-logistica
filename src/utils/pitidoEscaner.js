// ── El pitido del escáner de pegatinas ──
//
// Como el lector del supermercado: un tono corto y agudo cuando entra un bulto
// nuevo, y dos tonos graves cuando la cámara vuelve a leer uno que ya estaba.
// El sonido se genera con la Web Audio API en el momento, sin fichero de audio:
// no hay nada que descargar y suena igual con el móvil sin cobertura.
//
// El navegador sólo deja sonar un AudioContext que nazca después de que el
// usuario haya tocado la página. El escáner se abre pulsando un botón, así que
// prepararPitido() se llama al abrirlo y el contexto queda listo para cuando
// la cámara lea el primer código (eso ya no viene de ningún toque).

let contexto = null;

const ContextoDeAudio = () => (typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null);

export const prepararPitido = () => {
    const Ctx = ContextoDeAudio();
    if (!Ctx) return null;
    try {
        if (!contexto || contexto.state === 'closed') contexto = new Ctx();
        if (contexto.state === 'suspended' && typeof contexto.resume === 'function') {
            contexto.resume().catch(() => {});
        }
        return contexto;
    } catch {
        // Algún navegador tiene el constructor pero no deja crearlo.
        contexto = null;
        return null;
    }
};

// Un tono: frecuencia en Hz, duración en segundos, y cuándo empieza (segundos
// desde ahora) para poder encadenar dos seguidos.
const tono = (ctx, frecuencia, duracion, empiezaEn = 0) => {
    const oscilador = ctx.createOscillator();
    const volumen = ctx.createGain();
    const inicio = ctx.currentTime + empiezaEn;

    oscilador.type = 'square';
    oscilador.frequency.setValueAtTime(frecuencia, inicio);

    // Sube y baja el volumen en unos milisegundos para que no chasque al
    // empezar ni al cortar.
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.25, inicio + 0.005);
    volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

    oscilador.connect(volumen);
    volumen.connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracion + 0.02);
};

// Bulto nuevo registrado: un "bip" agudo y corto.
export const pitidoDeBulto = () => {
    const ctx = prepararPitido();
    if (!ctx) return false;
    try {
        tono(ctx, 1500, 0.09);
        return true;
    } catch {
        // Sin sonido el escaneo sigue igual.
        return false;
    }
};

// Bulto que ya estaba escaneado: dos tonos graves, para que se distinga sin mirar.
export const pitidoDeRepetido = () => {
    const ctx = prepararPitido();
    if (!ctx) return false;
    try {
        tono(ctx, 320, 0.08);
        tono(ctx, 320, 0.08, 0.12);
        return true;
    } catch {
        // Sin sonido el escaneo sigue igual.
        return false;
    }
};
