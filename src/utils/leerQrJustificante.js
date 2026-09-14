// Lectura del QR de los justificantes de reembolso escaneados.
//
// El escáner de la oficina guarda el ticket a unos 585x839 píxeles: el QR ocupa
// unos 95 y cada cuadradito son 3 o 4 píxeles. Con un solo intento, un pliegue
// del papel, una firma que roza el QR o el ticket metido un poco torcido bastan
// para que no lo lea (HAB-81 y HAB-76, septiembre de 2026). Los dos se leían
// forzando el contraste o enderezando un par de grados, así que si el primer
// intento falla se prueba con eso antes de dar el QR por perdido.

import jsQR from 'jsqr';

// Pasar a blanco y negro puro: por debajo del umbral es tinta.
const UMBRALES = [null, 110, 140, 170, 200];
// Grados. El ticket entra en el escáner con la mano y nunca va recto del todo.
const GIROS = [0, -2, 2, -4, 4];

// El QR lo imprime el repartidor como `COD:<id del envío>`.
export const idDelQrJustificante = (texto) => {
    if (typeof texto !== 'string' || !texto.startsWith('COD:')) return null;
    return texto.slice(4).trim() || null;
};

// Devuelve una copia en RGBA girada `giro` grados sobre el centro y, si hay
// umbral, en blanco y negro. Lo que queda fuera al girar se rellena de blanco.
export const prepararImagen = ({ data, width, height }, { umbral = null, giro = 0 } = {}) => {
    const out = new Uint8ClampedArray(width * height * 4);
    const rad = (giro * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const cx = (width - 1) / 2, cy = (height - 1) / 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx, dy = y - cy;
            const sx = cx + dx * cos - dy * sin;
            const sy = cy + dx * sin + dy * cos;
            const o = (y * width + x) * 4;
            const x0 = Math.floor(sx), y0 = Math.floor(sy);

            if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) {
                // Fuera del papel. El borde exacto de la imagen también cae aquí.
                if (giro === 0 && x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) {
                    const i = (y0 * width + x0) * 4;
                    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
                } else {
                    out[o] = out[o + 1] = out[o + 2] = 255;
                }
            } else {
                const ax = sx - x0, ay = sy - y0;
                const i00 = (y0 * width + x0) * 4, i10 = i00 + 4;
                const i01 = i00 + width * 4, i11 = i01 + 4;
                for (let c = 0; c < 3; c++) {
                    out[o + c] = (data[i00 + c] * (1 - ax) + data[i10 + c] * ax) * (1 - ay)
                        + (data[i01 + c] * (1 - ax) + data[i11 + c] * ax) * ay;
                }
            }

            if (umbral != null) {
                const gris = 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2];
                out[o] = out[o + 1] = out[o + 2] = gris < umbral ? 0 : 255;
            }
            out[o + 3] = 255;
        }
    }
    return { data: out, width, height };
};

// `imagen` es lo que da canvas.getImageData: { data, width, height }.
// Devuelve el id del envío o null si no hay manera de leerlo.
export const leerQrJustificante = (imagen) => {
    const { data, width, height } = imagen;
    const primero = jsQR(data, width, height);
    const id = idDelQrJustificante(primero?.data);
    if (id) return id;

    for (const umbral of UMBRALES) {
        for (const giro of GIROS) {
            if (umbral == null && giro === 0) continue; // ya probado arriba
            const preparada = prepararImagen(imagen, { umbral, giro });
            // El ticket es tinta negra sobre papel: no hace falta probar invertido.
            const code = jsQR(preparada.data, width, height, { inversionAttempts: 'dontInvert' });
            const encontrado = idDelQrJustificante(code?.data);
            if (encontrado) return encontrado;
        }
    }
    return null;
};
