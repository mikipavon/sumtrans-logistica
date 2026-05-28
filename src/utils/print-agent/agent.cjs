/**
 * agent.cjs — SUM Logística Print Interceptor Agent
 * 
 * Un servidor TCP ligero y autónomo en Node.js que actúa como Impresora Virtual.
 * ⚡ SIN DEPENDENCIAS EXTERNES.
 */

const net = require('net');
const http = require('https');
const fs = require('fs');
const path = require('path');

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

const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
  localPort: 9100,
  supabaseUrl: "",
  supabaseKey: "",
  sensitiveKeywords: ["nomina", "salario base", "retencion irpf"],
  forwarding: { enabled: false, printerIp: "", printerPort: 9100 }
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`${colors.green}✔ Configuración cargada correctamente.${colors.reset}`);
  } catch (err) {
    console.error(`${colors.red}❌ Error leyendo config.json: ${err.message}${colors.reset}`);
  }
}

const SPOOLS_DIR = path.join(__dirname, 'spools');
if (!fs.existsSync(SPOOLS_DIR)) {
  fs.mkdirSync(SPOOLS_DIR);
}

function runPrivacyFilter(content) {
  const normalized = content.toLowerCase();
  const matched = config.sensitiveKeywords.find(kw => normalized.includes(kw.toLowerCase()));
  if (matched) return { isSensitive: true, keyword: matched };
  return { isSensitive: false };
}

function detectSSCC(content) {
  const cleanStr = content.replace(/[\(\)\-\s]/g, '');
  const match = cleanStr.match(/(2022\d{14,16})/);
  return match ? match[1] : null;
}

function parseZpl(content, sscc) {
  let destinationName = "Destinatario no identificado";
  const destMatch = content.match(/\^FD✦ DESTINATARIO\^FS\s*\^FO\d+,\d+\^\w+,\d+,\d+\^FD([^\^]+)\^FS/i) 
                 || content.match(/\^FD✦ DESTINATARIO\^FS\s*\^FO\d+,\d+\^FD([^\^]+)\^FS/i)
                 || content.match(/\^FD([A-Z0-9\s]+MOTORSPORT[A-Z0-9\s]*)\^FS/i);
  if (destMatch) destinationName = destMatch[1].trim();

  const addrMatch = content.match(/\^FD(Pol\.\s*Ind\.\s*[^\^]+)\^FS/i);
  const address = addrMatch ? addrMatch[1].trim() : "Dirección en etiqueta";

  const cpMatch = content.match(/\^FD(\d{5})\s*([A-Za-z\s\(\)]+)\^FS/i);
  const zip = cpMatch ? cpMatch[1].trim() : "";
  const city = cpMatch ? cpMatch[2].trim().replace(/[\(\)]/g, '') : "";

  const bultosMatch = content.match(/\^FDBULTOS:\s*(\d+)\^FS/i);
  const packages = bultosMatch ? parseInt(bultosMatch[1], 10) : 1;

  const reembolsoMatch = content.match(/\^FDREEMBOLSO:\s*([\d\.]+)\s*[A-Z]+\^FS/i);
  const hasCod = reembolsoMatch ? parseFloat(reembolsoMatch[1]) > 0 : false;
  const codAmount = hasCod ? parseFloat(reembolsoMatch[1]) : 0;

  const notasMatch = content.match(/\^FDNOTAS:\s*([^\^]+)\^FS/i);
  const observations = notasMatch ? notasMatch[1].trim() : "";

  return {
    id: `PRO-${sscc.substring(sscc.length - 8)}`,
    sscc,
    client: "PROSERVICE SPAIN S.L.",
    originName: "PROSERVICE SPAIN S.L.",
    originAddress: "C/ Innovacion 12, Barbera del Valles",
    originCity: "Barbera del Valles",
    originZip: "08210",
    destinationName,
    destinationAddress: address,
    destinationCity: city,
    destinationZip: zip,
    packages,
    hasCod,
    codAmount,
    observations,
    type: "Entrega",
    status: "Pendiente de asignar",
    createdAt: new Date().toISOString(),
    createdBy: "Print-Interceptor (ZPL)"
  };
}

function parseTextPdf(content, sscc) {
  const lines = content.split('\n');
  
  let destinationName = "Destinatario no identificado";
  const destIndex = lines.findIndex(l => l.includes("DESTINATARIO:"));
  if (destIndex !== -1 && lines[destIndex+1]) {
    destinationName = lines[destIndex+1].trim();
  }

  let address = "Dirección en etiqueta";
  const addrIndex = lines.findIndex(l => l.includes("DESTINATARIO:"));
  if (addrIndex !== -1 && lines[addrIndex+2]) {
    address = lines[addrIndex+2].trim();
  }

  let zip = "";
  let city = "";
  const cpLine = lines.find(l => l.includes("Postcode/CP:") || l.includes("CP:"));
  if (cpLine) {
    const cpMatch = cpLine.match(/(?:Postcode\/CP:|CP:)\s*(\d{5})\s*City:\s*([A-Za-z]+)/i)
                 || cpLine.match(/(\d{5})\s*([A-Za-z\s]+)/);
    if (cpMatch) {
      zip = cpMatch[1];
      city = cpMatch[2].trim();
    }
  }

  let packages = 1;
  const bultosLine = lines.find(l => l.toLowerCase().includes("bultos") || l.toLowerCase().includes("bultos totales:"));
  if (bultosLine) {
    const match = bultosLine.match(/\b(\d+)\b/);
    if (match) packages = parseInt(match[1], 10);
  }

  let observations = "";
  const notasLine = lines.find(l => l.toLowerCase().includes("notas") || l.toLowerCase().includes("notas de entrega:"));
  if (notasLine) {
    observations = notasLine.split(':')[1]?.trim() || "";
  }

  return {
    id: `PRO-${sscc.substring(sscc.length - 8)}`,
    sscc,
    client: "PROSERVICE SPAIN S.L.",
    originName: "PROSERVICE SPAIN S.L.",
    originAddress: "C/ Innovacion 12, Barbera del Valles",
    originCity: "Barbera del Valles",
    originZip: "08210",
    destinationName,
    destinationAddress: address,
    destinationCity: city,
    destinationZip: zip,
    packages,
    hasCod: false,
    codAmount: 0,
    observations,
    type: "Entrega",
    status: "Pendiente de asignar",
    createdAt: new Date().toISOString(),
    createdBy: "Print-Interceptor (PDF)"
  };
}

