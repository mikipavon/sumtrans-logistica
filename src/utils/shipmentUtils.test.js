import { describe, it, expect } from 'vitest';
import { puedeAsignarloEsteConductor } from './shipmentUtils';

// Ids reales de conductores en el escenario que motivó el cambio:
// Paco crea el albarán y se lo asigna por error a Miguel; Miguel lo devuelve
// deslizando la tarjeta y tiene que poder mandárselo él mismo al correcto.
const PACO = 1;
const MIGUEL = 2;
const JUAN = 3;

const albaranPendiente = (extra = {}) => ({
    id: 'TR-100',
    status: 'Pendiente de asignar',
    createdById: PACO,
    ...extra
});

describe('puedeAsignarloEsteConductor', () => {
    it('solo lo ve el conductor que lo devolvió deslizando, no el creador', () => {
        const albaran = albaranPendiente({ returnedToAssignById: MIGUEL });

        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaran, JUAN)).toBe(false);
    });

    it('el sello gana también sobre quien escaneó los bultos', () => {
        const albaran = albaranPendiente({
            returnedToAssignById: MIGUEL,
            pickedUpById: JUAN
        });

        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, JUAN)).toBe(false);
    });

    it('sin sello, sigue viéndolo el creador', () => {
        const albaran = albaranPendiente();

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(false);
    });

    it('sin sello, también lo ve quien recogió los bultos', () => {
        const albaran = albaranPendiente({ pickedUpById: JUAN });

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, JUAN)).toBe(true);
    });

    it('al limpiar el sello vuelve a la regla normal', () => {
        // Es lo que pasa cuando oficina lo libera o cuando otro conductor
        // escanea los bultos: returnedToAssignById se pone a null.
        const albaran = albaranPendiente({ returnedToAssignById: null });

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(false);
    });

    it('compara ids aunque uno venga como texto', () => {
        // Supabase devuelve el JSON tal cual se guardó y el <select> del móvil
        // entrega strings, así que los dos formatos conviven.
        const albaran = albaranPendiente({ returnedToAssignById: '2' });

        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, '2')).toBe(true);
    });

    it('un albarán de oficina (createdById null) no salta a un conductor cualquiera', () => {
        const albaran = albaranPendiente({ createdById: null });

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(false);
    });

    it('ignora los albaranes que no están pendientes de asignar', () => {
        const enReparto = albaranPendiente({
            status: 'En reparto',
            returnedToAssignById: MIGUEL
        });

        expect(puedeAsignarloEsteConductor(enReparto, MIGUEL)).toBe(false);
    });

    it('un albarán ya cobrado sigue esperando en Asignar', () => {
        // El cliente crea el albarán con "aplazar cobro" y paga un rato después:
        // se cobra desde C.Pendientes, pero el paquete NO se ha entregado. Tiene
        // que seguir saliendo en Asignar hasta que alguien lo lleve.
        const cobradoSinEntregar = albaranPendiente({ portePaid: true, paymentStatus: 'Paid' });

        expect(puedeAsignarloEsteConductor(cobradoSinEntregar, PACO)).toBe(true);
    });

    it('aguanta huecos en la lista y conductor sin identificar', () => {
        expect(puedeAsignarloEsteConductor(null, MIGUEL)).toBe(false);
        expect(puedeAsignarloEsteConductor(undefined, MIGUEL)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaranPendiente(), null)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaranPendiente(), undefined)).toBe(false);
    });
});
