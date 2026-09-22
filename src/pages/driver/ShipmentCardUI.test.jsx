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

// ── Etiqueta "COBRAR" en la tarjeta ────────────────────────────────────────────
// La ficha del admin (ShipmentDetailsModal) podía corromper `customAmount` a NaN
// al guardar cualquier cambio si el campo "amount" seguía llevando el símbolo €
// ("€7.00" → parseFloat da NaN). El modal de entrega se defiende de eso cayendo a
// `amount`; esta tarjeta antes NO lo hacía (miraba `!== undefined`, y NaN no es
// undefined), así que la etiqueta desaparecía aunque el porte siguiera pendiente.
describe('ShipmentCardUI: etiqueta COBRAR', () => {
    const debido = (props = {}) => envio({
        porteType: 'Debido',
        amount: '€7.00',
        hasCod: false,
        portePaid: false,
        ...props,
    });

    it('con el precio normal, sale la etiqueta', () => {
        pintar(debido({ customAmount: 7 }));
        expect(screen.getByText(/COBRAR: Porte: 7€/)).toBeInTheDocument();
    });

    it('con customAmount corrompido a NaN, cae a `amount` y la etiqueta sigue saliendo', () => {
        pintar(debido({ customAmount: NaN }));
        expect(screen.getByText(/COBRAR: Porte: 7€/)).toBeInTheDocument();
    });

    it('con customAmount a 0 (no null), también cae a `amount`', () => {
        pintar(debido({ customAmount: 0 }));
        expect(screen.getByText(/COBRAR: Porte: 7€/)).toBeInTheDocument();
    });

    it('sin customAmount (nunca se tocó), usa `amount` como siempre', () => {
        pintar(debido({ customAmount: undefined }));
        expect(screen.getByText(/COBRAR: Porte: 7€/)).toBeInTheDocument();
    });

    it('si customAmount trae un precio distinto y válido, manda él sobre `amount`', () => {
        pintar(debido({ customAmount: 12, amount: '€7.00' }));
        expect(screen.getByText(/COBRAR: Porte: 12€/)).toBeInTheDocument();
    });

    it('ya cobrado, no sale (aunque el precio sea válido)', () => {
        pintar(debido({ customAmount: 7, portePaid: true }));
        expect(screen.queryByText(/COBRAR/)).toBeNull();
    });

    it('destinatario de Facturación, no sale (el porte va a su factura)', () => {
        const stop = debido({ customAmount: 7 });
        pintar(stop, { clients: [{ name: stop.destinationName, billingType: 'Facturación' }] });
        expect(screen.queryByText(/COBRAR/)).toBeNull();
    });
});

// ── El destinatario apuntado en la recogida ──
//
// La parada de una recogida es el remitente (es a donde se va), pero si la
// oficina dejó apuntado a quién va lo que se recoge, al repartidor le vale
// verlo desde la tarjeta, parpadeando igual que las observaciones, que es donde
// antes se apuntaba a mano.
describe('ShipmentCardUI: destinatario de una recogida', () => {
    const recogida = (props = {}) => envio({
        id: 'REC-645',
        type: 'Recogida',
        client: 'AGRICOLA CASTILLERO',
        originAddress: 'Ctra. Vieja 1',
        originCity: 'Montilla',
        destinationName: '',
        destinationCity: '',
        destinationAddress: '',
        ...props,
    });

    it('con destinatario, la tarjeta lo avisa parpadeando y la parada sigue siendo el remitente', () => {
        pintar(recogida({ destinationName: 'FERRETERIA LUCENA', destinationCity: 'Lucena', destinationAddress: 'C/ Ancha 4' }));
        const aviso = screen.getByText('Entregar a:');
        expect(aviso.closest('.animate-pulse')).not.toBeNull();
        expect(screen.getByText('FERRETERIA LUCENA')).toBeInTheDocument();
        // El destinatario sale UNA vez, en el aviso: la dirección de la parada sigue
        // siendo la de recogida (antes la tarjeta pintaba la calle y el pueblo del
        // destino y mandaba al repartidor a casa del destinatario).
        expect(screen.getAllByText('C/ Ancha 4')).toHaveLength(1);
        expect(screen.getByText('Ctra. Vieja 1')).toBeInTheDocument();
        expect(screen.getByText(/Montilla/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 4 }).textContent).toBe('AGRICOLA CASTILLERO');
    });

    it('sin destinatario no hay aviso', () => {
        pintar(recogida());
        expect(screen.queryByText('Entregar a:')).toBeNull();
    });

    it('en una entrega nunca sale, aunque tenga destinatario', () => {
        pintar(envio());
        expect(screen.queryByText('Entregar a:')).toBeNull();
    });
});
