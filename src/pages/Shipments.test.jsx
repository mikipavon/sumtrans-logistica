// ── Que en Envíos se vea quién tiene una incidencia abierta ──
//
// Un albarán puede estar en la pantalla de Incidencias con el estado puesto en
// otra cosa: SUM-966 salía en Envíos como "Pendiente de asignar" a secas, y
// administración no tenía forma de saber desde el listado que había una
// incidencia abierta encima. El estado no se toca — se le pone un cartel al lado.

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Shipments from './Shipments';

// Los modales de alta arrastran medio proyecto y aquí no se abre ninguno.
// El de importar además carga pdfjs, que en jsdom no tiene DOMMatrix.
vi.mock('../components/shipments/CreateShipmentModal', () => ({ default: () => null }));
vi.mock('../components/shipments/CreatePickupModal', () => ({ default: () => null }));
vi.mock('../components/shipments/ShipmentDetailsModal', () => ({ default: () => null }));
vi.mock('../components/shipments/ImportarAlbaranesAgencia', () => ({ default: () => null }));

const envio = (id, status, extra = {}) => ({
    id,
    status,
    client: 'PROSERVICE',
    recipientName: 'DOMINGO ORTIZ',
    destination: 'Cabra',
    date: '10 sept 2026',
    createdAt: '2026-09-10T09:00:00.000Z',
    amount: 5.4,
    ...extra,
});

const montar = (shipments) => render(
    <Shipments
        shipments={shipments}
        allShipments={shipments}
        drivers={[]}
        clients={[]}
        allPoblaciones={[]}
        articles={[]}
        tariffs={null}
        coverageZones={[]}
        familyOrder={[]}
        onClearStatusFilter={() => {}}
        onAssignDriver={() => {}}
        onCreateShipment={() => {}}
        onAddClient={() => {}}
        onUpdateClient={() => {}}
        onUpdateShipment={() => {}}
        onUpdateMultipleShipments={() => {}}
        onDeleteShipment={() => {}}
        onDeleteMultipleShipments={() => {}}
    />
);

const fila = (id) => screen.getByText(id).closest('tr');

describe('Listado de Envíos — el cartel de incidencia', () => {
    it('lo lleva el que está en Incidencias aunque su estado diga otra cosa', () => {
        montar([envio('SUM-966', 'Pendiente de asignar', { incidentStatus: 'active' })]);

        const f = fila('SUM-966');
        expect(within(f).getByText('Pendiente de asignar')).toBeInTheDocument();
        expect(within(f).getByText('INCIDENCIA')).toBeInTheDocument();
    });

    it('también si ya está entregado con la incidencia sin cerrar', () => {
        montar([envio('SUM-766', 'Entregado', { incidentStatus: 'active' })]);

        expect(within(fila('SUM-766')).getByText('INCIDENCIA')).toBeInTheDocument();
    });

    it('no se repite en el que ya tiene el estado Incidencia', () => {
        montar([envio('SUM-669', 'Incidencia', { incidentStatus: 'active' })]);

        // Sólo la píldora de estado, sin cartel duplicado al lado.
        expect(within(fila('SUM-669')).getAllByText(/incidencia/i)).toHaveLength(1);
    });

    it('no sale en el que la tiene resuelta ni en el que nunca tuvo', () => {
        montar([
            envio('SUM-668', 'Entregado', { incidentStatus: 'resolved' }),
            envio('SUM-866', 'Pendiente de asignar'),
        ]);

        expect(within(fila('SUM-668')).queryByText('INCIDENCIA')).toBeNull();
        expect(within(fila('SUM-866')).queryByText('INCIDENCIA')).toBeNull();
    });
});

// ── En una recogida la parada es el ORIGEN ──
//
// La columna de direcciones pinta en grande y en azul el destino, que es donde
// va el repartidor en una entrega. En una recogida va al origen, y mientras el
// destino era «Almacén Central» no se notaba. Desde que la oficina puede dejar
// apuntado el destinatario en la recogida, la fila de REC-645 enseñaba en grande
// el pueblo del destinatario como si fuera una entrega allí (22/09/2026).

describe('Listado de Envíos — la parada de una recogida', () => {
    const recogida = (extra = {}) => envio('REC-645', 'En reparto', {
        type: 'Recogida',
        client: 'AGRICOLA CASTILLERO',
        origin: 'Ctra. Vieja 1, 14550 Montilla',
        originCity: 'Montilla',
        destination: 'C/ Ancha 4, 14900 Lucena',
        destinationCity: 'Lucena',
        destinationName: 'FERRETERIA LUCENA',
        ...extra,
    });

    it('pone en grande el origen (a donde se va a recoger) y el destino en pequeño', () => {
        montar([recogida()]);
        const f = fila('REC-645');

        const montilla = within(f).getByText('Montilla');
        const lucena = within(f).getByText('Lucena');
        expect(montilla.className).toContain('font-bold');
        expect(lucena.className).not.toContain('font-bold');
        expect(within(f).getByText('RECOGER')).toBeInTheDocument();
        // El remitente sigue en grande en la columna de nombres, y el destinatario debajo.
        expect(within(f).getByText('AGRICOLA CASTILLERO').className).toContain('font-bold');
        expect(within(f).getByText('FERRETERIA LUCENA')).toBeInTheDocument();
    });

    it('con porte Debido la recogida sigue con el remitente en grande', () => {
        montar([recogida({ porteType: 'Debido' })]);
        const f = fila('REC-645');
        expect(within(f).getByText('AGRICOLA CASTILLERO').className).toContain('font-bold');
        expect(within(f).getByText('FERRETERIA LUCENA').className).not.toContain('font-bold');
    });

    it('en una entrega no cambia nada: el destino en grande', () => {
        montar([envio('SUM-1', 'En reparto', { type: 'Entrega', origin: 'Montilla', originCity: 'Montilla', destination: 'Lucena', destinationCity: 'Lucena' })]);
        const f = fila('SUM-1');
        expect(within(f).getByText('Lucena').className).toContain('font-bold');
        expect(within(f).queryByText('RECOGER')).toBeNull();
    });
});
