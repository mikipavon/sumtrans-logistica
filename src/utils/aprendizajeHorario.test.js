import { describe, it, expect } from 'vitest';
import {
    registrarHoraDeEntrega,
    registrarCerrado,
    noAntesDe,
    motivoDiceCerrado,
    etiquetaDeHora,
    contarClientesConHorario,
    MIN_ENTREGAS,
    MARGEN_TRAS_CERRADO_MIN,
    MARGEN_ANTES_DE_PRIMERA_MIN,
} from './aprendizajeHorario';
import { adaptarConocimiento, registrarEntrega, memoriaDelPueblo, ordenDeCliente } from './aprendizajeRuta';

const alas = (h, m = 0) => new Date(2026, 8, 23, h, m, 0);

describe('registrarHoraDeEntrega', () => {
    it('con pocas entregas no se atreve a decir nada', () => {
        let datos = null;
        for (let i = 0; i < MIN_ENTREGAS - 1; i++) {
            datos = registrarHoraDeEntrega(datos, { cliente: 'Agencia X', fecha: alas(10, 40) });
        }
        expect(noAntesDe(datos, 'Agencia X')).toBeNull();
    });

    it('con entregas de sobra, "no antes de" es la más temprana menos el margen', () => {
        let datos = null;
        [alas(11, 0), alas(10, 40), alas(12, 15)].forEach(fecha => {
            datos = registrarHoraDeEntrega(datos, { cliente: 'Agencia X', fecha });
        });
        expect(noAntesDe(datos, 'Agencia X')).toBe(10 * 60 + 40 - MARGEN_ANTES_DE_PRIMERA_MIN);
    });

    it('el nombre se normaliza al guardar y al leer', () => {
        let datos = null;
        for (let i = 0; i < MIN_ENTREGAS; i++) {
            datos = registrarHoraDeEntrega(datos, { cliente: '  AGENCIA X ', fecha: alas(10, 40) });
        }
        expect(noAntesDe(datos, 'agencia x')).not.toBeNull();
    });

    it('sin cliente o sin fecha válida no toca nada', () => {
        const antes = { _v: 2 };
        expect(registrarHoraDeEntrega(antes, { cliente: '', fecha: alas(9) })).toBe(antes);
        expect(registrarHoraDeEntrega(antes, { cliente: 'A', fecha: 'no es fecha' })).toBe(antes);
    });
});

describe('registrarCerrado', () => {
    it('un cerrado por la mañana enseña a no volver antes de esa hora más el margen', () => {
        const datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 5) });
        expect(noAntesDe(datos, 'Agencia X')).toBe(9 * 60 + 5 + MARGEN_TRAS_CERRADO_MIN);
    });

    it('el cerrado más tardío manda', () => {
        let datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 5) });
        datos = registrarCerrado(datos, { cliente: 'Agencia X', fecha: alas(9, 50) });
        expect(noAntesDe(datos, 'Agencia X')).toBe(9 * 60 + 50 + MARGEN_TRAS_CERRADO_MIN);
    });

    // La hora de comer no es la hora de abrir.
    it('un cerrado a mediodía o por la tarde no enseña nada', () => {
        const datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(14, 30) });
        expect(noAntesDe(datos, 'Agencia X')).toBeNull();
    });

    it('un cerrado más tarde que una entrega conseguida no cuenta: ese día abrían', () => {
        let datos = null;
        for (let i = 0; i < MIN_ENTREGAS; i++) {
            datos = registrarHoraDeEntrega(datos, { cliente: 'Agencia X', fecha: alas(9, 0) });
        }
        datos = registrarCerrado(datos, { cliente: 'Agencia X', fecha: alas(9, 30) });
        expect(noAntesDe(datos, 'Agencia X')).toBe(9 * 60 - MARGEN_ANTES_DE_PRIMERA_MIN);
    });

    it('una entrega antes de la hora del cerrado lo desmiente', () => {
        let datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 30) });
        expect(noAntesDe(datos, 'Agencia X')).toBe(9 * 60 + 30 + MARGEN_TRAS_CERRADO_MIN);
        datos = registrarHoraDeEntrega(datos, { cliente: 'Agencia X', fecha: alas(8, 45) });
        // Ya no hay cerrado vigente y solo hay una entrega: no se sabe nada.
        expect(noAntesDe(datos, 'Agencia X')).toBeNull();
    });
});

