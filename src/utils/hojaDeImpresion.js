/**
 * Hoja de impresión con la proporción de un folio.
 *
 * Todos los tickets de la aplicación (albarán, justificante de reembolso, factura
 * simplificada) se dibujan en una columna de 80 mm. Al imprimir, el navegador
 * encaja el ancho del documento en el ancho del folio y estira el alto en la misma
 * proporción, así que lo que decide si el ticket entra en una hoja no es su alto en
 * píxeles sino su proporción alto/ancho: en cuanto pasa de la del folio (un A4 mide
 * 1,414 de alto por cada 1 de ancho) lo que sobra se va a un segundo folio.
 *
 * La solución es meter el ticket en una "hoja" con esa misma proporción: el
 * navegador ve una caja con forma de folio y la imprime en una sola página. Si el
 * contenido no cupiera (muchos artículos, observaciones largas, listas), se encoge
 * dentro de la hoja antes de imprimir en vez de saltar a la hoja siguiente.
 */

// Un pelo más apaisada que el 1,414 de un A4, para dejar holgura a los márgenes
// que cada impresora se reserva por su cuenta.
export const PROPORCION_FOLIO = 1.40;

/**
 * CSS de la hoja. `ancho` es el ancho del ticket y `relleno` su margen interior.
 * `selector` es el de la hoja: `#hoja` cuando la ventana lleva una sola y una
 * clase (`.hoja`) cuando lleva varias, una por página (los justificantes de
 * "Imprimir Todos").
 */
export const estilosDeHoja = ({ ancho = '80mm', relleno = '4px', selector = '#hoja' } = {}) => `
                    ${selector} {
                        width: ${ancho};
                        margin: 0 auto;
                        padding: ${relleno};
                        box-sizing: border-box;
                        overflow: hidden;
                    }`;

/**
 * Script que encaja el contenido en la hoja. Se pega dentro de la ventana de
 * impresión (no puede importarse allí: es otro documento) y hay que llamar a
 * `ajustarAlFolio()` antes de imprimir.
 *
 * `fijarAlto` es para las hojas cuyo alto sale de la proporción; las que ya tienen
 * un alto de papel puesto (los A6 de "Imprimir Todos") lo pasan a false y sólo se
 * comprueba que el contenido quepa en el que ya tienen.
 */
export const scriptDeAjuste = ({ hoja = '#hoja', contenido = '#contenido', fijarAlto = true } = {}) => `
                    // Lo que ocupa de verdad el contenido. scrollHeight se queda corto
                    // cuando la caja tiene el alto puesto a mano (las tarjetas A6 son un
                    // flex estirado): entonces lo que se sale no lo cuenta nadie, así que
                    // se mira hasta dónde llega el último hijo.
                    function altoDelContenido(dentro) {
                        var alto = dentro.scrollHeight;
                        var arriba = dentro.getBoundingClientRect().top;
                        var estilo = getComputedStyle(dentro);
                        var cola = parseFloat(estilo.paddingBottom) + parseFloat(estilo.borderBottomWidth);
                        for (var i = 0; i < dentro.children.length; i++) {
                            var abajo = dentro.children[i].getBoundingClientRect().bottom - arriba + cola;
                            if (abajo > alto) alto = abajo;
                        }
                        return alto;
                    }

                    function ajustarAlFolio() {
                        var hojas = document.querySelectorAll('${hoja}');
                        for (var i = 0; i < hojas.length; i++) {
                            var caja = hojas[i];
                            var dentro = caja.querySelector('${contenido}');
                            if (!dentro) continue;
                            // Se mide siempre sin encoger, para poder llamar a esto las
                            // veces que haga falta (al cargar y al ir a imprimir).
                            dentro.style.transform = 'none';
                            var estilo = getComputedStyle(caja);
                            var relleno = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
                            var altoHoja = ${fijarAlto ? `caja.clientWidth * ${PROPORCION_FOLIO}` : 'caja.clientHeight'};
                            ${fijarAlto ? "caja.style.height = altoHoja + 'px';" : ''}
                            var hueco = altoHoja - relleno;
                            var alto = altoDelContenido(dentro);
                            // Dos píxeles de tolerancia: los milímetros del papel no caen
                            // en píxeles enteros y no se va a encoger nada por un redondeo.
                            if (alto > hueco + 2) {
                                dentro.style.transformOrigin = 'top center';
                                dentro.style.transform = 'scale(' + ((hueco / alto) * 0.98) + ')';
                            }
                        }
                    }`;
