import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShipmentCardUI } from './DriverDashboard';
import Shipment from '../../models/Shipment';
import { parseAmount } from '../../utils/accountLogic';
import { esDeAgencia, LOGO_SUM } from '../../utils/marca';

/**
 * La tarjeta decidía por su cuenta qué logo y qué distintivo pintar, con reglas
 * distintas de las que usaba el optimizador para decidir si el albarán es nuestro o
 * de agencia. Estos tests fijan que las dos cosas digan lo mismo.
 */

const noop = () => {};

const pintar = (stop, extra = {}) => render(
    <ShipmentCardUI
        stop={stop}
        index={0}
        clients={extra.clients || []}
        Shipment={Shipment}
        parseAmount={parseAmount}
        setSelectedShipment={noop}
        setIsDetailsModalOpen={noop}
        printShipmentTicket={noop}
        setIncidentShipment={noop}
        setIsIncidentModalOpen={noop}
        setIncidentInitialReason={noop}
        setPickupToConvert={noop}
        setIsNoteModalOpen={noop}
        setDeliveryModalShipment={noop}
        onWhatsAppShare={noop}
        onPickupClick={noop}
        onUnassign={noop}
        isDragging={false}
        isSwiping={false}
        swipeX={0}
        listeners={{}}
        attributes={{}}
        showDocActions={false}
        setShowDocActions={noop}
        esDeCamino={extra.esDeCamino || false}
    />
);

const envio = (props = {}) => ({
    id: 'e1',
    type: 'Entrega',
    client: 'Mamaki',
    destinationName: 'Mamaki',
    destinationCity: 'Cabra',
    destinationAddress: 'Calle Real 1',
    agencyLabel: 'SUM ESPECIAL',
    ...props,
});

const logoPintado = () => screen.getByAltText('Branding').getAttribute('src');

describe('ShipmentCardUI: nuestro o de agencia', () => {
    it('un albarán nuestro lleva el logo de SUM y ningún distintivo', () => {
        pintar(envio());
        expect(logoPintado()).toBe(LOGO_SUM);
        expect(screen.queryByText(/AGENCIA/)).toBeNull();
    });

    it('un albarán de agencia lleva su logo y su distintivo', () => {
        pintar(envio({ agencyLabel: 'tsb' }));
        expect(logoPintado()).toBe('/logos/tsb_logo.png');
        expect(screen.getByText('AGENCIA TSB')).toBeInTheDocument();
    });

    // El caso que no cuadraba: logo de agencia en la tarjeta, bloque de los nuestros
    // en la ruta.
    it('la agencia declarada en la ficha del cliente también se ve en la tarjeta', () => {
        const stop = envio();
        const clientes = [{ name: 'Mamaki', agencyLabel: 'xpo' }];
        pintar(stop, { clients: clientes });
        expect(screen.getByText('AGENCIA XPO')).toBeInTheDocument();
        // Y el optimizador la clasifica igual, que es de lo que se trataba.
        expect(esDeAgencia(stop, clientes[0])).toBe(true);
    });

    it('un cliente nuestro de prioridad normal sigue siendo nuestro', () => {
        const stop = envio();
        const clientes = [{ name: 'Mamaki', priority: 'normal' }];
        pintar(stop, { clients: clientes });
        expect(logoPintado()).toBe(LOGO_SUM);
        expect(screen.queryByText(/AGENCIA/)).toBeNull();
        expect(esDeAgencia(stop, clientes[0])).toBe(false);
    });

    it('el logo propio del cliente manda sobre el de SUM', () => {
        pintar(envio(), { clients: [{ name: 'Mamaki', agencyLogoUrl: '/logos/suyo.png' }] });
        expect(logoPintado()).toBe('/logos/suyo.png');
    });
});

describe('ShipmentCardUI: aviso de "de camino"', () => {
    it('sin marcar no aparece', () => {
        pintar(envio({ agencyLabel: 'tsb' }));
        expect(screen.queryByText('DE CAMINO')).toBeNull();
    });

    it('marcada, avisa de que el optimizador la ha adelantado', () => {
        pintar(envio({ agencyLabel: 'tsb' }), { esDeCamino: true });
        const aviso = screen.getByText('DE CAMINO');
        expect(aviso).toBeInTheDocument();
        expect(aviso).toHaveAttribute('title', expect.stringContaining('Arrástrala'));
    });
});
