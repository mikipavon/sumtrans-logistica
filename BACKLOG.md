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
- **Implementado (27/05/2026)**:
  - [x] **Impresora Virtual (Print Interceptor)**: Agente local TCP en `src/utils/print-agent/` que intercepta la cola de impresión del cliente, extrae datos del SSCC (ZPL y PDF) y crea el albarán automáticamente en Supabase. Filtro de privacidad RGPD incluido.
  - [x] **Capa 2 — Modal de Rescate**: Si el cliente imprime a la impresora equivocada y el conductor escanea un QR no registrado, aparece un modal naranja que permite crear el albarán en el acto con el SSCC pre-rellenado.
- **Pendiente**:
  - [ ] **Opción B (con colaboración de Proservice)**: Proservice envía Excel diario con SSCC → datos destino. Al escanear → buscar SSCC → auto-rellenar todo.
  - [ ] ¿Proservice puede facilitar un Excel/CSV diario con sus envíos y datos de destino?
  - [ ] ¿Qué tipo de facturación tiene Proservice? (Facturación mensual / Clientes Habituales)

---

## 📷 OCR — Lectura Automática de Etiquetas Físicas

- **Prioridad**: Media
- **Descripción**: Cuando el conductor escanea un QR no registrado y aparece el **Modal de Rescate (Capa 2)**, añadir un botón "📷 Fotografiar etiqueta" que use OCR para extraer automáticamente todos los datos del destinatario de la imagen de la etiqueta física, sin que el conductor tenga que escribir nada a mano.
- **Flujo esperado**:
  1. QR escaneado no encontrado → Modal de Rescate naranja
  2. Conductor pulsa "📷 Fotografiar etiqueta"
  3. Cámara del móvil captura la pegatina física
  4. OCR extrae: Destinatario, Dirección, CP, Ciudad, Bultos
  5. Formulario "Nuevo Envío" se abre 100% auto-rellenado
  6. Conductor confirma y guarda — cero escritura manual
- **Opciones técnicas**:
  - [ ] **Opción A (Tesseract.js)**: OCR local en el navegador, sin coste, ~3-5 seg. Buena precisión para etiquetas con texto grande.
  - [ ] **Opción B (Google Vision API)**: Mayor precisión, ~1-2 seg, ~0.0015€/foto. Requiere cuenta Google Cloud.
- **Recomendación**: Empezar con Tesseract.js (sin coste) y evaluar si la precisión es suficiente para el formato de etiquetas de Proservice.

---

## 🖥️ Instalador del Agente Print Interceptor

- **Prioridad**: Baja
- **Descripción**: Crear un instalador `.exe` autoejecutor de Windows para el cliente de Proservice, que instale automáticamente el agente Node.js (`agent.cjs`) como servicio de Windows y cree la impresora virtual TCP/IP sin intervención manual.
- **Tecnología sugerida**: `pkg` (empaqueta Node.js en .exe) + `node-windows` (instala como servicio de Windows).
- **Archivos base ya listos**: `src/utils/print-agent/agent.cjs`, `config.json`, `INSTALL_GUIDE.md`

---

## 🚀 Funcionalidades Futuras

- [ ] **Factura Simplificada**: Implementar generación de factura simplificada para envíos con **portes debidos**.

_(Añadir aquí nuevas ideas conforme surjan)_

---

*Última actualización: 27 Mayo 2026*
