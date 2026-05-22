const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER CONSOLE ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('BROWSER PAGE ERROR:', error.message);
  });

  page.on('requestfailed', request => {
    console.log('NETWORK ERROR:', request.url(), request.failure().errorText);
  });

  console.log('Navegando a http://localhost:5173...');
  
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 });
    console.log('Página cargada correctamente. Si no hay logs de BROWSER CONSOLE ERROR, la página funciona.');
  } catch (err) {
    if (err.message.includes('ERR_CONNECTION_REFUSED')) {
      console.log('Error: Vite server is not running on port 5173. Probando 3000...');
      try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });
      } catch (e2) {
        console.log('No server found.');
      }
    } else {
      console.log('Navegación fallida:', err.message);
    }
  }

  await browser.close();
})();
