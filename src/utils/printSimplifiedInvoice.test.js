// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { printSimplifiedInvoice } from './printSimplifiedInvoice';

// Lo que printSimplifiedInvoice escribe en la ventana nueva, cargado en un
// documento de verdad para poder pulsar el botón de WhatsApp.
const abrirFactura = (datos) => {
    let html = '';
    const falsa = { document: { write: (h) => { html += h; }, close: () => {} } };
    const open = vi.spyOn(window, 'open').mockReturnValue(falsa);
    printSimplifiedInvoice(datos);
    open.mockRestore();
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    dom.window.open = vi.fn();
    return { html, win: dom.window };
};

const HAB595 = {
    id: 'HAB-595',
    date: '24 sept 2026',
    client: 'Ajos palacios',
    destinationName: 'MARIA RUIZ Fitotarro',
    destinationAddress: 'Calle San pablo 2',
    destinationCity: 'Priego de Córdoba',
    destinationZip: '14800',
    destinationPhone: '655952764',
    amount: '36',
    articles: [{ name: 'BLT_1', quantity: 1, price: 7 }],
};

afterEach(() => vi.restoreAllMocks());

describe('printSimplifiedInvoice', () => {
    it('con lo cobrado con IVA no le vuelve a sumar el 21% (HAB-595)', () => {
        const { html } = abrirFactura({ ...HAB595, totalConIva: '43.56' });
        expect(html).toContain('36.00 €');
        expect(html).toContain('7.56 €');
        expect(html).toContain('43.56 €');
        expect(html).not.toContain('52.71');
    });

    it('si las líneas no suman la base, el importe va en la línea de transporte', () => {
        const { html } = abrirFactura({ ...HAB595, totalConIva: '43.56' });
        expect(html).not.toContain('7.00 €');
        expect(html).toMatch(/SERV\. TRANSPORTE<\/td><td[^>]*>36\.00 €/);
    });

    it('si cuadran, cada línea lleva su importe', () => {
        const { html } = abrirFactura({ ...HAB595, amount: 14, articles: [{ name: 'BLT_1', quantity: 2, price: 7 }] });
        expect(html).toContain('2x BLT_1');
        expect(html).toContain('14.00 €');
        expect(html).not.toContain('SERV. TRANSPORTE');
    });

    it('el WhatsApp va directo al móvil del destinatario', () => {
        const { win } = abrirFactura({ ...HAB595, totalConIva: '43.56' });
        expect(win.document.getElementById('wa-tel').value).toBe('34655952764');
        win.enviarPorWhatsApp();
        const url = win.open.mock.calls[0][0];
        expect(url.startsWith('https://wa.me/34655952764?text=')).toBe(true);
        expect(decodeURIComponent(url.split('text=')[1])).toContain('TOTAL: 43.56€');
    });

    it('sin teléfono no abre un chat vacío: pide el móvil y usa el que se teclea', () => {
        const { win } = abrirFactura({ ...HAB595, destinationPhone: '', totalConIva: '43.56' });
        const campo = win.document.getElementById('wa-tel');
        expect(campo.value).toBe('');
        win.enviarPorWhatsApp();
        expect(win.open).not.toHaveBeenCalled();
        expect(win.document.getElementById('wa-aviso').textContent).toMatch(/móvil/);

        campo.value = '612 34 56 78';
        win.enviarPorWhatsApp();
        expect(win.open.mock.calls[0][0].startsWith('https://wa.me/34612345678?text=')).toBe(true);
    });

    it('un fijo no se ofrece ni se acepta', () => {
        const { win } = abrirFactura({ ...HAB595, destinationPhone: '957 54 12 34', totalConIva: '43.56' });
        const campo = win.document.getElementById('wa-tel');
        expect(campo.value).toBe('');
        campo.value = '957541234';
        win.enviarPorWhatsApp();
        expect(win.open).not.toHaveBeenCalled();
        expect(win.document.getElementById('wa-aviso').textContent).toMatch(/fijo/);
    });

    it("un nombre con apóstrofo no rompe el botón", () => {
        const { win } = abrirFactura({ ...HAB595, destinationName: "Bar L'Esquina", totalConIva: '43.56' });
        win.enviarPorWhatsApp();
        expect(win.open).toHaveBeenCalledTimes(1);
    });
});
