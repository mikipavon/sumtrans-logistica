/**
 * test_agent.js
 * 
 * Envía dos trabajos de impresión simulados al puerto TCP 9100 local:
 * 1. Una nómina confidencial (para probar el bloqueo de privacidad).
 * 2. Una etiqueta ZPL real (para probar el registro automático de albaranes).
 */

const net = require('net');

function sendPrintJob(data, labelName) {
  return new Promise((resolve) => {
    console.log(`\n[Test] Enviando "${labelName}" al puerto 9100...`);
    const client = new net.Socket();
    client.connect(9100, '127.0.0.1', () => {
      client.write(data);
      client.end();
    });

    client.on('end', () => {
      console.log(`[Test] "${labelName}" enviado.`);
      resolve();
    });

    client.on('error', (err) => {
      console.error(`[Test] Error de conexión: ${err.message}`);
      resolve();
    });
  });
}

const NOMINA_JOB = `
===============================================================
                  NOMINA MENSUAL - MAYO 2026
===============================================================
EMPRESA: SUM TRANS LOGISTICA S.L.
TRABAJADOR: PEPE FLORES MARTINEZ
SALARIO BASE: 1.600,00 €
IRPF RETENCION: 15%
LIQUIDO A PERCIBIR: 1.360,00 €
===============================================================
`;

const ETIQUETA_ZPL = `
^XA
^FO50,50^A0N,20,20^FDREMITENTE: PROSERVICE SPAIN S.L.^FS
^FO50,140^A0N,26,26^FD✦ DESTINATARIO^FS
^FO50,180^A0N,36,36^FDJIMENEZ MOTORSPORT^FS
^FO50,230^A0N,28,28^FDPol. Ind. Los Bermejales^FS
^FO50,270^A0N,28,28^FD14812 Almedinilla (Cordoba)^FS
^FO50,320^A0N,24,24^FDBULTOS: 3^FS
^FO100,430^BCN,100,Y,N,N^FD(00)202280000000888999^FS
^XZ
`;

async function run() {
  // Enviar nómina primero (esperar bloqueo)
  await sendPrintJob(NOMINA_JOB, "Nomina Confidencial (Bloqueo esperado)");
  
  // Enviar etiqueta ZPL válida
  await sendPrintJob(ETIQUETA_ZPL, "Etiqueta ZPL Logistica (Sincronización esperada)");
}

// Retardo inicial para dar tiempo al servidor a levantar
setTimeout(run, 1500);
