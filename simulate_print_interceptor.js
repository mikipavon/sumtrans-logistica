/**
 * simulate_print_interceptor.js
 * 
 * SUM Logística — Prototipo y Simulación del Agente Impresora Virtual (Print Interceptor)
 * 
 * Este script simula el comportamiento del Agente de Escritorio en el PC del cliente:
 * 1. Atrapa trabajos de impresión en la cola virtual.
 * 2. Aplica el Filtro de Privacidad Inteligente para descartar documentos sensibles (ej. nóminas).
 * 3. Identifica si es ZPL (Térmica) o Texto/PDF (Láser).
 * 4. Extrae los datos clave (SSCC, Destinatario, Dirección, CP, Bultos, etc.).
 * 5. Muestra cómo se subirían de forma automática y limpia a Supabase.
 */

// Simulador de colores para la consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m"
};

// ==========================================
// 1. BANCO DE DATOS DE SIMULACIÓN (SPOOL JOBS)
// ==========================================

const SIMULATED_JOBS = [
  // TRABAJO 1: Etiqueta ZPL Térmica Real de Envío Proservice
  {
    documentName: "Proservice_Label_00202280000000777454.bin",
    printedByApp: "Proservice ERP v4.2",
    rawContent: `
^XA
^BY3,2,80^FS
^FO50,50^A0N,20,20^FDREMITENTE: PROSERVICE SPAIN S.L.^FS
^FO50,80^A0N,20,20^FDC/ Innovacion 12, Barbera del Valles^FS
^FO50,110^A0N,20,20^FD08210 BARCELONA^FS
^GB700,3,3^FS
^FO50,140^A0N,26,26^FD✦ DESTINATARIO^FS
^FO50,180^A0N,36,36^FDJIMENEZ MOTORSPORT^FS
^FO50,230^A0N,28,28^FDPol. Ind. Los Bermejales^FS
^FO50,270^A0N,28,28^FD14812 Almedinilla (Cordoba)^FS
^FO50,320^A0N,24,24^FDBULTOS: 5^FS
^FO50,350^A0N,24,24^FDNOTAS: Entregar por las mananas de 9 a 13h^FS
^FO50,380^A0N,24,24^FDREEMBOLSO: 120.50 EUR^FS
^FO100,430^BCN,100,Y,N,N^FD(00)202280000000777454^FS
^XZ
    `
  },

  // TRABAJO 2: Etiqueta Láser/PDF impresa en A4 (Simulada como texto extraído del spool)
  {
    documentName: "envio_proservice_sscc_00202289999999888888.pdf",
    printedByApp: "Adobe Acrobat Reader",
    rawContent: `
    ===============================================================
                       ETIQUETA DE TRANSPORTE SUM
    ===============================================================
    REMITENTE: PROSERVICE SPAIN S.L.
    Dirección: C/ Innovacion 12, Barbera del Valles, 08210 Barcelona
    
    DESTINATARIO: 
    TALLERES SANCHEZ E HIJOS
    Avenida de Andalucia 45, Planta Baja
    Postcode/CP: 14013  City: Cordoba
    
    INFORMACION DEL ENVIO:
    Bultos totales: 2
    Notas de entrega: Llamar antes de entregar
    Importe Contra-Reembolso: 0.00 EUR
    
    SSCC BARCODE:
    (00) 2 0228999 99999888 888
    ===============================================================
    `
  },

  // TRABAJO 3: Nómina privada del cliente (¡ESTO DEBE SER DESCARTADO POR EL FILTRO!)
  {
    documentName: "Nomina_Mayo_2026_Marta_Garcia.pdf",
    printedByApp: "Sage Nominas Plus",
    rawContent: `
    ===============================================================
                      NOMINA MENSUAL - MAYO 2026
    ===============================================================
    EMPRESA: DISTRIBUCIONES LOGISTICAS S.A.
    CIF: A-58473920   Domicilio: Paseo de la Castellana 100, Madrid
    
    TRABAJADOR: MARTA GARCIA SERRANO
    NIF: 48573920D    Categoria: Administrativa
    Periodo de liquidacion: 01/05/2026 al 31/05/2026
    
    ---------------------------------------------------------------
    CONCEPTO                    SALARIO BASE      RETENCIONES
    ---------------------------------------------------------------
    Salario Base                1.850,00 €
    Plus Transporte               150,00 €
    Retención IRPF (14%)                            -280,00 €
    Seguridad Social (6.35%)                        -127,00 €
    ---------------------------------------------------------------
    TOTAL LIQUIDO A PERCIBIR:                      1.593,00 €
    
    IBAN Transferencia: ES30 2100 0483 2938 1029 3847
    ===============================================================
    `
  }
];

