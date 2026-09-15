import { describe, it, expect, vi } from 'vitest';
import { guardarTelefonoTecleado, huecoParaElTelefono, fichaDelContacto } from './guardarTelefonoTecleado';

/**
 * El número tecleado en "Enviar a otro número" cuando la parada no tenía móvil:
 * a la ficha del contacto (o ficha nueva) y al albarán si venía sin teléfono.
 * La misma regla para el repartidor y para la oficina desde Envíos.
 */

const ZURICAR = { id: 7, name: 'Zuricar de Espejo', phone: '', mobile: '' };
const CON_FIJO = { id: 8, name: 'Ferretería Luna', phone: '954112233', mobile: '' };
const CON_SEDE = { id: 9, name: 'Panadería Sur', phone: '955000000', branches: [{ id: 'b1', name: 'Panadería Sur Écija', phone: '' }] };

const entrega = (extra = {}) => ({
    id: 'HAB-330',
    type: 'Entrega',
    originName: 'EL ARCANGEL MOTOR S.L',
    originPhone: '957429490',
    destinationName: 'Zuricar de Espejo',
    destinationPhone: '',
    destinationAddress: 'Poligono Industrial Alcaparral, nº 23, bajo',
    destinationCity: 'Espejo',
    destinationZip: '14830',
    porteType: 'Pagado',
    ...extra,
});

const ganchos = () => ({
    onUpdateClient: vi.fn(async () => {}),
    onAddClient: vi.fn(async () => {}),
    onUpdateShipment: vi.fn(async () => {}),
});

describe('huecoParaElTelefono', () => {
    it('sin teléfono va a phone; con phone distinto y sin móvil, a mobile', () => {
        expect(huecoParaElTelefono({ phone: '', mobile: '' }, '600111222')).toEqual({ phone: '600111222' });
        expect(huecoParaElTelefono({ phone: '954112233', mobile: '' }, '600111222')).toEqual({ mobile: '600111222' });
    });

    it('un móvil de verdad desplaza a un fijo metido en el hueco del móvil', () => {
        expect(huecoParaElTelefono({ phone: '954112233', mobile: '954999999' }, '600111222')).toEqual({ mobile: '600111222' });
    });

    it('con los dos huecos ocupados, un móvil nuevo sustituye al móvil de la ficha', () => {
        // Quien lo teclea ha dicho que es de este cliente y la ventana avisó de la sustitución.
        expect(huecoParaElTelefono({ phone: '954112233', mobile: '611000000' }, '600111222')).toEqual({ mobile: '600111222' });
    });

    it('un fijo tecleado no sustituye a un móvil bueno', () => {
        expect(huecoParaElTelefono({ phone: '954112233', mobile: '611000000' }, '957000000')).toBeNull();
    });

    it('no toca nada si el número ya está en la ficha', () => {
        expect(huecoParaElTelefono({ phone: '600111222', mobile: '' }, '600111222')).toBeNull();
        expect(huecoParaElTelefono({ phone: '954112233', mobile: '600111222' }, '600111222')).toBeNull();
    });
});

describe('fichaDelContacto', () => {
    it('encuentra por nombre sin tildes y devuelve la sede si el nombre es de una sede', () => {
        expect(fichaDelContacto('zuricar de espejo', [ZURICAR, CON_SEDE])).toEqual({ client: ZURICAR, branch: null });
        expect(fichaDelContacto('Panaderia Sur Ecija', [ZURICAR, CON_SEDE])).toEqual({ client: CON_SEDE, branch: CON_SEDE.branches[0] });
        expect(fichaDelContacto('Nadie', [ZURICAR])).toBeNull();
    });
});

