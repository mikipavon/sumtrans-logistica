// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { prepararEnvioConPdf } from './enviarFacturaSimplificada';
import { datosDeFacturaSimplificada, mensajeDeFacturaSimplificada } from './facturaSimplificada';
import { facturaSimplificadaPdf } from './facturaSimplificadaPdf';

const HAB595 = datosDeFacturaSimplificada({
    id: 'HAB-595',
    date: '24 sept 2026',
    destinationName: 'MARIA RUIZ Fitotarro',
    destinationAddress: 'Calle San pablo 2',
    destinationCity: 'Priego de Córdoba',
    destinationZip: '14800',
    destinationPhone: '655952764',
    articles: [{ name: 'BLT_1', quantity: 1, price: 7 }],
    totalConIva: '43.56',
});

const ENLACE = 'https://x.supabase.co/storage/v1/object/public/facturas_simplificadas/FS-HAB-595_abc.pdf';

// Una ventana como la de la factura: recuadro de aviso, botón, y la navegación
// apuntada en vez de hecha. Un ordenador: abrirWhatsApp tira del wa.me.
const ventanaDePrueba = () => {
    const dom = new JSDOM('<div id="wa-aviso"></div><button id="wa-boton"></button>', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });
    const ventana = {
        document: dom.window.document,
        navigator: dom.window.navigator,
        location: { assign: vi.fn() },
    };
    return ventana;
};

const textoDe = (url) => decodeURIComponent(url.split('text=')[1]);

describe('prepararEnvioConPdf', () => {
    it('sube el PDF y manda al móvil el mensaje con el enlace', async () => {
        const ventana = ventanaDePrueba();
        const subir = vi.fn().mockResolvedValue(ENLACE);
        const generarPdf = vi.fn().mockResolvedValue(new Blob(['%PDF']));
        const enviar = prepararEnvioConPdf(HAB595, ventana, { generarPdf, subir });

        await enviar('34655952764');

        expect(subir).toHaveBeenCalledWith(expect.any(Blob), 'HAB-595');
        const url = ventana.location.assign.mock.calls[0][0];
        expect(url.startsWith('https://wa.me/34655952764?text=')).toBe(true);
        expect(textoDe(url)).toContain(ENLACE);
        expect(textoDe(url)).toContain('TOTAL: 43.56€');
    });

    it('mandarla otra vez no vuelve a subir el PDF', async () => {
        const ventana = ventanaDePrueba();
        const subir = vi.fn().mockResolvedValue(ENLACE);
        const enviar = prepararEnvioConPdf(HAB595, ventana, { generarPdf: async () => new Blob(), subir });

        await enviar('34655952764');
        await enviar('34612345678');

        expect(subir).toHaveBeenCalledTimes(1);
        expect(ventana.location.assign.mock.calls[1][0]).toContain('wa.me/34612345678');
    });

    it('si el PDF no sube, no manda nada: avisa y la segunda pulsación va sólo en texto', async () => {
        const ventana = ventanaDePrueba();
        const subir = vi.fn().mockRejectedValue(new Error("El contenedor 'facturas_simplificadas' no existe."));
        const enviar = prepararEnvioConPdf(HAB595, ventana, { generarPdf: async () => new Blob(), subir });

        await enviar('34655952764');
        expect(ventana.location.assign).not.toHaveBeenCalled();
        expect(ventana.document.getElementById('wa-aviso').textContent).toMatch(/no existe.*otra vez/s);
        expect(ventana.document.getElementById('wa-boton').disabled).toBe(false);

        await enviar('34655952764');
        const url = ventana.location.assign.mock.calls[0][0];
        expect(textoDe(url)).toBe(mensajeDeFacturaSimplificada(HAB595));
        expect(subir).toHaveBeenCalledTimes(1);
    });

    it('dos toques seguidos mientras sube no hacen dos envíos', async () => {
        const ventana = ventanaDePrueba();
        let soltar;
        const subir = vi.fn(() => new Promise(r => { soltar = r; }));
        const enviar = prepararEnvioConPdf(HAB595, ventana, { generarPdf: async () => new Blob(), subir });

        const primero = enviar('34655952764');
        await Promise.resolve();
        expect(await enviar('34655952764')).toBeNull();
        await vi.waitFor(() => expect(soltar).toBeTypeOf('function'));
        soltar(ENLACE);
        await primero;

        expect(subir).toHaveBeenCalledTimes(1);
        expect(ventana.location.assign).toHaveBeenCalledTimes(1);
    });
});

describe('facturaSimplificadaPdf', () => {
    it('es un PDF de una página con los importes buenos', async () => {
        const blob = facturaSimplificadaPdf(HAB595);
        expect(blob.type).toBe('application/pdf');
        const texto = Buffer.from(await blob.arrayBuffer()).toString('latin1');
        expect(texto.startsWith('%PDF')).toBe(true);
        expect(texto.match(/\/Type \/Page\b/g)).toHaveLength(1);
        expect(texto).toContain('43.56');
        expect(texto).toContain('36.00');
        expect(texto).toContain('7.56');
        expect(texto).not.toContain('52.71');
    });
});
