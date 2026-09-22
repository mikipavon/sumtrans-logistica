import { describe, it, expect } from 'vitest';
import {
    enviosDelManifiesto,
    filasDelManifiesto,
    totalesDelManifiesto,
    crearDocumentoDeManifiesto,
    COLUMNAS_DEL_MANIFIESTO,
    logoDelCliente,
    logoParaPdf,
    cargarLogosDelManifiesto,
} from './manifiestoDeCarga';

// El manifiesto es lo que el cliente le da a firmar al conductor: lo que MANDA
// hoy, sin importes de ninguna clase.
const ESMEBRA = { id: 42, name: 'ESMEBRA', cif: 'B12345678', address: 'C/ Real 1', zip: '14940', city: 'Cabra', phone: '957000000' };
const hoy = new Date(2026, 8, 22, 17, 30);

const deHoy = {
    id: 'SUM-520', clientId: 42, client: 'ESMEBRA', originName: 'ESMEBRA',
    destinationName: 'FERRETERIA PEPE', destinationAddress: 'Avda. Mijas 9-11', destinationZip: '29649', destinationCity: 'Mijas',
    packages: 3, weightKg: 21, clientReference: 'PED-77', observations: 'Frágil',
    porteType: 'Pagado', amount: '18.50', codAmount: '143.97',
    status: 'Pendiente de asignar', createdAt: '2026-09-22T09:00:00.000Z',
};
const deHoyTambien = {
    id: 'SUM-518', clientId: 42, client: 'ESMEBRA', originName: 'ESMEBRA',
    destinationName: 'CAMPOS BEGINES', destinationCity: 'Los Palacios', packages: 1, weightKg: 2.5,
    status: 'En reparto', createdAt: '2026-09-22T12:00:00.000Z',
};
const deAyer = {
    id: 'SUM-510', clientId: 42, client: 'ESMEBRA', originName: 'ESMEBRA',
    destinationName: 'ROSAL MOVEL', destinationCity: 'Cañada Rosal', packages: 2,
    status: 'Entregado', createdAt: '2026-09-21T09:00:00.000Z',
};
const anulado = {
    id: 'SUM-521', clientId: 42, client: 'ESMEBRA', originName: 'ESMEBRA',
    destinationName: 'NADIE', destinationCity: 'Lucena', packages: 1,
    status: 'Anulado', createdAt: '2026-09-22T10:00:00.000Z',
};
const recibido = {
    id: 'SUM-522', client: 'ALMACENES RUIZ', originName: 'ALMACENES RUIZ',
    destinationName: 'Esmebra', destinationCity: 'Cabra', packages: 4,
    status: 'Pendiente de asignar', createdAt: '2026-09-22T11:00:00.000Z',
};
const todos = [deAyer, deHoy, anulado, recibido, deHoyTambien];

describe('enviosDelManifiesto', () => {
    it('sin filtro de fechas coge sólo lo de hoy que manda el cliente, sin anulados ni recibidos, por número', () => {
        const ids = enviosDelManifiesto(todos, ESMEBRA, { hoy }).map(s => s.id);
        expect(ids).toEqual(['SUM-518', 'SUM-520']);
    });

    it('con filtro de fechas puesto respeta lo que hay en pantalla (el filtro ya lo hizo el portal)', () => {
        const ids = enviosDelManifiesto(todos, ESMEBRA, { hoy, hayFiltroDeFechas: true }).map(s => s.id);
        expect(ids).toEqual(['SUM-510', 'SUM-518', 'SUM-520']);
    });

    it('no revienta sin lista ni ficha', () => {
        expect(enviosDelManifiesto(undefined, ESMEBRA)).toEqual([]);
        expect(enviosDelManifiesto(todos, null)).toEqual([]);
    });
});

