// ── Pinchar una alerta tiene que dejarte encima de esos albaranes ──
//
// El Centro de Alertas dice "4 envíos de cliente web sin asignar" y da los
// números. Al pinchar abría el listado de Envíos entero — mil y pico albaranes —
// y había que buscar esos cuatro a mano, así que parecía que el clic no hacía
// nada. Ahora la alerta entrega la lista exacta que ha contado y el listado se
// recorta a ella.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Layout from './Layout';

// La barra lateral no pinta nada aquí y arrastra iconos de medio proyecto.
vi.mock('./Sidebar', () => ({ default: () => null }));
vi.mock('./OfflineBanner', () => ({ default: () => null }));

const envios = [
    { id: 'HAB-153', status: 'Pendiente de asignar', createdBy: 'ClienteWeb:panaderia' },
    { id: 'SUM-399', status: 'Pendiente de asignar', createdBy: 'ClienteWeb:panaderia' },
    { id: 'HAB-102', status: 'Pendiente de asignar' },
    { id: 'HAB-168', status: 'Pendiente de asignar' },
    { id: 'HAB-218', status: 'Incidencia' },
];

const montar = (onNavigate) => render(
    <Layout
        onLogout={() => {}}
        currentView="dashboard"
        onNavigate={onNavigate}
        pendingClientsCount={0}
        pendingIncidentsCount={1}
        shipments={envios}
        collections={[]}
        incidents={[]}
        vehicles={[]}
    >
        contenido
    </Layout>
);

const abrirAlertas = () => fireEvent.click(screen.getByTitle('Notificaciones'));

describe('Centro de Alertas — a dónde lleva cada aviso', () => {
    it('los envíos de cliente web llevan al listado recortado a esos envíos', () => {
        const onNavigate = vi.fn();
        montar(onNavigate);
        abrirAlertas();

        fireEvent.click(screen.getByText(/envíos de cliente web sin asignar/));

        expect(onNavigate).toHaveBeenCalledTimes(1);
        const [vista, filtro] = onNavigate.mock.calls[0];
        expect(vista).toBe('shipments');
        expect(filtro.ids).toEqual(['HAB-153', 'SUM-399']);
    });

    it('los pendientes de asignar llevan a los suyos, sin colar los de cliente web', () => {
        const onNavigate = vi.fn();
        montar(onNavigate);
        abrirAlertas();

        fireEvent.click(screen.getByText(/pendientes de asignar conductor/));

        const [vista, filtro] = onNavigate.mock.calls[0];
        expect(vista).toBe('shipments');
        expect(filtro.ids).toEqual(['HAB-102', 'HAB-168']);
    });

    it('las incidencias abiertas llevan a su pantalla, que ya sólo enseña esas', () => {
        const onNavigate = vi.fn();
        montar(onNavigate);
        abrirAlertas();

        fireEvent.click(screen.getByText(/incidencia abierta/));

        expect(onNavigate).toHaveBeenCalledWith('incidents');
    });
});
