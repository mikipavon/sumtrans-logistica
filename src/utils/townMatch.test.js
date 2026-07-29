import { describe, it, expect } from 'vitest';
import { normalizarPueblo, mejorPuebloParaCiudad, esElMismoPueblo } from './townMatch';

// Pueblos reales de las rutas de SUM (los que se pisan entre sí)
const PUEBLOS_DE_RUTA = [
    'Córdoba',
    'Montalbán de Córdoba',
    'Priego de Córdoba',
    'La Rambla',
    'Fernan-Nuñez',
    'El Tejar',
];

describe('normalizarPueblo', () => {
    it('quita acentos, mayúsculas y código postal', () => {
        expect(normalizarPueblo('MONTALBÁN DE CÓRDOBA (14548)')).toBe('montalban de cordoba');
    });

    it('trata los guiones como espacios', () => {
        expect(normalizarPueblo('Fernan-Nuñez')).toBe('fernan nunez');
        expect(normalizarPueblo('Fernán Núñez')).toBe('fernan nunez');
    });

    it('aguanta vacíos', () => {
        expect(normalizarPueblo(null)).toBe('');
        expect(normalizarPueblo('   ')).toBe('');
    });
});

describe('mejorPuebloParaCiudad', () => {
    it('el caso que dio el fallo: Montalbán no es Córdoba', () => {
        expect(mejorPuebloParaCiudad('Montalbán de Córdoba', PUEBLOS_DE_RUTA)).toBe('Montalbán de Córdoba');
    });

    it('con código postal pegado también acierta', () => {
        expect(mejorPuebloParaCiudad('MONTALBÁN DE CÓRDOBA (14548)', PUEBLOS_DE_RUTA)).toBe('Montalbán de Córdoba');
    });

    it('Priego tampoco se lo queda Córdoba', () => {
        expect(mejorPuebloParaCiudad('Priego de Córdoba', PUEBLOS_DE_RUTA)).toBe('Priego de Córdoba');
    });

    it('Córdoba capital sigue siendo Córdoba', () => {
        expect(mejorPuebloParaCiudad('Córdoba', PUEBLOS_DE_RUTA)).toBe('Córdoba');
        expect(mejorPuebloParaCiudad('CORDOBA (14001)', PUEBLOS_DE_RUTA)).toBe('Córdoba');
    });

    it('mantiene la tolerancia con nombres escritos a medias', () => {
        expect(mejorPuebloParaCiudad('Tejar', PUEBLOS_DE_RUTA)).toBe('El Tejar');
        expect(mejorPuebloParaCiudad('Fernán Núñez', PUEBLOS_DE_RUTA)).toBe('Fernan-Nuñez');
    });

    it('si la ruta no tiene el pueblo específico, se queda con el genérico que encaje', () => {
        // Una ruta que solo pasa por Córdoba capital: el envío de Montalbán sigue
        // cayendo ahí, como hacía antes. Esa tolerancia no se toca.
        expect(mejorPuebloParaCiudad('Montalbán de Córdoba', ['Córdoba'])).toBe('Córdoba');
    });

    it('devuelve null cuando no encaja ninguno', () => {
        expect(mejorPuebloParaCiudad('Sevilla', PUEBLOS_DE_RUTA)).toBeNull();
        expect(mejorPuebloParaCiudad('', PUEBLOS_DE_RUTA)).toBeNull();
    });

    it('no se rompe con listas vacías', () => {
        expect(mejorPuebloParaCiudad('Córdoba', [])).toBeNull();
        expect(mejorPuebloParaCiudad('Córdoba')).toBeNull();
    });
});

describe('esElMismoPueblo', () => {
    it('compara ignorando acentos, mayúsculas y CP', () => {
        expect(esElMismoPueblo('MONTALBÁN DE CÓRDOBA (14548)', 'Montalban de Cordoba')).toBe(true);
    });

    it('no confunde el pueblo con la provincia', () => {
        expect(esElMismoPueblo('Montalbán de Córdoba', 'Córdoba')).toBe(false);
    });

    it('vacío no es igual a nada', () => {
        expect(esElMismoPueblo('', '')).toBe(false);
    });
});

describe('reproducción del fallo con las rutas reales', () => {
    // Tal y como están hoy en Supabase
    const RUTAS = [
        { nombre: 'RUTA MONTILLA',     conductor: 'JAVITO',     pueblos: ['Córdoba', 'Montilla'] },
        { nombre: 'RUTA BAENA',        conductor: 'PACO',       pueblos: ['Córdoba', 'Baena'] },
        { nombre: 'RUTA LA RAMBLA',    conductor: 'JUAN JESÚS', pueblos: ['Córdoba', 'Montalbán de Córdoba', 'La Rambla'] },
        { nombre: 'RUTA PUENTE GENIL', conductor: 'KISKO',      pueblos: ['Córdoba', 'Puente Genil'] },
    ];

    const sugeridosPara = (ciudad) => {
        const todos = RUTAS.flatMap(r => r.pueblos);
        const elegido = mejorPuebloParaCiudad(ciudad, todos);
        return RUTAS
            .filter(r => r.pueblos.some(p => esElMismoPueblo(p, elegido)))
            .map(r => r.conductor);
    };

    it('Montalbán de Córdoba solo lo propone a Juan Jesús', () => {
        expect(sugeridosPara('MONTALBÁN DE CÓRDOBA (14548)')).toEqual(['JUAN JESÚS']);
    });

    it('Córdoba capital los sigue proponiendo a todos', () => {
        expect(sugeridosPara('Córdoba')).toEqual(['JAVITO', 'PACO', 'JUAN JESÚS', 'KISKO']);
    });
});