describe('noAntesDe', () => {
    it('lo que pone la ficha manda sobre lo aprendido', () => {
        const datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 5) });
        expect(noAntesDe(datos, 'Agencia X', '11:00')).toBe(11 * 60);
    });

    it('una hora mal escrita en la ficha se ignora', () => {
        expect(noAntesDe(null, 'Agencia X', 'a las once')).toBeNull();
    });

    it('junta lo que saben varios repartidores', () => {
        let a = null;
        for (let i = 0; i < 2; i++) a = registrarHoraDeEntrega(a, { cliente: 'Agencia X', fecha: alas(10, 30) });
        let b = registrarHoraDeEntrega(null, { cliente: 'Agencia X', fecha: alas(10, 45) });
        // Ninguno llega solo al mínimo, entre los dos sí.
        expect(noAntesDe(a, 'Agencia X')).toBeNull();
        expect(noAntesDe([a, b], 'Agencia X')).toBe(10 * 60 + 30 - MARGEN_ANTES_DE_PRIMERA_MIN);
    });

    it('la entrega de un repartidor desmiente el cerrado de otro', () => {
        const a = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 30) });
        const b = registrarHoraDeEntrega(null, { cliente: 'Agencia X', fecha: alas(9, 0) });
        expect(noAntesDe([a, b], 'Agencia X')).toBeNull();
    });

    it('de un cliente desconocido no sabe nada', () => {
        expect(noAntesDe({ _v: 2 }, 'Nadie')).toBeNull();
        expect(noAntesDe(null, '')).toBeNull();
    });
});

describe('convivencia con el aprendizaje del orden', () => {
    it('el horario sobrevive a registrar una entrega del orden y viceversa', () => {
        let datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 5) });
        datos = registrarEntrega(datos, { pueblo: 'Cabra', turno: 'manana', cliente: 'Agencia X', posicion: 3, total: 3 });
        datos = registrarHoraDeEntrega(datos, { cliente: 'Mamaki', fecha: alas(8, 30) });
        expect(noAntesDe(datos, 'Agencia X')).toBe(9 * 60 + 5 + MARGEN_TRAS_CERRADO_MIN);
        expect(ordenDeCliente(memoriaDelPueblo(datos, 'Cabra', 'manana'), 'Agencia X')).toBe(1);
    });

    // Sin la marca de versión, adaptarConocimiento lo trataría como formato antiguo y
    // tiraría todo lo que empiece por guion bajo.
    it('lo guardado lleva la versión, así que adaptarConocimiento no lo tira', () => {
        const datos = registrarCerrado(null, { cliente: 'Agencia X', fecha: alas(9, 5) });
        const releido = adaptarConocimiento(JSON.parse(JSON.stringify(datos)));
        expect(noAntesDe(releido, 'Agencia X')).not.toBeNull();
        expect(contarClientesConHorario(releido)).toBe(1);
    });
});

describe('motivoDiceCerrado', () => {
    it('reconoce las formas habituales de decirlo', () => {
        ['Local cerrado', 'Está CERRADA la nave', 'No han abierto todavía', 'no abre hasta las 10', 'Abren a las 10:30', 'todavía no abren']
            .forEach(m => expect(motivoDiceCerrado(m)).toBe(true));
    });

    it('no confunde otras incidencias', () => {
        ['Cliente ausente', 'Dirección incorrecta', 'Paquete dañado', 'Rechazado', ''].forEach(m => expect(motivoDiceCerrado(m)).toBe(false));
    });
});

describe('etiquetaDeHora', () => {
    it('pinta la hora con dos cifras', () => {
        expect(etiquetaDeHora(9 * 60 + 5)).toBe('09:05');
        expect(etiquetaDeHora(null)).toBe('');
    });
});
