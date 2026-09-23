import { describe, it, expect } from 'vitest';
import Shipment, { estadoAlReportarIncidencia, quienReportoIncidencia } from '../Shipment';

// Al reportar una incidencia el albarán vuelve a 'Pendiente de asignar'; el estado
// que tenía se guarda aparte para que la oficina sepa si iba en reparto o entregado.
describe('estado del albarán al reportar la incidencia', () => {
  it('guarda que iba en reparto aunque vuelva a pendiente', () => {
    const s = new Shipment({ id: 'SUM-2294', status: 'En reparto', assignedDriverId: 'juan' });
    s.updateStatus('Incidencia', 'Local cerrado');
    expect(s.status).toBe('Pendiente de asignar');
    expect(s.incidentPrevStatus).toBe('En reparto');
    expect(estadoAlReportarIncidencia(s).texto).toBe('En reparto');
  });

  it('distingue pendiente y entregado', () => {
    expect(estadoAlReportarIncidencia({ incidentPrevStatus: 'Pendiente de asignar' }).texto).toBe('Pendiente');
    expect(estadoAlReportarIncidencia({ incidentPrevStatus: 'Entregado' }).texto).toBe('Entregado');
  });

  it('no inventa nada en las incidencias de antes', () => {
    expect(estadoAlReportarIncidencia(new Shipment({ incidentStatus: 'active' }))).toBeNull();
  });
});

describe('quién reportó la incidencia', () => {
  it('manda el que la reporta aunque el albarán fuera de otro', () => {
    const s = new Shipment({ status: 'En reparto', assignedDriverId: 3, incidentReportedById: 7 });
    s.updateStatus('Incidencia', 'Local cerrado');
    expect(s.assignedDriverId).toBeNull();
    expect(quienReportoIncidencia(s)).toBe(7);
  });

  it('sin dato del panel, el que lo llevaba asignado', () => {
    const s = new Shipment({ status: 'En reparto', assignedDriverId: 3 });
    s.updateStatus('Incidencia', 'Local cerrado');
    expect(quienReportoIncidencia(s)).toBe(3);
  });

  it('en las antiguas tira del sello de devolución', () => {
    expect(quienReportoIncidencia({ returnedToAssignById: 5 })).toBe(5);
    expect(quienReportoIncidencia({})).toBeNull();
  });
});
