import { describe, it, expect } from 'vitest';
import Shipment from '../models/Shipment';
import { incidenciaAbierta, incidenciaAparcada, incidenciaEnPanel } from './incidenciasAparcadas';

describe('incidencias aparcadas', () => {
    it('una incidencia activa sin aparcar sale en el panel', () => {
        const s = { incidentStatus: 'active' };
        expect(incidenciaEnPanel(s)).toBe(true);
        expect(incidenciaAparcada(s)).toBe(false);
    });

    it('aparcada sale del panel pero sigue abierta (el cliente la ve)', () => {
        const s = { incidentStatus: 'active', incidentParkedAt: '2026-09-23T10:00:00.000Z' };
        expect(incidenciaEnPanel(s)).toBe(false);
        expect(incidenciaAparcada(s)).toBe(true);
        expect(incidenciaAbierta(s)).toBe(true);
    });

    it('resuelta no sale ni en el panel ni en aparcadas, aunque quede la marca', () => {
        const s = { incidentStatus: 'resolved', incidentParkedAt: '2026-09-23T10:00:00.000Z' };
        expect(incidenciaEnPanel(s)).toBe(false);
        expect(incidenciaAparcada(s)).toBe(false);
    });

    it('una incidencia nueva en el mismo albarán vuelve al panel', () => {
        const s = new Shipment({ id: 'SUM-1', status: 'En reparto', assignedDriverId: 3, incidentStatus: 'resolved', incidentParkedAt: '2026-09-22T10:00:00.000Z' });
        s.updateStatus('Incidencia', 'Cerrado');
        expect(s.incidentParkedAt).toBe(null);
        expect(incidenciaEnPanel(s)).toBe(true);
    });
});
