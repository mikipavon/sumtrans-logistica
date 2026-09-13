// ── La chuleta de quién recibe tiene que salir donde se guardó ──
//
// Juan Carlos apuntó el DNI de quien recibe en Elytel varias veces y no le salía
// nunca. Se estaba guardando bien: el albarán lleva escrito un nombre que la
// ficha tiene de razón social —al validarla, la oficina le puso el nombre bueno
// al comercial— y el guardado busca por los dos. La chuleta sólo miraba el
// nombre comercial, así que leía en una ficha distinta de donde escribía.
//
// Aquí se comprueba lo que ve el repartidor en la pantalla de entrega: que la
// lista aparece por el enlace del albarán, por la razón social y por la sede.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';

// La cámara de dentro de la app no se abre en ninguna de estas pruebas.
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

// El canvas de la firma no existe en jsdom: al desmontarlo, el de verdad casca
// con "React refs are null during this phase".
vi.mock('react-signature-canvas', () => ({
    default: () => null,
}));

// Los ficheros de test comparten el registro de módulos (isolate: false en
// vitest.config.js, por lo que tarda OneDrive en levantar un worker). Las
// pruebas del DriverDashboard cargan esta pantalla ANTES que ésta, con la firma
// de verdad dentro, y el doble de arriba llegaba tarde: la pantalla ya estaba
// montada con la buena. Se vacía el registro y se carga aquí a mano, que es lo
// único que garantiza que el doble entre esté quien esté delante en la cola.
let DeliveryConfirmationModal;

beforeAll(async () => {
    vi.resetModules();
    DeliveryConfirmationModal = (await import('./DeliveryConfirmationModal')).default;
});

const albaran = {
    id: 'ALB-1',
    type: 'Entrega',
    status: 'En Reparto',
    client: 'QUIEN LO MANDA SL',
    destinationName: 'ELYTEL',
    destinationAddress: 'Pol. Las Quemadas, 3',
};

const fichaValidada = {
    id: 77,
    // Lo que hace la oficina al validar: el nombre bueno arriba y el que lleva
    // escrito el albarán abajo, de razón social.
    name: 'ELYTEL TELECOMUNICACIONES SL',
    legalName: 'ELYTEL',
    receivers: [
        { name: 'Marisa Ortega', dni: '30111222X', at: '2026-09-10T10:00:00.000Z' },
        { name: 'Paco Ruiz', dni: '30333444Y', at: '2026-09-09T10:00:00.000Z' },
    ],
};

const pintar = (props = {}) => render(
    <DeliveryConfirmationModal
        isOpen
        shipment={albaran}
        onClose={() => { }}
        onConfirm={() => { }}
        collectionAlert={false}
        {...props}
    />
);

describe('la chuleta de quién recibe', () => {
    it('sale aunque el albarán lleve escrita la razón social de la ficha', () => {
        pintar({ clients: [fichaValidada] });

        expect(screen.getByText('Ya han recibido aquí')).toBeInTheDocument();
        expect(screen.getByText('Marisa Ortega')).toBeInTheDocument();
        expect(screen.getByText('30111222X')).toBeInTheDocument();
        expect(screen.getByText('Paco Ruiz')).toBeInTheDocument();
    });

    it('sale por el enlace del albarán aunque el nombre escrito ya no case con nada', () => {
        // Lo que queda de renombrar una ficha sin dejar el nombre viejo: el texto
        // del albarán no es de nadie, pero el emparejado de la base de datos
        // (migración 22) sigue apuntando a la ficha buena.
        pintar({
            shipment: { ...albaran, destinationName: 'ELITEL (EL DEL POLIGONO)', destinatarioId: 77 },
            clients: [fichaValidada],
        });

        expect(screen.getByText('Marisa Ortega')).toBeInTheDocument();
    });

    it('la sede enseña la suya, no la de la casa madre', () => {
        const conSede = {
            ...fichaValidada,
            branches: [{
                id: 'sede-2',
                name: 'ELYTEL ALMACEN',
                receivers: [{ name: 'Curro Vega', dni: '30555666Z' }],
            }],
        };

        pintar({ shipment: { ...albaran, destinationName: 'Elytel Almacén' }, clients: [conSede] });

        expect(screen.getByText('Curro Vega')).toBeInTheDocument();
        expect(screen.queryByText('Marisa Ortega')).not.toBeInTheDocument();
    });

    it('una dirección donde no ha recibido nadie no enseña nada', () => {
        pintar({ clients: [{ id: 99, name: 'OTRA EMPRESA', receivers: [{ name: 'Nadie', dni: '1' }] }] });

        expect(screen.queryByText('Ya han recibido aquí')).not.toBeInTheDocument();
        expect(screen.queryByText('La última vez recibió')).not.toBeInTheDocument();
        expect(screen.queryByText('Nadie')).not.toBeInTheDocument();
    });
});
