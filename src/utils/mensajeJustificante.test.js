import { describe, it, expect, vi } from 'vitest';
import { mensajeDelJustificante, telefonoParaWhatsApp, compartirAlbaranPorWhatsApp } from './mensajeJustificante';

// El caso que lo motivó: HAB-330, EL ARCANGEL MOTOR S.L. → Zuricar de Espejo,
// 7,00 € de porte, y el botón de WhatsApp de Envíos sin hacer nada.
const entrega = (extra = {}) => ({
    id: 'HAB-330',
    type: 'Entrega',
    date: '15/9/2026',
    client: 'EL ARCANGEL MOTOR S.L',
    originName: 'EL ARCANGEL MOTOR S.L',
    originPhone: '957429490',
    destinationName: 'Zuricar de Espejo',
    destinationPhone: '',
    amount: '7.00',
    porteType: 'Pagado',
    billingType: 'Clientes Habituales',
    status: 'Pendiente de asignar',
    ...extra,
});

describe('mensajeDelJustificante', () => {
    it('a un cliente habitual le manda el justificante escueto, con REF y las dos puntas', () => {
        const texto = mensajeDelJustificante(entrega(), []);
        expect(texto.startsWith('*JUSTIFICANTE*\n\n')).toBe(true);
        expect(texto).toContain('*REF:* HAB-330\n');
        expect(texto).toContain('*Fecha:* 15/9/2026\n');
        expect(texto).toContain('*Remitente:* EL ARCANGEL MOTOR S.L\n');
        expect(texto).toContain('*Destinatario:* Zuricar de Espejo\n');
        expect(texto.endsWith('\nGracias por su confianza.')).toBe(true);
        expect(texto).not.toContain('SUMTRANS');
    });

    it('sólo dice DE ENTREGA cuando el paquete está entregado', () => {
        expect(mensajeDelJustificante(entrega({ status: 'Entregado' }), [])).toContain('*JUSTIFICANTE DE ENTREGA*');
        expect(mensajeDelJustificante(entrega(), [])).not.toContain('DE ENTREGA');
    });

    it('en una entrega con porte pagado el destinatario no ve el precio', () => {
        // Paga el remitente; el mensaje va a la parada (el destinatario).
        const texto = mensajeDelJustificante(entrega(), []);
        expect(texto).not.toContain('*Precio:*');
        expect(texto).not.toContain('*Estado:*');
    });

    it('en un porte debido el destinatario sí ve el precio, cerrado y sin IVA por ser serie HAB', () => {
        const texto = mensajeDelJustificante(entrega({ porteType: 'Debido' }), []);
        expect(texto).toContain('*Precio:* 7,00 €\n');
        expect(texto).not.toContain('IVA');
    });

    it('con paga a la fuerza manda el precio aunque la parada no sea quien paga', () => {
        const texto = mensajeDelJustificante(entrega(), [], { paga: true });
        expect(texto).toContain('*Precio:* 7,00 €\n');
    });

    it('un SUM- de un cliente con factura lleva el título de la empresa y el desglose de IVA', () => {
        const texto = mensajeDelJustificante(entrega({
            id: 'SUM-518', billingType: 'Factura', porteType: 'Debido', amount: '10',
        }), []);
        expect(texto.startsWith('*JUSTIFICANTE SUMTRANS LOGISTICA*')).toBe(true);
        expect(texto).toContain('*Precio:* 10,00 € + IVA = *12,10 €*');
    });

    it('el tipo de cobro sale de la ficha del remitente cuando el albarán no lo trae', () => {
        const fichas = [{ id: 1, name: 'El Arcángel Motor, S.L.', legalName: 'EL ARCANGEL MOTOR S.L', billingType: 'Clientes Habituales' }];
        const texto = mensajeDelJustificante(entrega({ billingType: '' }), fichas);
        expect(texto.startsWith('*JUSTIFICANTE*')).toBe(true);
    });

    it('el destinatario sale con el nombre de nuestra ficha si el envío está enlazado', () => {
        const fichas = [{ id: 7, name: 'ZURICAR (preguntar por Juan)', billingType: 'Factura' }];
        const texto = mensajeDelJustificante(entrega({ destinatarioId: 7 }), fichas);
        expect(texto).toContain('*Destinatario:* ZURICAR (preguntar por Juan)\n');
    });
});

describe('telefonoParaWhatsApp', () => {
    it('pone el 34 a un móvil español y limpia espacios y el más', () => {
        expect(telefonoParaWhatsApp('600 11 22 33')).toBe('34600112233');
        expect(telefonoParaWhatsApp('+34 600112233')).toBe('34600112233');
        expect(telefonoParaWhatsApp('')).toBe('');
    });
});

describe('compartirAlbaranPorWhatsApp', () => {
    const ventana = () => ({ open: vi.fn() });

    it('abre wa.me en otra pestaña con el móvil elegido y el texto del justificante', () => {
        const w = ventana();
        const r = compartirAlbaranPorWhatsApp(entrega(), [], { telefono: '600 11 22 33', ventana: w });
        expect(w.open).toHaveBeenCalledTimes(1);
        const [url, destino] = w.open.mock.calls[0];
        expect(destino).toBe('_blank');
        expect(url.startsWith('https://wa.me/34600112233?text=')).toBe(true);
        expect(decodeURIComponent(url.split('?text=')[1])).toBe(r.mensaje);
        expect(r.mensaje).toContain('*REF:* HAB-330');
    });

    it('paga decide si el mensaje lleva importes, igual que en el repartidor', () => {
        const conImportes = compartirAlbaranPorWhatsApp(entrega(), [], { telefono: '600112233', paga: true, ventana: ventana() });
        expect(conImportes.mensaje).toContain('*Precio:* 7,00 €');
        const sinImportes = compartirAlbaranPorWhatsApp(entrega(), [], { telefono: '600112233', paga: false, ventana: ventana() });
        expect(sinImportes.mensaje).not.toContain('*Precio:*');
    });

    it('sin número abre el chat sin destinatario para elegir el contacto a mano', () => {
        const w = ventana();
        compartirAlbaranPorWhatsApp(entrega(), [], { ventana: w });
        expect(w.open.mock.calls[0][0].startsWith('https://wa.me/?text=')).toBe(true);
    });

    it('sin albarán no abre nada', () => {
        const w = ventana();
        expect(compartirAlbaranPorWhatsApp(null, [], { ventana: w })).toBeNull();
        expect(w.open).not.toHaveBeenCalled();
    });
});