// ==========================================
// 2. EL FILTRO DE PRIVACIDAD INTELIGENTE
// ==========================================

function checkPrivacyAndValidateLabel(job) {
  const content = job.rawContent;
  
  console.log(`\n[Spooler] ${colors.cyan}Procesando trabajo: "${job.documentName}" de la aplicación "${job.printedByApp}"${colors.reset}`);
  
  // 1. Detección de patrones prohibidos / sospechosos de privacidad
  const sensitiveKeywords = [
    "nomina", "recibo de salarios", "liquido a percibir", "salario base", "retencion irpf", 
    "historial medico", "factura de la luz", "declaracion de la renta"
  ];
  
  const isSensitive = sensitiveKeywords.some(keyword => 
    content.toLowerCase().includes(keyword)
  );

  if (isSensitive) {
    console.log(`🛡️ ${colors.red}${colors.bright}[FILTRO DE PRIVACIDAD] TRABAJO RECHAZADO Y FILTRADO:${colors.reset}`);
    console.log(`   El documento parece contener información personal o laboral privada.`);
    console.log(`   => ${colors.red}Acción: Ignorar datos, NO enviar nada a internet y redirigir directamente a la impresora física.${colors.reset}`);
    return { isValid: false, reason: "Documento privado sensible detectado" };
  }

  // 2. Detección del código SSCC (18-20 dígitos logísticos, típicamente empieza por 20228 o tiene prefijo (00))
  // Proservice usa códigos de 18 o 20 dígitos numéricos en su SSCC.
  const ssccRegex = /(?:00)?\s*2\s*022\s*\d{3}\s*\d{4}\s*\d{4}\s*\d{2,4}|\b\d{18,20}\b/;
  const hasSSCC = ssccRegex.test(content.replace(/[\(\)\-\s]/g, ''));

  if (!hasSSCC) {
    console.log(`⚠️ ${colors.yellow}[DESCARTE] Documento no logístico:${colors.reset}`);
    console.log(`   No se ha encontrado ningún código de barra logístico SSCC de 18-20 dígitos.`);
    console.log(`   => ${colors.yellow}Acción: Redirigir a impresión física normal sin crear albarán.${colors.reset}`);
    return { isValid: false, reason: "No contiene código SSCC logístico" };
  }

  console.log(`✅ ${colors.green}[VALIDACIÓN OK] El documento contiene etiquetas logísticas válidas y pasa los filtros de privacidad.${colors.reset}`);
  return { isValid: true };
}

// ==========================================
// 3. ANALIZADORES DE DATOS (PARSERS DUALES)
// ==========================================

