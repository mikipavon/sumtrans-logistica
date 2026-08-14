import { describe, it, expect } from 'vitest';
import { telefonosDeLaParada } from './DriverDashboard';

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
