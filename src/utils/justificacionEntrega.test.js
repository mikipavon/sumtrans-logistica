import { describe, it, expect } from 'vitest';
import {
    exigeJustificacionLegal,
    nombreCompletoValido,
    documentoIdentidadValido,
    firmaTieneTrazo,
    fallosDeJustificacion,
} from './justificacionEntrega';

/** Trazo de firma de mentira: una línea quebrada con puntos suficientes. */
const trazoDeFirma = ({ ancho = 120, alto = 40, puntos = 30 } = {}) => [
    Array.from({ length: puntos }, (_, i) => ({
        x: (ancho * i) / (puntos - 1),
        y: i % 2 === 0 ? 0 : alto,
    })),
];

describe('exigeJustificacionLegal', () => {
    const lekue = { id: 10, name: 'INDUSTRIAS LEKUE', requireLegalProof: true };
    const otro = { id: 11, name: 'FERRETERIA PEPE' };

    it('aprieta cuando el cliente que lo manda lo exige', () => {
        const envio = { client: 'INDUSTRIAS LEKUE', destinationName: 'FERRETERIA PEPE' };
        expect(exigeJustificacionLegal(envio, [lekue, otro])).toBe(true);
    });

    it('aprieta también cuando lo exige el que recibe', () => {
        const envio = { client: 'FERRETERIA PEPE', destinationName: 'INDUSTRIAS LEKUE' };
        expect(exigeJustificacionLegal(envio, [lekue, otro])).toBe(true);
    });

    it('no toca a los albaranes de los demás clientes', () => {
        const envio = { client: 'FERRETERIA PEPE', destinationName: 'BAR MANOLO' };
        expect(exigeJustificacionLegal(envio, [lekue, otro])).toBe(false);
    });

    it('reconoce al cliente aunque la oficina teclee el nombre con tildes o mayúsculas distintas', () => {
        const envio = { client: 'Industrias Lekué', destinationName: 'BAR MANOLO' };
        expect(exigeJustificacionLegal(envio, [lekue])).toBe(true);
    });

    it('vale igual si el albarán es de una sede del cliente', () => {
        const conSede = { ...lekue, branches: [{ id: 99, name: 'LEKUE ALMACEN SUR' }] };
        const envio = { client: 'LEKUE ALMACEN SUR', destinationName: 'BAR MANOLO' };
        expect(exigeJustificacionLegal(envio, [conSede])).toBe(true);
    });

    it('mira la ficha viva, no las reglas congeladas del albarán', () => {
        // El albarán se creó cuando el cliente aún no lo exigía: lleva la copia
        // antigua encima y aun así tiene que apretar.
        const envio = {
            client: 'INDUSTRIAS LEKUE',
            deliveryRules: { requireName: true, requireDNI: false, requireSignature: false },
        };
        expect(exigeJustificacionLegal(envio, [lekue])).toBe(true);
    });

    it('no revienta sin envío ni sin lista de clientes', () => {
        expect(exigeJustificacionLegal(null, [lekue])).toBe(false);
        expect(exigeJustificacionLegal({ client: 'INDUSTRIAS LEKUE' })).toBe(false);
    });
});

describe('nombreCompletoValido', () => {
    it('acepta nombre y apellido', () => {
        expect(nombreCompletoValido('Juan Gil')).toBe(true);
        expect(nombreCompletoValido('  María  Pérez López ')).toBe(true);
    });

    it('rechaza el nombre de pila suelto', () => {
        expect(nombreCompletoValido('Juan')).toBe(false);
    });

    it('rechaza iniciales y firmas de trámite', () => {
        expect(nombreCompletoValido('J. Gil')).toBe(false);
        expect(nombreCompletoValido('x')).toBe(false);
        expect(nombreCompletoValido('Juan 2')).toBe(false);
    });

    it('rechaza el campo vacío', () => {
        expect(nombreCompletoValido('')).toBe(false);
        expect(nombreCompletoValido(null)).toBe(false);
        expect(nombreCompletoValido('   ')).toBe(false);
    });
});

describe('documentoIdentidadValido', () => {
    it('acepta un DNI con su letra correcta', () => {
        expect(documentoIdentidadValido('12345678Z')).toBe(true);
        expect(documentoIdentidadValido('12345678-z')).toBe(true);
    });

    it('rechaza un DNI con la letra equivocada', () => {
        expect(documentoIdentidadValido('12345678A')).toBe(false);
    });

    it('rechaza el número inventado en la puerta', () => {
        expect(documentoIdentidadValido('00000000')).toBe(false);
        expect(documentoIdentidadValido('123')).toBe(false);
        expect(documentoIdentidadValido('-')).toBe(false);
    });

    it('acepta un NIE bien puesto y rechaza el mal puesto', () => {
        expect(documentoIdentidadValido('X1234567L')).toBe(true);
        expect(documentoIdentidadValido('X1234567A')).toBe(false);
    });

    it('acepta pasaporte, documento extranjero y CIF de empresa', () => {
        expect(documentoIdentidadValido('AB123456')).toBe(true);
        expect(documentoIdentidadValido('B56131717')).toBe(true);
    });

    it('rechaza el campo vacío', () => {
        expect(documentoIdentidadValido('')).toBe(false);
        expect(documentoIdentidadValido(null)).toBe(false);
    });
});

describe('firmaTieneTrazo', () => {
    it('acepta una firma normal', () => {
        expect(firmaTieneTrazo(trazoDeFirma())).toBe(true);
    });

    it('acepta los trazos en forma de objeto con puntos dentro', () => {
        expect(firmaTieneTrazo([{ points: trazoDeFirma()[0] }])).toBe(true);
    });

    it('rechaza el toque con el dedo', () => {
        expect(firmaTieneTrazo([[{ x: 10, y: 10 }, { x: 11, y: 11 }]])).toBe(false);
    });

    it('rechaza la raya de lado a lado', () => {
        expect(firmaTieneTrazo(trazoDeFirma({ ancho: 300, alto: 2, puntos: 40 }))).toBe(false);
    });

    it('rechaza el rasgueo minúsculo aunque tenga muchos puntos', () => {
        expect(firmaTieneTrazo(trazoDeFirma({ ancho: 20, alto: 20, puntos: 40 }))).toBe(false);
    });

    it('rechaza el recuadro vacío', () => {
        expect(firmaTieneTrazo([])).toBe(false);
        expect(firmaTieneTrazo(null)).toBe(false);
    });
});

describe('fallosDeJustificacion', () => {
    it('no encuentra nada que reprochar a una entrega completa', () => {
        expect(fallosDeJustificacion({
            nombre: 'Juan Gil',
            documento: '12345678Z',
            trazosFirma: trazoDeFirma(),
        })).toEqual([]);
    });

    it('canta los tres fallos de la entrega vacía, en el orden de la pantalla', () => {
        expect(fallosDeJustificacion({ nombre: '', documento: '', trazosFirma: [] }))
            .toEqual(['nombre', 'documento', 'firma']);
    });

    it('canta sólo lo que falta', () => {
        expect(fallosDeJustificacion({
            nombre: 'Juan',
            documento: '12345678Z',
            trazosFirma: trazoDeFirma(),
        })).toEqual(['nombre']);
    });
});