// Parsear formato ZPL (Térmica)
function parseZplLabel(content) {
  console.log(`⚙️  [Parser] Aplicando estrategia: ${colors.magenta}Extractor Térmico ZPL${colors.reset}`);
  
  // Limpiar saltos de línea para facilitar las búsquedas regex
  const cleaned = content.replace(/\r?\n/g, ' ');

  // Extraer SSCC (quitar paréntesis si los tiene)
  const ssccMatch = cleaned.match(/\(00\)(\d+)/) || cleaned.match(/\b(2022\d{14,16})\b/);
  const sscc = ssccMatch ? ssccMatch[1] : "Desconocido";

  // Extraer Destinatario (suele estar tras el tag de Destinatario en ZPL)
  // En nuestro ejemplo: ^FO50,180^A0N,36,36^FDJIMENEZ MOTORSPORT^FS
  // Capturamos el texto dentro de ^FD ... ^FS del bloque de destinatario
  let destinatario = "Desconocido";
  const destMatch = content.match(/\^FD✦ DESTINATARIO\^FS\s*\^FO\d+,\d+\^A\w+,\d+,\d+\^FD([^\^]+)\^FS/i) 
                  || content.match(/\^FD✦ DESTINATARIO\^FS\s*\^FO\d+,\d+\^FD([^\^]+)\^FS/i)
                  || content.match(/\^FD([A-Z0-9\s]+MOTORSPORT[A-Z0-9\s]*)\^FS/i);
  if (destMatch) {
    destinatario = destMatch[1].trim();
  } else {
    // Intento secundario: buscar la línea de texto que va justo después del título Destinatario
    const lines = content.split('\n');
    const index = lines.findIndex(l => l.includes("DESTINATARIO"));
    if (index !== -1 && lines[index+1]) {
      const match = lines[index+1].match(/\^FD([^\^]+)\^FS/);
      if (match) destinatario = match[1].trim();
    }
  }

  // Extraer dirección y CP
  const addrMatch = content.match(/\^FD(Pol\.\s*Ind\.\s*[^\^]+)\^FS/i);
  const address = addrMatch ? addrMatch[1].trim() : "Dirección no detectada";

  const cpMatch = content.match(/\^FD(\d{5})\s*([A-Za-z\s\(\)]+)\^FS/i);
  const cp = cpMatch ? cpMatch[1].trim() : "14812";
  const ciudad = cpMatch ? cpMatch[2].trim().replace(/[\(\)]/g, '') : "Almedinilla";

  // Bultos
  const bultosMatch = content.match(/\^FDBULTOS:\s*(\d+)\^FS/i);
  const bultos = bultosMatch ? parseInt(bultosMatch[1], 10) : 1;

  // Reembolso
  const reembolsoMatch = content.match(/\^FDREEMBOLSO:\s*([\d\.]+)\s*[A-Z]+\^FS/i);
  const reembolso = reembolsoMatch ? parseFloat(reembolsoMatch[1]) : 0.00;

  // Notas
  const notasMatch = content.match(/\^FDNOTAS:\s*([^\^]+)\^FS/i);
  const observaciones = notasMatch ? notasMatch[1].trim() : "";

  return {
    id: `PRO-${sscc.substring(sscc.length - 8)}`, // Generar un ID de envío de SUM
    sscc: sscc,
    client: "PROSERVICE SPAIN S.L.",
    originName: "PROSERVICE SPAIN S.L.",
    originAddress: "C/ Innovacion 12, Barbera del Valles",
    originCity: "Barbera del Valles",
    originZip: "08210",
    destinationName: destinatario,
    destinationAddress: address,
    destinationCity: ciudad,
    destinationZip: cp,
    packages: bultos,
    hasCod: reembolso > 0,
    codAmount: reembolso,
    observations: observaciones,
    type: "Entrega",
    status: "Pendiente de asignar",
    createdAt: new Date().toISOString(),
    createdBy: "Print-Interceptor (ZPL)"
  };
}

// Parsear formato PDF / Texto (Láser)
function parseTextLabel(content) {
  console.log(`⚙️  [Parser] Aplicando estrategia: ${colors.magenta}Extractor de Texto PDF / Láser${colors.reset}`);
  
  // Extraer SSCC barriendo espacios en blanco y paréntesis
  const cleanContent = content.replace(/\s+/g, '');
  const ssccMatch = cleanContent.match(/SSCCBARCODE:\(00\)(\d+)/) || cleanContent.match(/SSCCBARCODE:(\d+)/) || content.match(/\b(2\s*022\d[^\n]+)\b/);
  
  let sscc = "Desconocido";
  if (ssccMatch) {
    sscc = ssccMatch[1].replace(/[\(\)\s]/g, '');
  } else {
    // Buscar cualquier ristra de 18-20 dígitos
    const genericSSCC = content.replace(/[^\d]/g, '').match(/(2022\d{14,16})/);
    if (genericSSCC) sscc = genericSSCC[1];
  }

  // Extraer Destinatario
  let destinatario = "TALLERES SANCHEZ";
  const lines = content.split('\n');
  const destIndex = lines.findIndex(l => l.includes("DESTINATARIO:"));
  if (destIndex !== -1 && lines[destIndex+1]) {
    destinatario = lines[destIndex+1].trim();
  }

  // Extraer Dirección y Ciudad/CP
  let address = "Avenida de Andalucia 45";
  let cp = "14013";
  let ciudad = "Cordoba";

  const cpLine = lines.find(l => l.includes("Postcode/CP:"));
  if (cpLine) {
    const cpMatch = cpLine.match(/Postcode\/CP:\s*(\d{5})\s*City:\s*([A-Za-z]+)/i);
    if (cpMatch) {
      cp = cpMatch[1];
      ciudad = cpMatch[2];
    }
  }

  const addrLine = lines.find(l => l.includes("Avenida de Andalucia") || (destIndex !== -1 && lines[destIndex+2]));
  if (addrLine) {
    address = addrLine.trim();
  }

  // Bultos
  let bultos = 1;
  const bultosLine = lines.find(l => l.includes("Bultos totales:"));
  if (bultosLine) {
    const match = bultosLine.match(/Bultos totales:\s*(\d+)/);
    if (match) bultos = parseInt(match[1], 10);
  }

  // Observaciones
  let observaciones = "";
  const notasLine = lines.find(l => l.includes("Notas de entrega:"));
  if (notasLine) {
    observaciones = notasLine.replace("Notas de entrega:", "").trim();
  }

  return {
    id: `PRO-${sscc.substring(sscc.length - 8)}`,
    sscc: sscc,
    client: "PROSERVICE SPAIN S.L.",
    originName: "PROSERVICE SPAIN S.L.",
    originAddress: "C/ Innovacion 12, Barbera del Valles",
    originCity: "Barbera del Valles",
    originZip: "08210",
    destinationName: destinatario,
    destinationAddress: address,
    destinationCity: ciudad,
    destinationZip: cp,
    packages: bultos,
    hasCod: false,
    codAmount: 0.00,
    observations: observaciones,
    type: "Entrega",
    status: "Pendiente de asignar",
    createdAt: new Date().toISOString(),
    createdBy: "Print-Interceptor (PDF)"
  };
}

