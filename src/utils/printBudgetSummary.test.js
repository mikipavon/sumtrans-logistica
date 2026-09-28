import { describe, it, expect } from 'vitest';
import { htmlDelDetalleDeEnvios } from './printBudgetSummary';

// JUAN ALBA, de Presupuesto, recibe a porte debido de AGROCIRILO y además manda
// lo suyo a porte pagado: la hoja tiene que decir de dónde viene cada envío.
const juanAlba = {
    clientName: 'JUAN ALBA',
    totalAmount: 17,
    shipments: [
        {
            id: 'HAB-264', createdAt: '2026-09-14T09:00:00Z', porteType: 'Debido',
            client: 'AGROCIRILO', originName: 'AGROCIRILO', destinationName: 'JUAN ALBA',
            articles: [{ name: 'BLT_1' }], amount: '7.00',
        },
        {
            id: 'HAB-521', createdAt: '2026-09-22T09:00:00Z', porteType: 'Pagado',
            client: 'JUAN ALBA', originName: 'JUAN ALBA', destinationName: 'TALLERES <LOPEZ> & HIJOS',
            articles: [{ name: 'BLT_1' }], amount: '10.00',
        },
    ],
};

const hoja = () => {
    const doc = new DOMParser().parseFromString(htmlDelDetalleDeEnvios(juanAlba, '2026-09'), 'text/html');
    const filas = Array.from(doc.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')));
    return { doc, filas };
};

describe('htmlDelDetalleDeEnvios', () => {
    it('se titula Detalle de envíos, con el mes y el año', () => {
        const { doc } = hoja();
        expect(doc.querySelector('.header h1').textContent).toBe('Detalle de envíos');
        expect(doc.querySelector('.header p').textContent).toBe('Septiembre de 2026');
        expect(doc.title).toBe('Detalle de envíos - JUAN ALBA - Septiembre de 2026');
    });

    it('no lleva nuestro rótulo ni habla de presupuesto ni de IVA', () => {
        const texto = hoja().doc.body.textContent;
        expect(texto).not.toMatch(/sumtrans/i);
        expect(texto).not.toMatch(/presupuesto/i);
        expect(texto).not.toMatch(/iva/i);
        expect(texto).not.toMatch(/acumulado/i);
    });

    it('bajo el nombre del cliente no va nada más', () => {
        expect(hoja().doc.querySelector('.client-box').textContent.trim()).toBe('JUAN ALBA');
    });

    it('cada fila trae remitente y destinatario', () => {
        const { doc, filas } = hoja();
        const cabeceras = Array.from(doc.querySelectorAll('th')).map(th => th.textContent);
        expect(cabeceras).toEqual(['Nº Albarán', 'Fecha', 'Remitente', 'Destinatario', 'Descripción', 'Importe']);
        expect(filas[0][2].textContent).toBe('AGROCIRILO');
        expect(filas[0][3].textContent).toBe('JUAN ALBA');
    });

    it('a porte debido resalta al destinatario, que es quien paga', () => {
        const { filas } = hoja();
        expect(filas[0][2].className).toBe('');
        expect(filas[0][3].className).toBe('paga');
    });

    it('a porte pagado resalta al remitente', () => {
        const { filas } = hoja();
        expect(filas[1][2].className).toBe('paga');
        expect(filas[1][3].className).toBe('');
    });

    it('un albarán antiguo sin tipo de porte lo paga el remitente', () => {
        const html = htmlDelDetalleDeEnvios({
            clientName: 'JUAN ALBA',
            shipments: [{ id: 'HAB-1', client: 'JUAN ALBA', destinationName: 'OTRO', amount: '5' }],
        }, '2026-09');
        const celdas = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('tbody td');
        expect(celdas[2].textContent).toBe('JUAN ALBA');
        expect(celdas[2].className).toBe('paga');
    });

    it('un nombre con símbolos no rompe la hoja', () => {
        const { filas } = hoja();
        expect(filas[1][3].textContent).toBe('TALLERES <LOPEZ> & HIJOS');
        expect(filas[1]).toHaveLength(6);
    });

    it('los importes y el total no cambian', () => {
        const { doc, filas } = hoja();
        expect(filas[0][5].textContent).toBe('7.00 €');
        expect(filas[1][5].textContent).toBe('10.00 €');
        expect(doc.querySelector('.total-value').textContent).toBe('17.00 €');
    });
});
