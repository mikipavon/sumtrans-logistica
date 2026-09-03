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

// El justificante que se baja el cliente desde su portal no lleva el precio del
// porte, lo pague él o lo pague el otro: es un justificante de entrega, no una
// factura. La oficina y el repartidor (sin ficha) lo siguen viendo.
describe('el importe del porte en el justificante', () => {
  const textoDel = (doc) => doc.output();
  const envioPagado = { ...envio(1), client: 'Cliente Test', amount: 5.4, porteType: 'Pagado' };
  const ficha = { id: 1, name: 'Cliente Test' };

  it('sin ficha (oficina, repartidor) sale el importe', async () => {
    const doc = await createDeliveryNotesDoc([envioPagado]);
    expect(textoDel(doc)).toContain('5.40');
  });

  it('con ficha de cliente no sale el importe aunque sea él quien paga', async () => {
    const doc = await createDeliveryNotesDoc([envioPagado], ficha);
    const texto = textoDel(doc);
    expect(texto).not.toContain('5.40');
    expect(texto).toContain('Porte: Pagado');
  });
});
