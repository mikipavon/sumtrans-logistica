// ── El pitido del escáner suena con lo que hay ──
//
// jsdom no trae AudioContext, y algún móvil viejo tampoco: sin él, el pitido
// no puede tumbar el escaneo. Con él, el bulto nuevo es un tono y el repetido
// son dos.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const osciladoresArrancados = [];

class ContextoFalso {
    constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = {};
    }
    resume() { return Promise.resolve(); }
    createOscillator() {
        const parametro = { setValueAtTime: vi.fn() };
        const oscilador = {
            type: 'sine',
            frequency: parametro,
            connect: vi.fn(),
            start: vi.fn(() => osciladoresArrancados.push(oscilador)),
            stop: vi.fn(),
        };
        return oscilador;
    }
    createGain() {
        return {
            gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
        };
    }
}

// El módulo guarda el contexto que crea, así que cada prueba lo carga de cero.
const cargar = async () => {
    vi.resetModules();
    return import('./pitidoEscaner');
};

beforeEach(() => {
    osciladoresArrancados.length = 0;
});

// Los ficheros de test comparten el window (isolate: false): lo que se cuelga
// aquí se descuelga aquí.
afterEach(() => {
    delete window.AudioContext;
    delete window.webkitAudioContext;
});

describe('pitidoEscaner', () => {
    it('sin AudioContext no suena ni revienta', async () => {
        const { pitidoDeBulto, pitidoDeRepetido, prepararPitido } = await cargar();
        expect(prepararPitido()).toBeNull();
        expect(pitidoDeBulto()).toBe(false);
        expect(pitidoDeRepetido()).toBe(false);
    });

    it('el bulto nuevo es un tono agudo', async () => {
        window.AudioContext = ContextoFalso;
        const { pitidoDeBulto } = await cargar();

        expect(pitidoDeBulto()).toBe(true);
        expect(osciladoresArrancados).toHaveLength(1);
        expect(osciladoresArrancados[0].frequency.setValueAtTime).toHaveBeenCalledWith(1500, 0);
        expect(osciladoresArrancados[0].stop).toHaveBeenCalled();
    });

    it('el repetido son dos tonos graves, uno detrás del otro', async () => {
        window.AudioContext = ContextoFalso;
        const { pitidoDeRepetido } = await cargar();

        expect(pitidoDeRepetido()).toBe(true);
        expect(osciladoresArrancados).toHaveLength(2);
        expect(osciladoresArrancados[0].frequency.setValueAtTime).toHaveBeenCalledWith(320, 0);
        expect(osciladoresArrancados[1].start).toHaveBeenCalledWith(0.12);
    });

    it('reutiliza el mismo contexto entre pitidos', async () => {
        const creados = vi.fn();
        window.AudioContext = class extends ContextoFalso {
            constructor() { super(); creados(); }
        };
        const { pitidoDeBulto, prepararPitido } = await cargar();

        prepararPitido();
        pitidoDeBulto();
        pitidoDeBulto();
        expect(creados).toHaveBeenCalledTimes(1);
    });
});
