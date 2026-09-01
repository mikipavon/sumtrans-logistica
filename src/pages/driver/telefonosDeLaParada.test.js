import { describe, it, expect } from 'vitest';
import { telefonosDeLaParada, movilesDelEnvio } from './DriverDashboard';

// Un cliente típico: el fijo de la nave en 'phone' (el que baja al albarán) y el
// móvil del encargado en 'mobile', que hasta ahora no lo miraba nadie.
const BAR_PEPE = { id: 10, name: 'Bar Pepe', phone: '957 123 456', mobile: '600 111 222' };
const SOLO_FIJO = { id: 11, name: 'Ferretería Luna', phone: '954112233' };
const SOLO_MOVIL = { id: 12, name: 'Kiosco Ana', mobile: '655443322' };
const CON_SEDE = {
    id: 13,
    name: 'Panadería Sur',
    phone: '955000000',
    mobile: '611000000',
    branches: [{ id: 'b1', name: 'Panadería Sur Écija', mobile: '622999888' }],
};
const CLIENTES = [BAR_PEPE, SOLO_FIJO, SOLO_MOVIL, CON_SEDE];

const entregaA = (nombre, telefono) => ({
    type: 'Entrega',
    destinationName: nombre,
    destinationPhone: telefono,
});

describe('telefonosDeLaParada', () => {
    it('pone el móvil de la ficha por delante del fijo del albarán', () => {
        const tels = telefonosDeLaParada(entregaA('Bar Pepe', '957 123 456'), CLIENTES);
        expect(tels).toEqual([
            { numero: '600 111 222', esFijo: false },
            { numero: '957 123 456', esFijo: true },
        ]);
    });

    it('no repite el mismo número aunque venga escrito distinto', () => {
        const tels = telefonosDeLaParada(entregaA('Bar Pepe', '+34 600111222'), CLIENTES);
        expect(tels.map(t => t.numero)).toEqual(['+34 600111222', '957 123 456']);
    });

    it('devuelve el fijo solo si es lo único que hay', () => {
        const tels = telefonosDeLaParada(entregaA('Ferretería Luna', '954112233'), CLIENTES);
        expect(tels).toEqual([{ numero: '954112233', esFijo: true }]);
    });

    it('rescata el móvil de la ficha cuando el albarán vino sin teléfono', () => {
        const tels = telefonosDeLaParada(entregaA('Kiosco Ana', ''), CLIENTES);
        expect(tels).toEqual([{ numero: '655443322', esFijo: false }]);
    });

    it('el móvil de la sede manda sobre el de la ficha madre', () => {
        const tels = telefonosDeLaParada(entregaA('Panadería Sur Écija', ''), CLIENTES);
        // Sede: móvil propio; el fijo lo hereda de la madre porque la sede no tiene.
        expect(tels).toEqual([
            { numero: '622999888', esFijo: false },
            { numero: '955000000', esFijo: true },
        ]);
    });

    it('en una recogida mira el remitente, no el destinatario', () => {
        const recogida = {
            type: 'Recogida',
            originName: 'Bar Pepe',
            originPhone: '',
            destinationName: 'Kiosco Ana',
            destinationPhone: '655443322',
        };
        expect(telefonosDeLaParada(recogida, CLIENTES).map(t => t.numero))
            .toEqual(['600 111 222', '957 123 456']);
    });

    it('un número extranjero no se toma por fijo', () => {
        const tels = telefonosDeLaParada(entregaA('Desconocido SL', '+351 912345678'), CLIENTES);
        expect(tels).toEqual([{ numero: '+351 912345678', esFijo: false }]);
    });

    it('sin cliente ni teléfono no devuelve nada', () => {
        expect(telefonosDeLaParada(entregaA('Desconocido SL', ''), CLIENTES)).toEqual([]);
        expect(telefonosDeLaParada(null, CLIENTES)).toEqual([]);
    });
});

