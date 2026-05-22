import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateScreenshot() {
    console.log("Iniciando Puppeteer para generar el justificante falso TR-9999...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 2 }); 

    const outputDir = path.join(__dirname, 'PRUEBA_ESCANER_REEMBOLSOS');

    const url9999 = `file:///${path.join(__dirname, 'realistic_receipt_9999.html').replace(/\\/g, '/')}`;
    console.log(`Abriendo: ${url9999}`);
    await page.goto(url9999, { waitUntil: 'networkidle0' });
    await page.waitForFunction('document.title === "READY"');
    const out9999 = path.join(outputDir, 'escaner_REAL_TR-9999.png');
    await page.screenshot({ path: out9999 });
    console.log(`✅ Guardado: ${out9999}`);

    await browser.close();
    console.log("Completado.");
}

generateScreenshot().catch(console.error);
