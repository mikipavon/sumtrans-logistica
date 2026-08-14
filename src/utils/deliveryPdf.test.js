import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createDeliveryNotesDoc } from './deliveryPdf';

// Sin red en los tests: el banner corporativo no se descarga y el PDF debe
// salir igual, con la cabecera de reserva.
let fetchOriginal;
beforeAll(() => {
  fetchOriginal = global.fetch;
  global.fetch = vi.fn(() => Promise.reject(new Error('sin red')));
});
afterAll(() => { global.fetch = fetchOriginal; });

// El albarán en lote es un solo PDF con una página por envío: si dos envíos
// acabaran compartiendo página, el cliente se descargaría albaranes pisados.
const envio = (i) => ({
  id: 'ENV-' + i,
  status: 'Entregado',
  packages: i,
  amount: 10 * i,
  originName: 'Cliente Test',
  originAddress: 'Calle A',
  destinationName: 'Dest ' + i,
  destinationAddress: 'Calle B',
  receiverName: 'Juan',
  observations: i === 2 ? 'Bulto dañado' : null,
  paidAt: '2026-08-1' + i + 'T10:00:00Z',
});

describe('createDeliveryNotesDoc', () => {
  it('mete un albarán por página en un solo documento', async () => {
    const doc = await createDeliveryNotesDoc([envio(1), envio(2), envio(3)]);
    expect(doc.internal.getNumberOfPages()).toBe(3);
  });

  it('no monta documento si no hay envíos', async () => {
    expect(await createDeliveryNotesDoc([])).toBeNull();
    expect(await createDeliveryNotesDoc(null)).toBeNull();
  });
});
