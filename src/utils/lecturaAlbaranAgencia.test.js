import { describe, it, expect } from 'vitest';
import { interpretarAlbaran, repartirEnColumnas, inclinacionDeLineas } from './lecturaAlbaranAgencia';

// Columnas tal y como quedan tras repartir el OCR de un albarán TXT real
// (foto hecha en la furgoneta, la hoja va repetida dos veces más el aviso de paso).
const TXT_IZQUIERDA = `TXT
Fecha Salida: 02/09/2026
Referencias: PV108683655 /
Servicio: PAQUETERIA Oro
Origen: BCN SUR
Avda. Garrigues 5-7, P.I. Mas Blau II
08820-PRAT DE LLOBREGAT, EL
NIF: B79917191 Tlf: 936593776
SALVADOR ESCODA
TIPO DE PORTES: P. Pagados TOTAL
ECO
Reembolsos
Desembolso
Portes
Seguro
Reexpedición
T.C.
Gastos reembolso
DUA y T3
Base imponible
IVA
Total
TXT
Fecha Salida: 02/09/2026
Referencias: PV108683655 /
Origen: BCN SUR
SALVADOR ESCODA`;

const TXT_DERECHA = `0080033400010868365526
EXPEDICIÓN
0334-000108683655
Destino: CORDOBA
CTRA. PALMA DEL RIO, KM.4 MOD. 3 Y 4 NAVE L5 AREA LOGISTICA DE
14005-CORDOBA
NIF: B79917191 Tlf: 957429546
INTARCON S.L
KEYTER INTARCON CRTA A-3132 LUCENA CORDO
14900-LUCENA
Zona: 06
RECIBÍ, (Sello, Firma y D.N.I.)
BULTOS 9
CONTENIDO 9
KILOS 27,00
VOLUMEN M3 0,243
EXPEDICIÓN
0334-000108683655
Destino: CORDOBA
INTARCON S.L
14900-LUCENA`;

const TXT_TODO = `TXT 0080033400010868365526
Fecha Salida: 02/09/2026 EXPEDICIÓN
0334-000108683655
Referencias: PV108683655 /
Servicio: PAQUETERIA Oro
Origen: BCN SUR Destino: CORDOBA
Avda. Garrigues 5-7, P.I. Mas Blau II CTRA. PALMA DEL RIO, KM.4 MOD. 3 Y 4 NAVE L5 AREA LOGISTICA DE
08820-PRAT DE LLOBREGAT, EL 14005-CORDOBA
NIF: B79917191 Tlf: 936593776 NIF: B79917191 Tlf: 957429546
SALVADOR ESCODA INTARCON S.L
KEYTER INTARCON CRTA A-3132 LUCENA CORDO
14900-LUCENA
Zona: 06
TIPO DE PORTES: P. Pagados TOTAL RECIBÍ, (Sello, Firma y D.N.I.)
ECO BULTOS 9
Reembolsos CONTENIDO 9
Desembolso KILOS 27,00
Portes VOLUMEN M3 0,243
Seguro`;

describe('interpretarAlbaran con un albarán TXT', () => {
    const r = interpretarAlbaran({ izquierda: TXT_IZQUIERDA, derecha: TXT_DERECHA, todo: TXT_TODO });

    it('saca la expedición de la agencia como referencia', () => {
        expect(r.expedicion).toBe('0334-000108683655');
    });

    it('el remitente es quien entrega, no la delegación de la agencia', () => {
        expect(r.remitente).toBe('SALVADOR ESCODA');
    });

    it('el destinatario es el consignatario final, no la nave de la agencia en Córdoba', () => {
        expect(r.destinatario).toBe('INTARCON S.L');
        expect(r.direccion).toBe('KEYTER INTARCON CRTA A-3132 LUCENA CORDO');
        expect(r.cp).toBe('14900');
        expect(r.poblacion).toBe('LUCENA');
    });

    it('lee bultos, kilos y tipo de portes', () => {
        expect(r.bultos).toBe(9);
        expect(r.kilos).toBe(27);
        expect(r.porte).toBe('Pagado');
    });

    it('no inventa un reembolso porque la hoja lleve la casilla "Reembolsos" vacía', () => {
        expect(r.reembolso).toBe(0);
    });

    it('no confunde el teléfono de la agencia con el del destinatario', () => {
        expect(r.telefono).toBe('');
    });
});