describe('guardarTelefonoTecleado', () => {
    it('en una entrega guarda el móvil en la ficha del destinatario y en el albarán que venía sin teléfono', async () => {
        const g = ganchos();
        await guardarTelefonoTecleado({ shipment: entrega(), clients: [ZURICAR], telefono: '600111222', ...g });
        expect(g.onUpdateClient).toHaveBeenCalledWith(7, { phone: '600111222' }, null);
        expect(g.onUpdateShipment).toHaveBeenCalledWith('HAB-330', { destinationPhone: '600111222' });
        expect(g.onAddClient).not.toHaveBeenCalled();
    });

    it('si el albarán ya tenía un fijo, no se lo pisa: sólo se completa la ficha', async () => {
        const g = ganchos();
        await guardarTelefonoTecleado({
            shipment: entrega({ destinationName: 'Ferretería Luna', destinationPhone: '954112233' }),
            clients: [CON_FIJO], telefono: '600111222', ...g,
        });
        expect(g.onUpdateClient).toHaveBeenCalledWith(8, { mobile: '600111222' }, null);
        expect(g.onUpdateShipment).not.toHaveBeenCalled();
    });

    it('la sede recibe el número con el id de la ficha madre y el suyo', async () => {
        const g = ganchos();
        await guardarTelefonoTecleado({
            shipment: entrega({ destinationName: 'Panadería Sur Écija' }),
            clients: [CON_SEDE], telefono: '600111222', ...g,
        });
        expect(g.onUpdateClient).toHaveBeenCalledWith(9, { phone: '600111222' }, 'b1');
    });

    it('sin ficha crea una pendiente de validar con los datos de la parada y la firma de quien la crea', async () => {
        const g = ganchos();
        await guardarTelefonoTecleado({
            shipment: entrega(), clients: [], telefono: '600111222', ...g,
            firma: { createdBy: 'Administrador', creatorId: null, isTest: false },
        });
        expect(g.onAddClient).toHaveBeenCalledTimes(1);
        const ficha = g.onAddClient.mock.calls[0][0];
        expect(ficha).toMatchObject({
            name: 'Zuricar de Espejo',
            phone: '600111222',
            address: 'Poligono Industrial Alcaparral, nº 23, bajo',
            city: 'Espejo',
            zip: '14830',
            type: 'Destinatario',
            billingType: 'Clientes Habituales',
            status: 'pending',
            createdFrom: 'WhatsApp Justificante',
            createdBy: 'Administrador',
            creatorId: null,
            isTest: false,
        });
        expect(g.onUpdateShipment).toHaveBeenCalledWith('HAB-330', { destinationPhone: '600111222' });
    });

    it('con papel el número va a la punta elegida, aunque no sea la parada', async () => {
        // Entrega (la parada es el destinatario) pero el conductor dice que el número
        // es del remitente: a la ficha del remitente y al albarán en originPhone.
        const g = ganchos();
        const REMITENTE = { id: 20, name: 'EL ARCANGEL MOTOR S.L', phone: '', mobile: '' };
        await guardarTelefonoTecleado({
            shipment: entrega({ originPhone: '' }), clients: [REMITENTE, ZURICAR],
            telefono: '600111222', papel: 'Remitente', ...g,
        });
        expect(g.onUpdateClient).toHaveBeenCalledWith(20, { phone: '600111222' }, null);
        expect(g.onUpdateShipment).toHaveBeenCalledWith('HAB-330', { originPhone: '600111222' });
    });

    it('en una recogida mira al remitente', async () => {
        const g = ganchos();
        await guardarTelefonoTecleado({
            shipment: entrega({ type: 'Recogida', originName: 'Zuricar de Espejo', originPhone: '' }),
            clients: [ZURICAR], telefono: '600111222', ...g,
        });
        expect(g.onUpdateClient).toHaveBeenCalledWith(7, { phone: '600111222' }, null);
        expect(g.onUpdateShipment).toHaveBeenCalledWith('HAB-330', { originPhone: '600111222' });
    });

    it('un fallo en la ficha no impide guardar el albarán', async () => {
        const g = ganchos();
        g.onUpdateClient.mockRejectedValueOnce(new Error('sin red'));
        const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
        await guardarTelefonoTecleado({ shipment: entrega(), clients: [ZURICAR], telefono: '600111222', ...g });
        expect(g.onUpdateShipment).toHaveBeenCalledTimes(1);
        silencio.mockRestore();
    });

    it('sin albarán o sin número no hace nada', async () => {
        const g = ganchos();
        await guardarTelefonoTecleado({ shipment: null, clients: [], telefono: '600', ...g });
        await guardarTelefonoTecleado({ shipment: entrega(), clients: [], telefono: '', ...g });
        expect(g.onUpdateClient).not.toHaveBeenCalled();
        expect(g.onAddClient).not.toHaveBeenCalled();
        expect(g.onUpdateShipment).not.toHaveBeenCalled();
    });
});