function uploadToSupabase(shipment) {
  if (!config.supabaseUrl || !config.supabaseKey) {
    console.log(`${colors.yellow}⚠ Supabase no configurado. Sincronización omitida.${colors.reset}`);
    return;
  }

  const host = config.supabaseUrl.replace("https://", "").replace("http://", "");
  
  const payload = JSON.stringify({
    id: shipment.id,
    status: shipment.status,
    assignedDriverId: null,
    data: shipment
  });

  const options = {
    hostname: host,
    port: 443,
    path: '/rest/v1/shipments',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': config.supabaseKey,
      'Authorization': `Bearer ${config.supabaseKey}`,
      'Prefer': 'resolution=merge-duplicates'
    }
  };

  console.log(`📤 Enviando albarán ${colors.cyan}${shipment.id}${colors.reset} a Supabase...`);

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`✨ ${colors.green}¡Sincronización Exitosa! Albarán ${shipment.id} creado en la nube.${colors.reset}`);
      } else {
        console.error(`❌ Error en Supabase API (${res.statusCode}):`, body);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`${colors.red}❌ Error de conexión al subir a Supabase: ${err.message}${colors.reset}`);
  });

  req.write(payload);
  req.end();
}

function forwardPrintJob(buffer) {
  if (!config.forwarding.enabled || !config.forwarding.printerIp) {
    console.log(`🔌 ${colors.yellow}Reenvío físico desactivado. Trabajo completado localmente.${colors.reset}`);
    return;
  }

  const { printerIp, printerPort } = config.forwarding;
  console.log(`⚡ Redirigiendo trabajo de impresión a la física: ${colors.cyan}${printerIp}:${printerPort}${colors.reset}...`);

  const clientSocket = new net.Socket();
  clientSocket.connect(printerPort, printerIp, () => {
    clientSocket.write(buffer);
    clientSocket.end();
    console.log(`✔ ${colors.green}Datos enviados con éxito a la impresora física.${colors.reset}`);
  });

  clientSocket.on('error', (err) => {
    console.error(`${colors.red}❌ Error enviando trabajo a la impresora física (${printerIp}): ${err.message}${colors.reset}`);
  });
}

const server = net.createServer((socket) => {
  console.log(`\n🔔 ${colors.bright}Nueva conexión de impresión recibida desde ${socket.remoteAddress}${colors.reset}`);
  
  const chunks = [];
  
  socket.on('data', (chunk) => {
    chunks.push(chunk);
  });
  
  socket.on('end', () => {
    const rawBuffer = Buffer.concat(chunks);
    const textContent = rawBuffer.toString('utf8');
    
    const spoolName = `spool_${Date.now()}.bin`;
    fs.writeFileSync(path.join(SPOOLS_DIR, spoolName), rawBuffer);
    console.log(`💾 Spool guardado en local: spools/${spoolName}`);

    const privacy = runPrivacyFilter(textContent);
    if (privacy.isSensitive) {
      console.log(`🛡️ ${colors.red}${colors.bright}[FILTRO DE PRIVACIDAD] Documento privado detectado (${privacy.keyword}). RECHAZADO.${colors.reset}`);
      console.log(`   Acción: Redirigiendo directamente a la física sin registrar datos.`);
      forwardPrintJob(rawBuffer);
      return;
    }

    const sscc = detectSSCC(textContent);
    if (!sscc) {
      console.log(`⚠️ ${colors.yellow}[IGNORAR] No se detectó código SSCC logístico. Redirigiendo a física directamente.${colors.reset}`);
      forwardPrintJob(rawBuffer);
      return;
    }

    console.log(`✅ ${colors.green}Etiqueta logística válida detectada (SSCC: ${sscc}). Procesando...${colors.reset}`);

    let shipment = null;
    if (textContent.includes('^XA')) {
      shipment = parseZpl(textContent, sscc);
    } else {
      shipment = parseTextPdf(textContent, sscc);
    }

    console.log(`📊 ${colors.bright}Datos Extraídos del Spool:${colors.reset}`);
    console.log(`   Destinatario: ${colors.green}${shipment.destinationName}${colors.reset}`);
    console.log(`   Dirección:    ${shipment.destinationAddress} (${shipment.destinationCity})`);
    console.log(`   Bultos:       ${shipment.packages}`);

    uploadToSupabase(shipment);
    forwardPrintJob(rawBuffer);
  });

  socket.on('error', (err) => {
    console.error(`${colors.red}❌ Error en la conexión socket: ${err.message}${colors.reset}`);
  });
});

server.listen(config.localPort, () => {
  console.log(`\n===============================================================`);
  console.log(`🚀 ${colors.green}${colors.bright}AGENTE IMPRESORA VIRTUAL SUM LOGÍSTICA INICIADO${colors.reset}`);
  console.log(`   • Escuchando en: ${colors.bright}127.0.0.1:${config.localPort}${colors.reset}`);
  console.log(`   • Filtro de Privacidad: ${colors.green}ACTIVADO${colors.reset}`);
  console.log(`===============================================================\n`);
});
