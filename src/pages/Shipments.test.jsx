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