describe('interpretarAlbaran con variantes', () => {
    it('acepta portes debidos y el CP detrás de la población', () => {
        const r = interpretarAlbaran({
            izquierda: 'Remitente: FERRETERIA LOPEZ\nTIPO DE PORTES: Debidos',
            derecha: 'Destinatario\nTALLERES GARCIA S.L.\nC/ Mayor 12\nTlf: 657112233\nMONTILLA 14550\nBULTOS 2',
            todo: 'Remitente: FERRETERIA LOPEZ Destinatario\nTALLERES GARCIA S.L.\nC/ Mayor 12\nTIPO DE PORTES: Debidos\nBULTOS 2\nReembolso: 125,40 €',
        });
        expect(r.remitente).toBe('FERRETERIA LOPEZ');
        expect(r.destinatario).toBe('TALLERES GARCIA S.L.');
        expect(r.direccion).toBe('C/ Mayor 12');
        expect(r.telefono).toBe('657112233');
        expect(r.cp).toBe('14550');
        expect(r.poblacion).toBe('MONTILLA');
        expect(r.porte).toBe('Debido');
        expect(r.bultos).toBe(2);
        expect(r.reembolso).toBe(125.4);
    });

    it('encuentra la expedición aunque el OCR meta la fecha entre la etiqueta y el número', () => {
        const texto = 'TXT , EXPEDICIÓN\nFecha Salida: 02/09/2026\n0334-000108683655\nReferencias: PV 108683655 /';
        expect(interpretarAlbaran(texto).expedicion).toBe('0334-000108683655');
    });

    it('con un texto que no tiene nada reconocible devuelve los campos vacíos sin fallar', () => {
        const r = interpretarAlbaran('hoja en blanco');
        expect(r.destinatario).toBe('');
        expect(r.bultos).toBeNull();
        expect(r.porte).toBe('');
        expect(r.reembolso).toBe(0);
    });
});

// Albarán TSB real: remitente y consignatario van uno debajo del otro en la
// misma columna, con rótulo, y los datos en casillas a la derecha. Se simula
// la salida del OCR con palabras y cajas (hoja apaisada de 1600 px de ancho).
function filaOcr(y, ...celdas) {
    const words = [];
    for (const [texto, x0] of celdas) {
        let x = x0;
        for (const palabra of texto.split(' ')) {
            const ancho = palabra.length * 12;
            words.push({ text: palabra, bbox: { x0: x, x1: x + ancho, y0: y, y1: y + 22 } });
            x += ancho + 8;
        }
    }
    return { bbox: { y0: y }, words };
}

const TSB_LINEAS = [
    filaOcr(60, ['NUTRACOR S.A. RESADORES PARCELA 13 (POL. IND. TORRECILLA)', 700]),
    filaOcr(120, ['Origen', 40], ['Destino', 560], ['Zona', 900]),
    filaOcr(160, ['018-GRANADA', 40], ['014-CORDOBA', 560], ['84-CORDOBA', 900]),
    filaOcr(210, ['Remitente', 40], ['Fecha EA:', 820], ['Nº Exped./Fact.', 1150], ['Fecha', 1400]),
    filaOcr(250, ['PRODUCTOS RU-CA,S.L.', 40], ['Ref. 456', 820], ['99991833849', 1150], ['02/09/26', 1400]),
    filaOcr(290, ['P.I. ASEGRA', 40], ['Cod. 01801950-01', 820]),
    filaOcr(330, ['18210 PELIGROS', 40], ['NIF. B18003772', 820]),
    filaOcr(380, ['Consignatari', 40], ['Ped.', 820], ['Dep.', 1000], ['5 bultos', 1150], ['Volumen', 1350], ['Kilos', 1480]),
    filaOcr(420, ['ALFONSO BLANCO RUIZ', 40], ['Cod. 99999999-14', 820], ['0', 1350], ['36', 1480]),
    filaOcr(460, ['C FERNAN NUÑEZ 3', 40], ['Telf. 636709783', 820], ['Porte', 1150], ['(PAGADOS)', 1350]),
    filaOcr(500, ['14548 MONTALBAN DE CORDOBA', 40]),
    filaOcr(560, ['Observaciones', 40]),
    filaOcr(600, ['LLAMAR ANTES', 40]),
    filaOcr(700, ['Recibí', 40], ['Nombre', 300], ['DNI.', 300], ['Fecha', 300]),
];

