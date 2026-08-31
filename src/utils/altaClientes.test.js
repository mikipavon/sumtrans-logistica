import { describe, it, expect } from 'vitest';
import { normalizarNombreCliente, buscarFichaPorNombre, esCreadorGenerico, huecosQueRellena, crearColaDeAltas, esRegistroWeb } from './altaClientes';

describe('buscarFichaPorNombre', () => {
    const cartera = [
        { id: 1, name: 'Rafa Martinez' },
        { id: 2, name: 'Grupo Roca', legalName: 'BasicRoca S.L.' },
        { id: 3, name: 'Ecorueda', branches: [{ id: 'b1', name: 'Ecorueda Baena' }] },
    ];

    it('encuentra la ficha aunque el albarán venga con acentos', () => {
        // El guardia anterior comparaba sin quitar acentos y por eso "Rafa
        // Martínez" y "Rafa Martinez" acababan siendo dos fichas pendientes.
        expect(buscarFichaPorNombre('Rafa Martínez', cartera).client.id).toBe(1);
    });

    it('encuentra por razón social, no sólo por el nombre comercial', () => {
        expect(buscarFichaPorNombre('basicroca s.l.', cartera).client.id).toBe(2);
    });

    it('encuentra la sede y dice cuál es', () => {
        const hallada = buscarFichaPorNombre('ECORUEDA BAENA', cartera);
        expect(hallada.client.id).toBe(3);
        expect(hallada.branch.id).toBe('b1');
    });

    it('no encuentra nada con un nombre vacío ni con uno que no está', () => {
        expect(buscarFichaPorNombre('', cartera)).toBeNull();
        expect(buscarFichaPorNombre('Zuricar', cartera)).toBeNull();
    });

    it('aguanta fichas rotas sin reventar', () => {
        expect(buscarFichaPorNombre('Zuricar', [null, {}, { name: null }])).toBeNull();
    });
});

describe('huecosQueRellena', () => {
    it('completa las coordenadas que le faltaban a la ficha', () => {
        // El caso de Validar: el modal la creó sin GPS y el alta de App llega
        // después con él. En vez de una segunda ficha, se completa la primera.
        const huecos = huecosQueRellena(
            { coordinates: '', phone: '957000000' },
            { coordinates: '37.547904, -4.663849', phone: '' }
        );
        expect(huecos).toEqual({ coordinates: '37.547904, -4.663849' });
    });

    it('nunca pisa un dato que ya estaba puesto', () => {
        const huecos = huecosQueRellena(
            { address: 'Ctra. Baena 12', coordinates: '37.1, -4.1' },
            { address: 'OTRA COSA', coordinates: '99.9, -9.9' }
        );
        expect(huecos).toEqual({});
    });

    it('sustituye el "Conductor" genérico por el nombre real', () => {
        const huecos = huecosQueRellena(
            { createdBy: 'Conductor' },
            { createdBy: 'Cond.FRANCISCO JAVIER PAVON MAIZ', creatorId: 7 }
        );
        expect(huecos.createdBy).toBe('Cond.FRANCISCO JAVIER PAVON MAIZ');
        expect(huecos.creatorId).toBe(7);
    });

    it('no borra el nombre real si el alta nueva sólo trae el genérico', () => {
        const huecos = huecosQueRellena(
            { createdBy: 'Cond.JUAN JESUS GUERRERO SANCHEZ' },
            { createdBy: 'Conductor' }
        );
        expect(huecos.createdBy).toBeUndefined();
    });

    it('ignora los espacios en blanco como si fueran hueco', () => {
        expect(huecosQueRellena({ city: '   ' }, { city: 'Espejo' })).toEqual({ city: 'Espejo' });
        expect(huecosQueRellena({ city: 'Espejo' }, { city: '   ' })).toEqual({});
    });
});

