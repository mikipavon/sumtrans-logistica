import { describe, it, expect } from 'vitest';
import { indexarEnviosPorCliente, quienMandoLaMercancia } from './quienMandoLaMercancia';

const envio = (extra) => ({
    id: 'SUM-1',
    client: 'PROSERVICE',
    originName: 'PROSERVICE',
    destinationName: 'José López',
    date: '10 sept 2026',
    createdAt: '2026-09-10T08:00:00.000Z',
    ...extra,
});

describe('quienMandoLaMercancia', () => {
    it('enseña el remitente del albarán que trajo el paquete a esa ficha', () => {
        const indice = indexarEnviosPorCliente([envio()]);
        const quien = quienMandoLaMercancia({ id: 7, name: 'JOSE LOPEZ', type: 'Destinatario' }, indice);
        expect(quien).toMatchObject({ sentido: 'recibe', nombre: 'PROSERVICE', albaran: 'SUM-1', fecha: '10 sept 2026', otros: 0 });
    });

    it('el remitente es originName, no quien paga el porte', () => {
        const indice = indexarEnviosPorCliente([envio({ client: 'AGENCIA QUE PAGA', originName: 'TALLERES SUR' })]);
        expect(quienMandoLaMercancia({ name: 'José López', type: 'Destinatario' }, indice).nombre).toBe('TALLERES SUR');
    });

    it('con varios remitentes enseña el último y cuenta los demás', () => {
        const indice = indexarEnviosPorCliente([
            envio(),
            envio({ id: 'SUM-2', originName: 'TSB', client: 'TSB', createdAt: '2026-09-11T09:00:00.000Z', date: '11 sept 2026' }),
        ]);
        const quien = quienMandoLaMercancia({ name: 'José López', type: 'Destinatario' }, indice);
        expect(quien.nombre).toBe('TSB');
        expect(quien.albaran).toBe('SUM-2');
        expect(quien.otros).toBe(1);
        expect(quien.todos.map(r => r.nombre)).toEqual(['PROSERVICE', 'TSB']);
    });

    it('a una ficha de remitente le enseña a quién le mandó', () => {
        const indice = indexarEnviosPorCliente([envio()]);
        const quien = quienMandoLaMercancia({ name: 'Proservice', type: 'Remitente' }, indice);
        expect(quien).toMatchObject({ sentido: 'manda', nombre: 'José López' });
    });

    it('ata la ficha por su enlace aunque le hayan corregido el nombre', () => {
        const indice = indexarEnviosPorCliente([envio({ destinatarioId: 55, destinationName: 'JOSE LOPEZ (BAR)' })]);
        const quien = quienMandoLaMercancia({ id: 55, name: 'Bar de José López', type: 'Destinatario' }, indice);
        expect(quien.nombre).toBe('PROSERVICE');
    });

    it('el mismo albarán por nombre y por enlace no cuenta dos veces', () => {
        const indice = indexarEnviosPorCliente([envio({ destinatarioId: 55 })]);
        const quien = quienMandoLaMercancia({ id: 55, name: 'José López', type: 'Destinatario' }, indice);
        expect(quien.otros).toBe(0);
    });

    it('sin envío cargado no se inventa nada', () => {
        const indice = indexarEnviosPorCliente([envio()]);
        expect(quienMandoLaMercancia({ name: 'Sur Lopez', type: 'Destinatario' }, indice)).toBeNull();
    });

    it('un envío de una empresa a sí misma no se enseña', () => {
        const indice = indexarEnviosPorCliente([envio({ destinationName: 'PROSERVICE' })]);
        expect(quienMandoLaMercancia({ name: 'PROSERVICE', type: 'Destinatario' }, indice)).toBeNull();
    });

    it('aguanta una lista de envíos vacía o con huecos', () => {
        const indice = indexarEnviosPorCliente([null, undefined]);
        expect(quienMandoLaMercancia({ name: 'José López', type: 'Destinatario' }, indice)).toBeNull();
        expect(quienMandoLaMercancia(null, indice)).toBeNull();
    });
});
