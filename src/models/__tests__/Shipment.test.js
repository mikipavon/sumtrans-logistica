import { describe, it, expect } from 'vitest';
import Shipment from '../Shipment';

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS de instancias para los 7 casos
// ──────────────────────────────────────────────────────────────────────────────
const REMITENTE_FACTURACION = { billingType: 'Facturación' };
const REMITENTE_COBRO_DIARIO = { billingType: 'Clientes Habituales' };
const DESTINATARIO_COBRO_DIARIO = 'Clientes Habituales';
const DESTINATARIO_FACTURACION = 'Facturación';

// ──────────────────────────────────────────────────────────────────────────────
// CASO 1: Remitente FACTURACIÓN · Porte PAGADO · Sin Reembolso
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 1: Facturación + Porte Pagado + Sin Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Pagado',
    billingType: 'Facturación',
    hasCod: false,
    codAmount: 0,
    assignedDriverId: 1
  });

  it('Al crear: NO genera alerta de pago', () => {
    const s = makeShipment();
    expect(s.needsPaymentAlert(REMITENTE_FACTURACION)).toBe(false);
  });

  it('Al crear: NO genera deuda en Cobros Pendientes', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(false);
  });

  it('Conductor en destino: importe a cobrar = 0', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(0);
  });

  it('Al entregar: status = Entregado', () => {
    const s = makeShipment();
    s.updateStatus('Entregado');
    expect(s.status).toBe('Entregado');
  });

  it('Al aplazar: vuelve a Pendiente de asignar, sin deuda generada', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    expect(result.pendingCollectionTarget).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 2: Remitente cliente habitual · Porte PAGADO · Sin Reembolso
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 2: Clientes Habituales + Porte Pagado + Sin Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Pagado',
    billingType: 'Clientes Habituales',
    hasCod: false,
    codAmount: 0,
    customAmount: 50,
    assignedDriverId: 1
  });

  it('Al crear: SÍ genera alerta de pago', () => {
    const s = makeShipment();
    expect(s.needsPaymentAlert(REMITENTE_COBRO_DIARIO)).toBe(true);
  });

  it('Al crear: SÍ genera deuda en Cobros Pendientes', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(true);
  });

  it('Conductor en destino: importe a cobrar = 0 (el destinatario no paga porte)', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(0);
  });

  it('Al aplazar: vuelve a Pendiente de asignar, la deuda del remitente PERMANECE', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    // La deuda del remitente sigue activa (no se borra)
    expect(result.pendingCollectionTarget).toBe('sender');
  });

  it('Al entregar: el estado es Entregado pero el pago sigue PENDIENTE (candado Caso 2)', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entregado');
    
    expect(s.status).toBe('Entregado');
    // CRÍTICO: El pago debe seguir Pending porque el remitente cliente habitual aún no ha pagado el porte
    expect(s.paymentStatus).toBe('Pending');
    expect(s.portePaid).toBe(false);
    
    // VERIFICACIÓN DE CAJA: No debe sumarse nada automáticamente al cierre de caja
    expect(result.addToCashRegister).toBe(false);
    expect(result.codCashRegister).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 3: Cualquier Remitente · Porte DEBIDO · Sin Reembolso
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 3: Porte Debido + Sin Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Debido',
    billingType: 'Facturación',
    hasCod: false,
    codAmount: 0,
    customAmount: 60,
    destinationBillingType: DESTINATARIO_COBRO_DIARIO,
    assignedDriverId: 1
  });

  it('Al crear: NO genera deuda ni alerta', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(false);
    expect(s.needsPaymentAlert(REMITENTE_FACTURACION)).toBe(false);
  });

  it('Conductor en destino: debe cobrar el porte al destinatario', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(60);
  });

  it('Al aplazar: vuelve al pool, sin generar cobros pendientes prematuros', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    expect(result.pendingCollectionTarget).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 4: Remitente FACTURACIÓN · Porte PAGADO + REEMBOLSO
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 4: Facturación + Porte Pagado + Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Pagado',
    billingType: 'Facturación',
    hasCod: true,
    codAmount: 80,
    customAmount: 40,
    assignedDriverId: 1
  });

  it('Al crear: NO genera alerta por el REEMBOLSO (el cobro es en destino)', () => {
    const s = makeShipment();
    expect(s.needsPaymentAlert(REMITENTE_FACTURACION)).toBe(false);
  });

  it('Al crear: NO genera deuda del porte en Cobros Pendientes', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(false);
  });

  it('Conductor en destino: solo pide el REEMBOLSO, no el porte', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(80);
  });

  it('Al aplazar: vuelve a Asignar, sin deuda generada', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    expect(result.pendingCollectionTarget).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 5: Remitente cliente habitual · Porte PAGADO + REEMBOLSO
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 5: Clientes Habituales + Porte Pagado + Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Pagado',
    billingType: 'Clientes Habituales',
    hasCod: true,
    codAmount: 100,
    customAmount: 35,
    assignedDriverId: 1
  });

  it('Al crear: SÍ genera alerta SOLAMENTE por el porte cliente habitual (el reembolso es en destino)', () => {
    const s = makeShipment();
    expect(s.needsPaymentAlert(REMITENTE_COBRO_DIARIO)).toBe(true);
  });

  it('Al crear: SÍ genera deuda del porte en Cobros Pendientes', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(true);
  });

  it('Conductor en destino: solo pide el REEMBOLSO al destinatario', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(100);
  });

  it('Al aplazar: vuelve a Asignar, la deuda del porte del remitente PERMANECE', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    expect(result.pendingCollectionTarget).toBe('sender');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 6: Destinatario cliente habitual · Porte DEBIDO + REEMBOLSO
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 6: Destinatario Clientes Habituales + Porte Debido + Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Debido',
    billingType: 'Facturación',
    destinationBillingType: DESTINATARIO_COBRO_DIARIO,
    hasCod: true,
    codAmount: 120,
    customAmount: 45,
    assignedDriverId: 1
  });

  it('Al crear: NO genera deuda ni alerta del porte', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(false);
  });

  it('Conductor en destino: pide PORTE + REEMBOLSO sumados', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(45 + 120);
  });

  it('Al aplazar: vuelve al pool SIN generar deudas prematuras', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    expect(result.pendingCollectionTarget).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 7: Destinatario FACTURACIÓN · Porte DEBIDO + REEMBOLSO
// ──────────────────────────────────────────────────────────────────────────────
describe('CASO 7: Destinatario Facturación + Porte Debido + Reembolso', () => {
  const makeShipment = () => new Shipment({
    porteType: 'Debido',
    billingType: 'Clientes Habituales',
    destinationBillingType: DESTINATARIO_FACTURACION,
    hasCod: true,
    codAmount: 90,
    customAmount: 50,
    assignedDriverId: 1
  });

  it('Al crear: NO genera deuda ni alerta (el reembolso es en destino y el porte lo paga el destinatario)', () => {
    const s = makeShipment();
    expect(s.generatesPendingDebtOnCreation()).toBe(false);
    expect(s.needsPaymentAlert(REMITENTE_COBRO_DIARIO)).toBe(false);
  });

  it('Conductor en destino: solo pide el REEMBOLSO (el porte va a la factura del destinatario)', () => {
    const s = makeShipment();
    expect(s.amountToCollectAtDelivery()).toBe(90);
  });

  it('Al aplazar: vuelve al pool sin deudas en Cobros Pendientes', () => {
    const s = makeShipment();
    const result = s.updateStatus('Entrega aplazada');
    expect(s.status).toBe('Pendiente de asignar');
    expect(result.pendingCollectionTarget).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// REGLAS UNIVERSALES
// ──────────────────────────────────────────────────────────────────────────────
describe('Reglas Universales', () => {
  it('Incidencia: siempre vuelve al pool', () => {
    const s = new Shipment({ assignedDriverId: 1, status: 'En reparto' });
    s.updateStatus('Incidencia');
    expect(s.status).toBe('Pendiente de asignar');
    expect(s.assignedDriverId).toBeNull();
  });

  it('Anulado: libera conductor y registra fecha de anulación', () => {
    const s = new Shipment({ assignedDriverId: 1, observations: 'Nota previa' });
    s.updateStatus('Anulado');
    expect(s.status).toBe('Anulado');
    expect(s.assignedDriverId).toBeNull();
    expect(s.observations).toContain('[ANULADO EL');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MODAL DE ALERTA DE PAGO: ¿Cuándo salta?
// needsPaymentAlert() determina si se muestra el modal al crear el albarán
// ──────────────────────────────────────────────────────────────────────────────
describe('Modal de Alerta de Pago - Los 7 Casos', () => {
  const clientFact = { billingType: 'Facturación' };
  const clientCod  = { billingType: 'Clientes Habituales' };

  it('CASO 1 (Fact. + Pagado): NO salta modal', () => {
    const s = new Shipment({ porteType: 'Pagado', billingType: 'Facturación', hasCod: false });
    expect(s.needsPaymentAlert(clientFact)).toBe(false);
  });

  it('CASO 2 (CoD + Pagado): SÍ salta modal (hay que cobrarle el porte)', () => {
    const s = new Shipment({ porteType: 'Pagado', billingType: 'Clientes Habituales', hasCod: false });
    expect(s.needsPaymentAlert(clientCod)).toBe(true);
  });

  it('CASO 3 (Debido sin COD): NO salta modal (destinatario paga al recibir)', () => {
    const s = new Shipment({ porteType: 'Debido', billingType: 'Facturación', hasCod: false });
    expect(s.needsPaymentAlert(clientFact)).toBe(false);
  });

  it('CASO 4 (Fact. + Pagado + COD): NO salta modal (porte va a factura, reembolso es en destino)', () => {
    const s = new Shipment({ porteType: 'Pagado', billingType: 'Facturación', hasCod: true, codAmount: 80 });
    expect(s.needsPaymentAlert(clientFact)).toBe(false);
  });

  it('CASO 5 (CoD + Pagado + COD): SÍ salta modal (POR EL PORTE cliente habitual, no por el reembolso)', () => {
    const s = new Shipment({ porteType: 'Pagado', billingType: 'Clientes Habituales', hasCod: true, codAmount: 100 });
    expect(s.needsPaymentAlert(clientCod)).toBe(true);
  });

  it('CASO 6 (Debido + COD, dest. CoD): NO salta modal (porte y reembolso son en destino)', () => {
    const s = new Shipment({ porteType: 'Debido', billingType: 'Facturación', destinationBillingType: 'Clientes Habituales', hasCod: true, codAmount: 120 });
    expect(s.needsPaymentAlert(clientFact)).toBe(false);
  });

  it('CASO 7 (Debido + COD, dest. Fact.): NO salta modal (porte y reembolso son en destino)', () => {
    const s = new Shipment({ porteType: 'Debido', billingType: 'Clientes Habituales', destinationBillingType: 'Facturación', hasCod: true, codAmount: 90 });
    expect(s.needsPaymentAlert(clientCod)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// customAmount por defecto: `amount` casi siempre lleva el símbolo € o es "Tarifa"
// ──────────────────────────────────────────────────────────────────────────────
describe('customAmount por defecto (sin venir explícito)', () => {
    it('limpia el símbolo € del amount de creación', () => {
        const s = new Shipment({ amount: '€7.00' });
        expect(s.customAmount).toBe(7);
    });

    it('con coma decimal también', () => {
        const s = new Shipment({ amount: '€12,50' });
        expect(s.customAmount).toBe(12.5);
    });

    it('"Tarifa" sin número da 0, no NaN', () => {
        const s = new Shipment({ amount: 'Tarifa' });
        expect(s.customAmount).toBe(0);
        expect(Number.isNaN(s.customAmount)).toBe(false);
    });

    it('un customAmount explícito manda siempre, aunque sea 0', () => {
        const s = new Shipment({ amount: '€7.00', customAmount: 0 });
        expect(s.customAmount).toBe(0);
    });
});
