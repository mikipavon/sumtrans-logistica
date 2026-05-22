# 📋 Backlog — SUM Logística

Lista de mejoras y funcionalidades pendientes para implementar cuando haya tiempo.

---

## 🔌 Integraciones Externas

### Integración Proservice (Albaranes por QR)
- **Prioridad**: Media
- **Descripción**: Cuando el conductor escanea un QR de Proservice, que se abra un albarán pre-rellenado con los datos del destinatario.
- **Hallazgos (30/04/2026)**:
  - El QR de Proservice contiene solo el **SSCC** (ej: `00202280000000777454`), NO los datos del destinatario.
  - Los datos del cliente (nombre, dirección, CP, ciudad) están **impresos** en la etiqueta pero no codificados en el QR.
  - Ejemplo real: Destinatario "JIMENEZ MOTORSPORT", Pol. Ind. Los Bermejales, 14812 Almedinilla, 5 unidades.
- **Opciones de implementación**:
  - [ ] **Opción A (sin depender de Proservice)**: Al escanear QR externo → abrir formulario con Proservice como remitente → conductor rellena destino a mano desde la etiqueta.
  - [ ] **Opción B (con colaboración de Proservice)**: Proservice envía Excel diario con SSCC → datos destino. Al escanear → buscar SSCC → auto-rellenar todo.
- **Antes de empezar, resolver**:
  - [ ] ¿Proservice puede facilitar un Excel/CSV diario con sus envíos y datos de destino?
  - [ ] ¿Qué tipo de facturación tiene Proservice? (Facturación mensual / Clientes Habituales)

---

## 🚀 Funcionalidades Futuras

- [ ] **Factura Simplificada**: Implementar generación de factura simplificada para envíos con **portes debidos**.

_(Añadir aquí nuevas ideas conforme surjan)_

---

*Última actualización: 30 Abril 2026*