describe('filasDelManifiesto', () => {
    it('saca destinatario, dirección, población, bultos, kilos, referencia y observaciones', () => {
        const [fila] = filasDelManifiesto([deHoy]);
        expect(fila).toEqual(['SUM-520', 'FERRETERIA PEPE', 'Avda. Mijas 9-11', '29649 Mijas', '3', '21', 'PED-77', 'Frágil']);
        expect(fila).toHaveLength(COLUMNAS_DEL_MANIFIESTO.length);
    });

    it('nunca lleva importes: ni el porte ni el reembolso', () => {
        const texto = filasDelManifiesto([deHoy]).flat().join('|');
        expect(texto).not.toContain('18.50');
        expect(texto).not.toContain('143.97');
        expect(COLUMNAS_DEL_MANIFIESTO.join('|').toLowerCase()).not.toMatch(/importe|porte|reembolso|€/);
    });

    it('deja los kilos en blanco cuando no los hay y usa la coma decimal', () => {
        expect(filasDelManifiesto([deAyer])[0][5]).toBe('');
        expect(filasDelManifiesto([deHoyTambien])[0][5]).toBe('2,5');
    });
});

describe('totalesDelManifiesto', () => {
    it('suma envíos, bultos y kilos', () => {
        expect(totalesDelManifiesto([deHoy, deHoyTambien, deAyer])).toEqual({ envios: 3, bultos: 6, kilos: 23.5 });
        expect(totalesDelManifiesto([])).toEqual({ envios: 0, bultos: 0, kilos: 0 });
    });
});

describe('crearDocumentoDeManifiesto', () => {
    it('monta el PDF apaisado con la tabla y los totales en una hoja', () => {
        const { doc, filas, totales, fechaStr } = crearDocumentoDeManifiesto({ client: ESMEBRA, envios: [deHoy, deHoyTambien], fecha: hoy });
        expect(fechaStr).toBe('22/09/2026');
        expect(filas).toHaveLength(2);
        expect(totales).toEqual({ envios: 2, bultos: 4, kilos: 23.5 });
        expect(doc.lastAutoTable).toBeTruthy();
        expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
        expect(doc.internal.getNumberOfPages()).toBe(1);
    });

    it('con muchos envíos pasa a otra hoja', () => {
        const muchos = Array.from({ length: 40 }, (_, i) => ({ ...deHoy, id: `SUM-${600 + i}` }));
        const { doc } = crearDocumentoDeManifiesto({ client: ESMEBRA, envios: muchos, fecha: hoy });
        expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
    });

    it('con los logos cargados los pega en la cabecera y la tabla baja para dejarles sitio', () => {
        // PNG de 1x1 válido. Lo que importa es que jsPDF lo acepte y el resto se recoloque.
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const logos = { sum: { dataUrl: png, ancho: 300, alto: 100 }, cliente: { dataUrl: png, ancho: 200, alto: 200 } };
        const sinLogos = crearDocumentoDeManifiesto({ client: ESMEBRA, envios: [deHoy], fecha: hoy });
        const conLogos = crearDocumentoDeManifiesto({ client: ESMEBRA, envios: [deHoy], fecha: hoy, logos });
        expect(conLogos.doc.lastAutoTable.finalY).toBeGreaterThan(sinLogos.doc.lastAutoTable.finalY);
        expect(conLogos.doc.internal.getNumberOfPages()).toBe(1);
    });
});

describe('logos', () => {
    it('el logo del cliente es el de su agencia y si no el que subió él', () => {
        expect(logoDelCliente({ agencyLogoUrl: 'https://x/agencia.png', customLogo: 'data:image/png;base64,AAA' })).toBe('https://x/agencia.png');
        expect(logoDelCliente({ customLogo: 'data:image/png;base64,AAA' })).toBe('data:image/png;base64,AAA');
        expect(logoDelCliente({})).toBeNull();
    });

    it('sin logo, o si el logo no llega a tiempo, devuelve null en vez de reventar o colgarse', async () => {
        // jsdom tiene Image pero no carga nada: ni onload ni onerror. Es el caso del
        // almacén que no contesta, y lo que salva es el plazo máximo.
        await expect(logoParaPdf(null)).resolves.toBeNull();
        await expect(logoParaPdf('/no-existe.svg', { esperaMax: 30 })).resolves.toBeNull();
        await expect(cargarLogosDelManifiesto(ESMEBRA, { esperaMax: 30 })).resolves.toEqual({ sum: null, cliente: null });
    });
});
