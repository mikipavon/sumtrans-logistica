/**
 * Clase Shipment (Albarán)
 * Centraliza la lógica de negocio de los albaranes para evitar errores de regresión.
 *
 * TIPOS DE CLIENTE:
 *   - 'Facturación': Cliente con crédito, paga a final de mes.
 *   - 'Clientes Habituales': Cliente de pago inmediato (reemplaza a los antiguos Clientes Habituales y Clientes Habituales).
 *
 * TIPOS DE PORTE:
 *   - 'Pagado': El REMITENTE asume el coste del transporte.
 *   - 'Debido': El DESTINATARIO asume el coste del transporte.
 *
 * REEMBOLSO (COD):
 *   - hasCod = true: El conductor debe cobrar una cantidad adicional al destinatario.
 */
export default class Shipment {
  constructor(data = {}) {
    // El prefijo del ID se asigna al crear desde el modal; aquí es solo el fallback de emergencia
    this.id = data.id || `SUM-${new Date().getFullYear().toString().slice(-2)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    this.client = data.client || '';
    this.type = data.type || 'Entrega';
    this.status = data.status || 'Pendiente de asignar';
    this.scheduledDate = data.scheduledDate || null; // Fecha de asignación/entrega programada (string YYYY-MM-DD o null)
    this.porteType = data.porteType || 'Pagado'; // 'Pagado', 'Debido'
    this.billingType = data.billingType || 'Clientes Habituales'; // Billing del REMITENTE
    this.destinationBillingType = data.destinationBillingType || null; // Billing del DESTINATARIO (casos 6 y 7)

    // Datos de Origen
    this.origin = data.origin || '';
    this.originAddress = data.originAddress || '';
    this.originCity = data.originCity || '';
    this.originZip = data.originZip || '';
    this.originPhone = data.originPhone || '';
    this.originCoordinates = data.originCoordinates || '';

    // Datos de Destino
    this.destination = data.destination || '';
    this.destinationName = data.destinationName || '';
    this.destinationAddress = data.destinationAddress || '';
    this.destinationCity = data.destinationCity || '';
    this.destinationZip = data.destinationZip || '';
    this.destinationPhone = data.destinationPhone || '';
    this.destinationCoordinates = data.destinationCoordinates || '';
    this.deliveryCoordinates = data.deliveryCoordinates || null;

    // Importes
    this.date = data.date || new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    this.createdAt = data.createdAt || new Date().toISOString();
    this.address = data.address || '';
    this.amount = data.amount || 0;
    this.customAmount = data.customAmount !== undefined ? data.customAmount : (parseFloat(data.amount) || 0);
    this.hasCod = !!data.hasCod;
    this.codAmount = parseFloat(data.codAmount) || 0;
    this.codCommission = parseFloat(data.codCommission) || 0;
    this.paymentStatus = data.paymentStatus || 'Pending'; // 'Paid', 'Pending'
    this.portePaid = !!data.portePaid;
    this.codPaid = !!data.codPaid;
    this.hasSimplifiedInvoice = !!data.hasSimplifiedInvoice;
    this.simplifiedInvoiceAmount = data.simplifiedInvoiceAmount || null;
    this.simplifiedInvoicePaid = !!data.simplifiedInvoicePaid;

    this.assignedDriverId = data.assignedDriverId || null;
    this.observations = data.observations || '';
    this.incidentReason = data.incidentReason || '';
    this.incidentPhoto = data.incidentPhoto || null;
    this.incidentStatus = data.incidentStatus || 'none'; // 'none', 'active', 'resolved'
    this.incidentReply = data.incidentReply || ''; // Response from admin
    
    // Entrega (Pruebas)
    this.deliverySignature = data.deliverySignature || null; // URL de la firma
    this.deliveryPhoto = data.deliveryPhoto || null; // URL de la foto del sello/mercancía
    this.deliveryPhoto2 = data.deliveryPhoto2 || null; // URL de la segunda foto (para documentación firmada)
    this.receiverName = data.receiverName || '';
    this.receiverId = data.receiverId || '';
    this.merchandisePhoto = data.merchandisePhoto || null; // Foto tomada al crear el albarán
    
    this.articles = data.articles || [];
    this.agencyLabel = data.agencyLabel || 'SUM ESPECIAL';
    this.agencyLogoUrl = data.agencyLogoUrl || null;
    this.hasReturn = !!data.hasReturn;
    this.needsSignatureReturn = !!data.needsSignatureReturn;
    this.returnShipmentId = data.returnShipmentId || null;

    this.createdAt = data.createdAt || new Date().toISOString();
    this.createdBy = data.createdBy || '';
    this.createdById = data.createdById || null;
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.deliveredAt = data.deliveredAt || null;
    this.paidAt = data.paidAt || (this.portePaid || this.codPaid ? this.updatedAt : null);

    // Referencia externa del cliente (QR, código de barras, SSCC)
    this.clientReference = data.clientReference || null;
    this.importedFromExcel = data.importedFromExcel || false;
    this.excelFileName = data.excelFileName || null;

    // Campos de escaneo
    this.scannedPackages = data.scannedPackages || [];
    this.pickedUpBy = data.pickedUpBy || null;
    this.pickedUpById = data.pickedUpById || null;
    this.pickedUpAt = data.pickedUpAt || null;

    // Paquetes
    this.packages = data.packages || null;
    this.originName = data.originName || data.client || '';

    // IDs de cliente
    this.clientId = data.clientId || null;

    // Kilos y franjas de peso
    this.weightKg = data.weightKg || null;
    this.weightBracket = data.weightBracket || null;

    // Justificante de reembolso firmado (foto/escaneo)
    this.codReceiptPhoto = data.codReceiptPhoto || null;

    // Reglas de entrega del cliente (snapshot congelado al crear)
    this.deliveryRules = data.deliveryRules || null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  isCashBilling(type) {
    if (!type) return true; // Sin tipo → tratar como habitual (cobrar por seguridad)
    const t = String(type).toLowerCase();
    return t.includes('habitual') || t.includes('diario') || t.includes('libre') || t.includes('contado');
  }

  isInvoiceBilling(type) {
    if (!type) return false;
    const t = String(type).toLowerCase();
    return t.includes('factur') || t.includes('presupuesto');
  }

  isVatExempt(type = this.billingType) {
    if (!type) return false;
    const t = String(type).toLowerCase();
    return t.includes('presupuesto');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CÁLCULO DE TOTALES
  // ─────────────────────────────────────────────────────────────────────────────

  calculateTotal() {
    const articlesTotal = this.articles.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    return (articlesTotal + this.codCommission).toFixed(2);
  }

  /**
   * Calcula el importe que el conductor debe pedir al destinatario.
   * Depende del tipo de porte y del tipo de facturación del destinatario.
   *
   * CASOS:
   *   - Debido + COD → destinatario paga porte + reembolso
   *   - Debido sin COD → destinatario paga solo porte (a menos que sea de Facturación)
   *   - Pagado + COD → destinatario solo paga el reembolso
   *   - Pagado sin COD → destinatario no paga nada
   */
  amountToCollectAtDelivery() {
    const porte = parseFloat(this.customAmount) || parseFloat(this.amount) || 0;
    const cod = this.hasCod ? this.codAmount : 0;

    if (this.porteType === 'Debido') {
      // Si el destinatario factura, el porte va a su factura → conductor solo cobra reembolso
      if (this.isInvoiceBilling(this.destinationBillingType)) {
        return cod;
      }
      // Si el destinatario es cliente habitual, cobra todo
      return porte + cod;
    }

    // Porte PAGADO: el porte ya lo pagó el remitente, solo cobra reembolso si lo hay
    return cod;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ALERTAS AL CREAR UN ALBARÁN
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * ¿Debe aparecer una alerta de pago al crear el albarán?
   * REGLA 1: Siempre si hay REEMBOLSO (COD).
   * REGLA 2: Solo si el REMITENTE es Cliente Habitual y el porte es PAGADO.
   */
  needsPaymentAlert(clientInfo) {
    const bType = clientInfo?.billingType || this.billingType;
    if (this.porteType === 'Pagado') {
      // Si el porte es PAGADO, alertamos por defecto para cobrar al remitente
      // EXCEPTO si el cliente es explícitamente de Facturación/Crédito/Presupuesto.
      if (!bType) return true;
      const t = String(bType).toLowerCase();
      if (t.includes('facturaci') || t.includes('credito') || t.includes('mensual') || t.includes('presupuesto')) {
        return false;
      }
      return true; // Clientes Habituales, Contado o Desconocido -> ALERTAR
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ¿GENERA DEUDA EN "COBROS PENDIENTES" AL CREAR?
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Determina si el albarán debe generar un cobro pendiente en el momento de su creación.
   * Solo aplica para PORTE PAGADO por CLIENTES HABITUALES (no pagan al instante).
   */
  generatesPendingDebtOnCreation() {
    if (this.porteType !== 'Pagado') return false;
    return this.isCashBilling(this.billingType);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMBIO DE ESTADO (ENTREGA, APLAZAMIENTO, INCIDENCIA)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Cambia el estado del albarán siguiendo las reglas de negocio.
   * Devuelve un objeto con metadatos del cambio para que la UI pueda reaccionar:
   *   - pendingCollectionTarget: a quién se genera la deuda ('sender', 'receiver', o null)
   *   - addToCashRegister: si el cobro va a la caja del conductor
   *   - codCashRegister: si el reembolso va a la caja
   */
  updateStatus(newStatus, comment = null, photo = null, proof = null) {
    const result = {
      pendingCollectionTarget: null,
      addToCashRegister: false,
      codCashRegister: false,
    };


    // ── INCIDENCIA ────────────────────────────────────────────────────────────
    if (newStatus === 'Incidencia') {
      this.status = 'Pendiente de asignar';
      this.assignedDriverId = null;
      this.incidentStatus = 'active';
      if (comment) this.incidentReason = comment;
      if (photo) this.incidentPhoto = photo;
      return result;
    }

    // ── ANULADO ───────────────────────────────────────────────────────────────
    if (newStatus === 'Anulado') {
      this.status = 'Anulado';
      this.assignedDriverId = null;
      this.observations = `[ANULADO EL ${new Date().toLocaleDateString()}] ${this.observations}`;
      return result;
    }

    // ── ENTREGADO ─────────────────────────────────────────────────────────────
    if (newStatus === 'Entregado') {
      this.status = 'Entregado';
      this.incidentStatus = 'resolved';

      // Asignar pruebas de entrega si se proporcionan
      if (proof) {
        if (proof.signatureUrl) this.deliverySignature = proof.signatureUrl;
        if (proof.photoUrl) this.deliveryPhoto = proof.photoUrl;
        if (proof.photoUrl2) this.deliveryPhoto2 = proof.photoUrl2;
        
        // Datos del receptor
        if (proof.name) this.receiverName = proof.name;
        if (proof.id) this.receiverId = proof.id;
        
        // Coordenadas de entrega
        if (proof.coordinates) this.deliveryCoordinates = proof.coordinates;
      }


      if (this.porteType === 'Debido') {
        if (this.isInvoiceBilling(this.destinationBillingType)) {
          // CASO 7: Porte va a factura del destinatario, reembolso a la caja
          result.codCashRegister = this.hasCod || this.codAmount > 0;
          this.portePaid = true; // No genera deuda de contado
        } else {
          // CASOS 3/6: Destinatario cliente habitual
          // NO marcamos portePaid/codPaid automáticamente. 
          // La UI marcará qué se ha cobrado realmente.
          result.addToCashRegister = false; 
          result.codCashRegister = false;
        }
      } else {
        // PORTE PAGADO
        // El porte del remitente: si factura→ pagado (virtualmente); 
        // si cliente habitual → Sigue pendiente (portePaid = false)
        if (this.isInvoiceBilling(this.billingType)) {
          this.portePaid = true;
        }
        
        // Solo el reembolso va a caja del conductor al entregar
        result.codCashRegister = this.hasCod || this.codAmount > 0;
        if (this.hasCod) {
          this.codPaid = true; // Se asume cobrado al entregar al destinatario
        }
      }

      // SOLO ponemos paymentStatus = 'Paid' si AMBOS están liquidados
      if (this.portePaid && (!this.hasCod || this.codPaid)) {
        this.paymentStatus = 'Paid';
      } else {
        this.paymentStatus = 'Pending';
      }
      
      return result;
    }

    // ── ENTREGA APLAZADA ──────────────────────────────────────────────────────
    if (newStatus === 'Entrega aplazada') {
      // Si paga el DESTINATARIO (Debido) → vuelve a asignar en todos los casos
      // (el paquete no se puede dejar sin cobrar si es Debido)
      if (this.porteType === 'Debido') {
        this.status = 'Pendiente de asignar';
        this.assignedDriverId = null;
        return result;
      }

      // PORTE PAGADO: el porte ya existía como deuda del remitente (si es cliente habitual)
      // El paquete vuelve a asignar, pero la deuda del porte del REMITENTE permanece
      this.status = 'Pendiente de asignar';
      this.assignedDriverId = null;

      // Si el remitente es cliente habitual y no había pagado, la deuda ya estaba creada
      // No generamos nueva deuda aquí, simplemente no la borramos
      if (this.isCashBilling(this.billingType)) {
        result.pendingCollectionTarget = 'sender'; // La deuda sigue en el sistema
      }

      return result;
    }

    this.status = newStatus;
    return result;
  }

  toJSON() {
    return { ...this };
  }
}