describe('interpretarAlbaran con un albarán TSB (lectura por etiquetas)', () => {
    const r = interpretarAlbaran(repartirEnColumnas(TSB_LINEAS, 1600));

    it('el remitente es lo que cuelga del rótulo "Remitente", sin la casilla de al lado', () => {
        expect(r.remitente).toBe('PRODUCTOS RU-CA,S.L.');
    });

    it('el destinatario cuelga de "Consignatari" hasta la línea del CP', () => {
        expect(r.destinatario).toBe('ALFONSO BLANCO RUIZ');
        expect(r.direccion).toBe('C FERNAN NUÑEZ 3');
        expect(r.cp).toBe('14548');
        expect(r.poblacion).toBe('MONTALBAN DE CORDOBA');
    });

    it('coge el teléfono que está a la altura del consignatario, no el de la agencia', () => {
        expect(r.telefono).toBe('636709783');
    });

    it('lee bultos, kilos y expedición de sus casillas aunque el valor esté debajo del rótulo', () => {
        expect(r.bultos).toBe(5);
        expect(r.kilos).toBe(36);
        expect(r.expedicion).toBe('99991833849');
    });

    it('entiende "Porte (PAGADOS)"', () => {
        expect(r.porte).toBe('Pagado');
    });
});

// Lo que devolvió el OCR con una foto real de un TSB (17/09/26), ya enderezada:
// el rótulo "Porte" se pierde y del paréntesis sólo queda el de cierre, la casilla
// "Ref." se pega al remitente y del borde de la hoja salen letras sueltas.
const TSB_FOTO_LINEAS = [
    filaOcr(210, ['Remitente', 110], ['Fecha EA:', 620], ['999423323648', 1110], ['17/09/26', 1320]),
    filaOcr(250, ['AKZO NOBEL INDUSTRIAL PAINTS, S.L. — Ref. 6104889491', 100]),
    filaOcr(290, ['PLATAFORMA LOGISTICA DE', 100], ['Cod. 05000162-01', 620]),
    filaOcr(330, ['50197 ZARAGOZA', 100], ['NIF. B08218158', 620], ['PAGADOS)', 1270]),
    filaOcr(380, ['Consignatari', 90], ['Ped. 38510', 620]),
    filaOcr(420, ['E', 30], ['CARPINTERÍA FERAN HERM.ROMERO', 90], ['Dep.', 850]),
    filaOcr(460, ['F', 30], ['C/PINTOR ZURBARÁN, 32.', 90], ['Cod. 99999999-14', 850]),
    filaOcr(500, ['14520 FERNAN NUÑEZ', 80], ['NIF.', 620], ['Telf.', 910]),
    filaOcr(560, ['Observaciones', 70], ['Recibí', 620]),
];