describe('esCreadorGenerico', () => {
    it('reconoce lo que no identifica a nadie', () => {
        expect(esCreadorGenerico('Conductor')).toBe(true);
        expect(esCreadorGenerico('driver')).toBe(true);
        expect(esCreadorGenerico('')).toBe(true);
        expect(esCreadorGenerico(undefined)).toBe(true);
    });

    it('respeta un nombre de verdad', () => {
        expect(esCreadorGenerico('Cond.Miguel Pavon')).toBe(false);
        expect(esCreadorGenerico('Administración')).toBe(false);
    });
});

describe('normalizarNombreCliente', () => {
    it('deja el mismo texto para las formas de escribir el mismo nombre', () => {
        expect(normalizarNombreCliente('  José   ÁNGEL ')).toBe('jose angel');
    });
});

describe('crearColaDeAltas', () => {
    it('pone en fila dos altas del mismo cliente, no las deja correr a la vez', async () => {
        // Es el caso que llenaba la pantalla de Validar: el modal del albarán y
        // handleAddShipment creando el mismo remitente con un instante de
        // diferencia, mirando los dos la lista de clientes de antes.
        const cola = crearColaDeAltas();
        const orden = [];
        const lento = () => new Promise(r => setTimeout(() => { orden.push('primera'); r(); }, 20));
        const rapido = async () => { orden.push('segunda'); };

        const a = cola.encolar('basicroca', lento);
        const b = cola.encolar('basicroca', rapido);
        await Promise.all([a, b]);

        expect(orden).toEqual(['primera', 'segunda']);
    });

    it('el turno queda apuntado en el acto, sin esperar a nada', () => {
        // Si el apunte tardase un microtask, la llamada siguiente —que llega en
        // el mismo tick— no lo vería y volveríamos a tener dos fichas.
        const cola = crearColaDeAltas();
        cola.encolar('basicroca', () => Promise.resolve());
        expect(cola.pendientes).toBe(1);
    });

    it('dos clientes distintos no se estorban', async () => {
        const cola = crearColaDeAltas();
        const orden = [];
        await Promise.all([
            cola.encolar('remitente', () => new Promise(r => setTimeout(() => { orden.push('remitente'); r(); }, 20))),
            cola.encolar('destinatario', async () => { orden.push('destinatario'); }),
        ]);
        // El destinatario no ha tenido que esperar al remitente.
        expect(orden).toEqual(['destinatario', 'remitente']);
    });

    it('si una falla, la siguiente sigue entrando', async () => {
        const cola = crearColaDeAltas();
        const orden = [];
        const a = cola.encolar('basicroca', async () => { throw new Error('sin cobertura'); });
        const b = cola.encolar('basicroca', async () => { orden.push('segunda'); });
        await expect(Promise.all([a, b])).resolves.toBeDefined();
        expect(orden).toEqual(['segunda']);
    });

    it('deja de vigilar el nombre cuando ya no queda nada suyo', async () => {
        const cola = crearColaDeAltas();
        await cola.encolar('basicroca', async () => { });
        expect(cola.pendientes).toBe(0);
    });
});

describe('esRegistroWeb', () => {
    it('sólo es registro web lo que viene del formulario de la web', () => {
        expect(esRegistroWeb({ createdFrom: 'web-registro' })).toBe(true);
    });

    it('lo que nace de un albarán o de una entrega, no', () => {
        expect(esRegistroWeb({ createdFrom: 'Albarán' })).toBe(false);
        expect(esRegistroWeb({ createdFrom: 'Entrega' })).toBe(false);
    });

    // Las fichas que escribe la oficina a mano no traen `createdFrom`: nacen ya
    // aprobadas y no pasan por Validar, así que nunca son registro web.
    it('una ficha sin origen tampoco, y no revienta si no hay ficha', () => {
        expect(esRegistroWeb({ name: 'Talleres Lopera' })).toBe(false);
        expect(esRegistroWeb(null)).toBe(false);
        expect(esRegistroWeb(undefined)).toBe(false);
    });
});
