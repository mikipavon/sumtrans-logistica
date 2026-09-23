// ── La foto de la mercancía se hace desde Editar, con un botón que se vea ──
//
// El repartidor abre el albarán desde su reparto, pulsa el lápiz y hace la
// foto para que la oficina vea qué lleva y le ponga precio. Hasta el 22/9/2026
// el único mando era un "Añadir" de 10 px arriba a la derecha del bloque y el
// recuadro grande no hacía nada al tocarlo: en el móvil nadie lo encontraba.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
// La cámara de dentro de la app: un botón que "dispara" una foto de mentira.
vi.mock('../CameraCaptureModal', () => ({
    default: ({ isOpen, onCapture }) => isOpen
        ? <button type="button" onClick={() => onCapture('data:image/jpeg;base64,FOTO')}>Disparar</button>
        : null,
}));

// La ventana del albarán se carga aquí, de nuevo, y no con un import arriba. Los
// ficheros de test comparten módulos (isolate: false, ver vitest.config.js) y
// otros cuatro simulan la cámara como `() => null`: si uno corría antes, la
// ventana se quedaba con esa cámara, el "Disparar" no salía nunca y estas pruebas
// fallaban a ratos, según el orden.
let ShipmentDetailsModal;
let uploadProof;
beforeAll(async () => {
    vi.resetModules();
    ShipmentDetailsModal = (await import('./ShipmentDetailsModal')).default;
    ({ uploadProof } = await import('../../utils/storage'));
});

const enReparto = {
    id: 'SUM-990',
    client: 'ACTIVA',
    originName: 'ACTIVA',
    destinationName: 'FERRETERIA PEPE',
    porteType: 'Debido',
    status: 'En reparto',
    assignedDriverId: 'd1',
    date: '22 sept 2026',
    originCity: 'Córdoba',
    destinationCity: 'Lucena',
    amount: '€7.00',
    customAmount: 7,
    articles: [],
    packages: '2',
    hasCod: false,
};

const abrirEnEdicion = (shipment, onUpdate = vi.fn()) => {
    render(
        <ShipmentDetailsModal
            isOpen={true}
            onClose={() => {}}
            shipment={shipment}
            onUpdate={onUpdate}
            allPoblaciones={[]}
            drivers={[{ id: 'd1', name: 'Paco' }]}
            clients={[]}
            articles={[]}
            tariffs={null}
            coverageZones={[]}
            hidePrices={true}
        />
    );
    fireEvent.click(screen.getByTitle('Editar'));
};

const botonGrande = () => screen.queryByText('Hacer foto de la mercancía');

describe('ShipmentDetailsModal · foto de la mercancía desde Editar', () => {
    it('sin foto, al editar sale el recuadro grande y abre la cámara al tocarlo', () => {
        abrirEnEdicion(enReparto);
        expect(botonGrande()).toBeTruthy();
        expect(screen.queryByText('Añadir')).toBeNull();

        fireEvent.click(botonGrande());
        fireEvent.click(screen.getByText('Disparar'));

        // Con la foto hecha: vista previa, Cambiar foto y Quitar; el recuadro grande se va.
        expect(screen.getByAltText('Foto de la mercancía').getAttribute('src')).toBe('data:image/jpeg;base64,FOTO');
        expect(screen.getByText('Cambiar foto')).toBeTruthy();
        expect(screen.getByText('Quitar')).toBeTruthy();
        expect(botonGrande()).toBeNull();
    });

    it('con foto guardada, Quitar vuelve a enseñar el recuadro grande para hacer otra', () => {
        abrirEnEdicion({ ...enReparto, merchandisePhoto: 'https://fotos/SUM-990.jpg' });
        expect(botonGrande()).toBeNull();
        expect(screen.getByText('Cambiar foto')).toBeTruthy();

        fireEvent.click(screen.getByText('Quitar'));
        expect(botonGrande()).toBeTruthy();
        expect(screen.getByText('Foto quitada · toca para hacer otra')).toBeTruthy();
        expect(screen.queryByText('Quitar')).toBeNull();
    });

    it('al guardar, la foto se sube al bucket de mercancía y va en el albarán', async () => {
        uploadProof.mockResolvedValueOnce('https://fotos/SUM-990_nueva.jpg');
        const onUpdate = vi.fn(async () => true);
        abrirEnEdicion(enReparto, onUpdate);
        fireEvent.click(botonGrande());
        fireEvent.click(screen.getByText('Disparar'));
        fireEvent.click(screen.getByText('Guardar Cambios'));

        await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
        expect(uploadProof).toHaveBeenCalledWith('SUM-990', 'data:image/jpeg;base64,FOTO', 'merchandise_photos');
        expect(onUpdate.mock.calls[0][1].merchandisePhoto).toBe('https://fotos/SUM-990_nueva.jpg');
    });

    it('si la subida falla, lo dice de la foto y no guarda nada (la edición sigue abierta)', async () => {
        uploadProof.mockRejectedValueOnce(new Error("Permiso denegado (RLS) en 'merchandise_photos'."));
        const aviso = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onUpdate = vi.fn(async () => true);
        abrirEnEdicion(enReparto, onUpdate);
        fireEvent.click(botonGrande());
        fireEvent.click(screen.getByText('Disparar'));
        fireEvent.click(screen.getByText('Guardar Cambios'));

        await vi.waitFor(() => expect(aviso).toHaveBeenCalled());
        expect(aviso.mock.calls[0][0]).toContain('No se ha podido subir la foto de la mercancía');
        expect(aviso.mock.calls[0][0]).toContain('merchandise_photos');
        expect(onUpdate).not.toHaveBeenCalled();
        // Sigue en edición, con la foto puesta, para reintentar.
        expect(screen.getByText('Guardar Cambios')).toBeTruthy();
        expect(screen.getByText('Cambiar foto')).toBeTruthy();
        aviso.mockRestore();
        silencio.mockRestore();
    });
});