describe('movilesDelEnvio', () => {
    // Un albarán normal: lo manda el kiosco y lo recibe el bar, que en el albarán
    // solo tiene el fijo de la nave.
    const ENTREGA = {
        type: 'Entrega',
        originName: 'Kiosco Ana',
        originPhone: '',
        destinationName: 'Bar Pepe',
        destinationPhone: '957 123 456',
    };

    it('ofrece las dos puntas del albarán, la parada delante', () => {
        expect(movilesDelEnvio(ENTREGA, CLIENTES)).toEqual([
            { numero: '600 111 222', papel: 'Destinatario', nombre: 'Bar Pepe', paga: false },
            { numero: '655443322', papel: 'Remitente', nombre: 'Kiosco Ana', paga: true },
        ]);
    });

    it('en una recogida el remitente va primero', () => {
        expect(movilesDelEnvio({ ...ENTREGA, type: 'Recogida' }, CLIENTES).map(o => o.papel))
            .toEqual(['Remitente', 'Destinatario']);
    });

    it('deja fuera los fijos: a un fijo el justificante no llega', () => {
        const soloFijos = {
            type: 'Entrega',
            originName: 'Desconocido SL',
            originPhone: '',
            destinationName: 'Ferretería Luna',
            destinationPhone: '954112233',
        };
        expect(movilesDelEnvio(soloFijos, CLIENTES)).toEqual([]);
    });

    it('no repite el número cuando las dos puntas son el mismo cliente', () => {
        const ambos = {
            type: 'Entrega',
            originName: 'Bar Pepe',
            originPhone: '600111222',
            destinationName: 'Bar Pepe',
            destinationPhone: '+34 600 111 222',
        };
        expect(movilesDelEnvio(ambos, CLIENTES)).toEqual([
            { numero: '+34 600 111 222', papel: 'Destinatario', nombre: 'Bar Pepe', paga: true },
        ]);
    });

    it("el nombre suelto del albarán solo vale para la punta que es la parada", () => {
        // Sin destinationName, 'client' es el destinatario; el remitente se queda
        // vacío en vez de heredar ese nombre y ofrecer un teléfono que no es suyo.
        expect(movilesDelEnvio({ type: 'Entrega', client: 'Kiosco Ana' }, CLIENTES)).toEqual([
            { numero: '655443322', papel: 'Destinatario', nombre: 'Kiosco Ana', paga: false },
        ]);
    });

    // Quién paga marca qué justificante lleva precio (ver lineasDeDineroDelJustificante).
    it('con porte Pagado paga el remitente', () => {
        const opciones = movilesDelEnvio({ ...ENTREGA, porteType: 'Pagado' }, CLIENTES);
        expect(opciones.map(o => [o.papel, o.paga])).toEqual([
            ['Destinatario', false],
            ['Remitente', true],
        ]);
    });

    it('con porte Debido paga el destinatario', () => {
        const opciones = movilesDelEnvio({ ...ENTREGA, porteType: 'Debido' }, CLIENTES);
        expect(opciones.map(o => [o.papel, o.paga])).toEqual([
            ['Destinatario', true],
            ['Remitente', false],
        ]);
    });

    it('un albarán antiguo sin porteType lo paga el remitente', () => {
        expect(movilesDelEnvio(ENTREGA, CLIENTES).find(o => o.papel === 'Remitente').paga).toBe(true);
    });

    it('si el mismo móvil está en las dos puntas, cuenta como que paga', () => {
        // Remitente y destinatario son la misma empresa y el porte es Debido: el único
        // botón que queda es el del destinatario, y ese sí tiene que llevar el precio.
        const ambos = {
            type: 'Recogida',
            porteType: 'Debido',
            originName: 'Bar Pepe',
            originPhone: '600111222',
            destinationName: 'Bar Pepe',
            destinationPhone: '+34 600 111 222',
        };
        expect(movilesDelEnvio(ambos, CLIENTES)).toEqual([
            { numero: '600111222', papel: 'Remitente', nombre: 'Bar Pepe', paga: true },
        ]);
    });

    it('sin albarán no devuelve nada', () => {
        expect(movilesDelEnvio(null, CLIENTES)).toEqual([]);
    });
});
