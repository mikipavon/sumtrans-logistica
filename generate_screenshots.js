import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateScreenshots() {
    console.log("Iniciando Puppeteer para generar justificantes reales...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    // A4 size in pixels roughly at 96 DPI
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 2 }); 

    const outputDir = path.join(__dirname, 'PRUEBA_ESCANER_REEMBOLSOS');

    // Screenshot TR-105
    const url105 = `file:///${path.join(__dirname, 'realistic_receipt_105.html').replace(/\\/g, '/')}`;
    console.log(`Abriendo: ${url105}`);
    await page.goto(url105, { waitUntil: 'networkidle0' });
    await page.waitForFunction('document.title === "READY"');
    const out105 = path.join(outputDir, 'escaner_REAL_TR-105.png');
    await page.screenshot({ path: out105 });
    console.log(`✅ Guardado: ${out105}`);

    // Screenshot TR-5
    const url5 = `file:///${path.join(__dirname, 'realistic_receipt_5.html').replace(/\\/g, '/')}`;
    console.log(`Abriendo: ${url5}`);
    await page.goto(url5, { waitUntil: 'networkidle0' });
    await page.waitForFunction('document.title === "READY"');
    const out5 = path.join(outputDir, 'escaner_REAL_TR-5.png');
    await page.screenshot({ path: out5 });
    console.log(`✅ Guardado: ${out5}`);

    await browser.close();
    console.log("Completado.");
}

generateScreenshots().catch(console.error);