describe('interpretarAlbaran con la lectura de una foto real de TSB', () => {
    const r = interpretarAlbaran(repartirEnColumnas(TSB_FOTO_LINEAS, 1600));

    it('quita del remitente la casilla "Ref." que el OCR le pega', () => {
        expect(r.remitente).toBe('AKZO NOBEL INDUSTRIAL PAINTS, S.L.');
    });

    it('no mete en la dirección las letras sueltas del borde de la hoja', () => {
        expect(r.destinatario).toBe('CARPINTERÍA FERAN HERM.ROMERO');
        expect(r.direccion).toBe('C/PINTOR ZURBARÁN, 32.');
        expect(r.cp).toBe('14520');
        expect(r.poblacion).toBe('FERNAN NUÑEZ');
    });

    it('entiende "PAGADOS" aunque se pierdan el rótulo Porte y el paréntesis', () => {
        expect(r.porte).toBe('Pagado');
    });

    it('no confunde "Pagado" en singular (una nota cualquiera) con el tipo de porte', () => {
        expect(interpretarAlbaran('Consignatario\nPEPE\n14500 PUENTE GENIL\nPagado el 50% por adelantado').porte).toBe('');
    });
});

describe('inclinacionDeLineas', () => {
    const linea = (x0, y0, x1, y1) => ({ baseline: { x0, y0, x1, y1 } });

    it('mide la inclinación con la mediana de las líneas largas', () => {
        // Tres líneas que suben unos 3,4° hacia la derecha y una raya torcida de más.
        const lineas = [linea(100, 400, 800, 358), linea(100, 500, 700, 464), linea(90, 600, 900, 551), linea(0, 0, 1500, 300)];
        expect(inclinacionDeLineas(lineas, 1600)).toBeCloseTo(-3.4, 0);
    });

    it('no cuenta las líneas cortas, que dan ángulos al azar', () => {
        const lineas = [linea(100, 100, 700, 100), linea(100, 200, 800, 200), linea(100, 300, 600, 300), linea(10, 10, 40, 30), linea(50, 50, 70, 80)];
        expect(inclinacionDeLineas(lineas, 1600)).toBe(0);
    });

    it('sin líneas suficientes para medir devuelve 0', () => {
        expect(inclinacionDeLineas([linea(0, 0, 900, 50)], 1600)).toBe(0);
        expect(inclinacionDeLineas([], 1600)).toBe(0);
    });
});

describe('devolver el albarán firmado', () => {
    it('TXT: "DAC" pide devolver la documentación firmada', () => {
        expect(interpretarAlbaran(`TXT
Servicio: PAQUETERIA Oro DAC
Destinatario
PEPE
14500 PUENTE GENIL`).devolverFirmado).toBe(true);
    });

    it('XPO: "devolver albarán firmado"', () => {
        expect(interpretarAlbaran(`XPO LOGISTICS
Observaciones: DEVOLVER ALBARÁN FIRMADO
14900 LUCENA`).devolverFirmado).toBe(true);
    });

    it('la casilla "Recibí (Sello, Firma y D.N.I.)" que llevan todos no cuenta', () => {
        const r = interpretarAlbaran({ izquierda: TXT_IZQUIERDA, derecha: TXT_DERECHA, todo: TXT_TODO });
        expect(r.devolverFirmado).toBe(false);
    });

    it('"dac" dentro de otra palabra o en minúsculas no cuenta', () => {
        expect(interpretarAlbaran('REDACCION DACIA dac').devolverFirmado).toBe(false);
    });
});

describe('repartirEnColumnas', () => {
    it('separa las palabras de cada línea según su posición horizontal', () => {
        const palabra = (text, x0, x1) => ({ text, bbox: { x0, x1, y0: 0, y1: 10 } });
        const lineas = [
            { bbox: { y0: 20 }, words: [palabra('SALVADOR', 10, 90), palabra('ESCODA', 95, 150), palabra('INTARCON', 600, 700), palabra('S.L', 705, 730)] },
            { bbox: { y0: 5 }, words: [palabra('Origen:', 10, 60), palabra('Destino:', 600, 660)] },
            { bbox: { y0: 40 }, words: [palabra('14900-LUCENA', 600, 720)] },
        ];
        const r = repartirEnColumnas(lineas, 1000);
        expect(r.izquierda).toBe('Origen:\nSALVADOR ESCODA');
        expect(r.derecha).toBe('Destino:\nINTARCON S.L\n14900-LUCENA');
        expect(r.todo.split('\n')[1]).toBe('SALVADOR ESCODA INTARCON S.L');
    });
});