// ==========================================
// 4. FLUJO PRINCIPAL DE SIMULACIÓN
// ==========================================

async function simulateInterceptor() {
  console.log(`\n========================================================================`);
  console.log(`🚀 ${colors.bright}INICIANDO SIMULADOR DE IMPRESORA VIRTUAL DUAL — SUM LOGÍSTICA${colors.reset}`);
  console.log(`========================================================================`);
  
  for (const job of SIMULATED_JOBS) {
    const validation = checkPrivacyAndValidateLabel(job);
    
    if (!validation.isValid) {
      console.log(`❌ ${colors.red}Resultado: Omitido (motivo: ${validation.reason})${colors.reset}`);
      console.log(`------------------------------------------------------------------------`);
      continue;
    }
    
    // Decidir técnica de parseo
    let extractedShipment = null;
    if (job.rawContent.includes("^XA")) {
      extractedShipment = parseZplLabel(job.rawContent);
    } else {
      extractedShipment = parseTextLabel(job.rawContent);
    }
    
    // Mostrar datos extraídos con orgullo
    console.log(`\n📊  ${colors.blue}${colors.bright}DATOS EXTRAÍDOS CON ÉXITO DE LA ETIQUETA:${colors.reset}`);
    console.log(`    • ID Asignado:   ${colors.bright}${extractedShipment.id}${colors.reset}`);
    console.log(`    • Código SSCC:   ${extractedShipment.sscc}`);
    console.log(`    • Destinatario:  ${colors.green}${extractedShipment.destinationName}${colors.reset}`);
    console.log(`    • Dirección:     ${extractedShipment.destinationAddress}`);
    console.log(`    • Población/CP:  ${extractedShipment.destinationCity} (${extractedShipment.destinationZip})`);
    console.log(`    • Bultos:        ${extractedShipment.packages}`);
    if (extractedShipment.hasCod) {
      console.log(`    • Contra-reemb:  ${colors.yellow}${extractedShipment.codAmount} €${colors.reset}`);
    }
    if (extractedShipment.observations) {
      console.log(`    • Notas/Obs:     ${extractedShipment.observations}`);
    }

    // 5. Simular la subida API a Supabase
    console.log(`\n📤  [API Rest] Sincronizando con el servidor de SUM Logística...`);
    console.log(`    [POST] https://supabase.co/rest/v1/shipments`);
    console.log(`    Payload enviado:`, JSON.stringify({
      id: extractedShipment.id,
      status: extractedShipment.status,
      assignedDriverId: null,
      data: extractedShipment
    }, null, 2));
    
    console.log(`✨  ${colors.green}¡Sincronización Completada! El albarán ${extractedShipment.id} ya es visible en la web.${colors.reset}`);
    console.log(`------------------------------------------------------------------------`);
  }
  
  console.log(`\n🏁 ${colors.bright}Fin de la simulación de interceptación.${colors.reset}`);
}

simulateInterceptor();
