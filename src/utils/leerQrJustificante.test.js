import { describe, it, expect } from 'vitest';
import { idDelQrJustificante, prepararImagen, leerQrJustificante } from './leerQrJustificante';

const imagen = (width, height, pixeles) => {
    const data = new Uint8ClampedArray(width * height * 4);
    pixeles.forEach(([r, g, b], i) => { data.set([r, g, b, 255], i * 4); });
    return { data, width, height };
};

describe('idDelQrJustificante', () => {
    it('saca el id del envío del texto que imprime el repartidor', () => {
        expect(idDelQrJustificante('COD:HAB-81')).toBe('HAB-81');
        expect(idDelQrJustificante('COD:SUM-518 ')).toBe('SUM-518');
    });

    it('un QR que no es de justificante no se toma por un envío', () => {
        expect(idDelQrJustificante('HAB-81')).toBeNull();
        expect(idDelQrJustificante('https://sumtransportes.com')).toBeNull();
        expect(idDelQrJustificante('COD:')).toBeNull();
        expect(idDelQrJustificante(undefined)).toBeNull();
    });
});

describe('prepararImagen', () => {
    it('con umbral deja sólo negro y blanco', () => {
        const img = imagen(2, 1, [[90, 90, 90], [180, 180, 180]]);
        const { data } = prepararImagen(img, { umbral: 140 });
        expect([data[0], data[4]]).toEqual([0, 255]);
    });

    it('sin giro ni umbral devuelve la misma imagen', () => {
        const img = imagen(3, 3, Array.from({ length: 9 }, (_, i) => [i * 20, i * 10, i * 5]));
        expect(Array.from(prepararImagen(img).data)).toEqual(Array.from(img.data));
    });

    it('lo que queda fuera al girar es papel blanco, no tinta', () => {
        const img = imagen(4, 4, Array.from({ length: 16 }, () => [0, 0, 0]));
        const { data } = prepararImagen(img, { giro: 45 });
        expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
    });
});

describe('leerQrJustificante', () => {
    it('una hoja en blanco no se inventa un envío', () => {
        const img = imagen(40, 40, Array.from({ length: 1600 }, () => [255, 255, 255]));
        expect(leerQrJustificante(img)).toBeNull();
    });
});
