import { describe, it, expect } from 'vitest';
import { poblacionYCalle, puedeAsignarloEsteConductor, estaEnElRepartoDe, intervinoConductor, quienPagaElPorte, lineasDeDineroDelJustificante, papelDelClienteEnElEnvio, envioEsDelCliente, clientePagaElPorte, nombresDelCliente, getIrregularReasons, vieneDelPortal, importeParaMostrar, fichaDelDestinatario, nombreDestinatarioEnRuta } from './shipmentUtils';

// Ids reales de conductores en el escenario que motivó el cambio:
// Paco crea el albarán y se lo asigna por error a Miguel; Miguel lo devuelve
// deslizando la tarjeta y tiene que poder mandárselo él mismo al correcto.
const PACO = 1;
const MIGUEL = 2;
const JUAN = 3;

const albaranPendiente = (extra = {}) => ({
    id: 'TR-100',
    status: 'Pendiente de asignar',
    createdById: PACO,
    ...extra
});

describe('puedeAsignarloEsteConductor', () => {
    it('solo lo ve el conductor que lo devolvió deslizando, no el creador', () => {
        const albaran = albaranPendiente({ returnedToAssignById: MIGUEL });

        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaran, JUAN)).toBe(false);
    });

    it('el sello gana también sobre quien escaneó los bultos', () => {
        const albaran = albaranPendiente({
            returnedToAssignById: MIGUEL,
            pickedUpById: JUAN
        });

        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, JUAN)).toBe(false);
    });

    it('sin sello, sigue viéndolo el creador', () => {
        const albaran = albaranPendiente();

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(false);
    });

    it('sin sello, también lo ve quien recogió los bultos', () => {
        const albaran = albaranPendiente({ pickedUpById: JUAN });

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, JUAN)).toBe(true);
    });

    it('al limpiar el sello vuelve a la regla normal', () => {
        // Es lo que pasa cuando oficina lo libera o cuando otro conductor
        // escanea los bultos: returnedToAssignById se pone a null.
        const albaran = albaranPendiente({ returnedToAssignById: null });

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(false);
    });

    it('compara ids aunque uno venga como texto', () => {
        // Supabase devuelve el JSON tal cual se guardó y el <select> del móvil
        // entrega strings, así que los dos formatos conviven.
        const albaran = albaranPendiente({ returnedToAssignById: '2' });

        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(true);
        expect(puedeAsignarloEsteConductor(albaran, '2')).toBe(true);
    });

    it('un albarán de oficina (createdById null) no salta a un conductor cualquiera', () => {
        const albaran = albaranPendiente({ createdById: null });

        expect(puedeAsignarloEsteConductor(albaran, PACO)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaran, MIGUEL)).toBe(false);
    });

    it('ignora los albaranes que no están pendientes de asignar', () => {
        const enReparto = albaranPendiente({
            status: 'En reparto',
            returnedToAssignById: MIGUEL
        });

        expect(puedeAsignarloEsteConductor(enReparto, MIGUEL)).toBe(false);
    });

    it('un albarán ya cobrado sigue esperando en Asignar', () => {
        // El cliente crea el albarán con "aplazar cobro" y paga un rato después:
        // se cobra desde C.Pendientes, pero el paquete NO se ha entregado. Tiene
        // que seguir saliendo en Asignar hasta que alguien lo lleve.
        const cobradoSinEntregar = albaranPendiente({ portePaid: true, paymentStatus: 'Paid' });

        expect(puedeAsignarloEsteConductor(cobradoSinEntregar, PACO)).toBe(true);
    });

    it('aguanta huecos en la lista y conductor sin identificar', () => {
        expect(puedeAsignarloEsteConductor(null, MIGUEL)).toBe(false);
        expect(puedeAsignarloEsteConductor(undefined, MIGUEL)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaranPendiente(), null)).toBe(false);
        expect(puedeAsignarloEsteConductor(albaranPendiente(), undefined)).toBe(false);
    });
});

describe('estaEnElRepartoDe', () => {
    // El caso real: Juan Jesús convierte una recogida suya en albarán. El albarán
    // nace «Pendiente de asignar» pero con su id de conductor arrastrado del prefill,
    // y le aparecía como parada #1 del reparto sin que nadie se lo hubiera asignado.
    it('un albarán pendiente no es reparto de nadie, aunque lleve conductor', () => {
        const albaran = { id: 'SUM-139', status: 'Pendiente de asignar', assignedDriverId: JUAN };

        expect(estaEnElRepartoDe(albaran, JUAN)).toBe(false);
        // Y sigue estando donde toca: en la pestaña Asignar de quien lo creó.
        expect(puedeAsignarloEsteConductor({ ...albaran, createdById: JUAN }, JUAN)).toBe(true);
    });

    it('asignado de verdad, sí entra en su reparto', () => {
        const albaran = { id: 'SUM-139', status: 'En reparto', assignedDriverId: JUAN };

        expect(estaEnElRepartoDe(albaran, JUAN)).toBe(true);
        expect(estaEnElRepartoDe(albaran, MIGUEL)).toBe(false);
    });

    it('una incidencia sigue siendo suya: no se le puede borrar la parada', () => {
        const albaran = { id: 'SUM-139', status: 'Incidencia', assignedDriverId: JUAN };

        expect(estaEnElRepartoDe(albaran, JUAN)).toBe(true);
    });

    it('sin conductor no entra en el reparto de nadie', () => {
        const albaran = { id: 'SUM-139', status: 'En reparto', assignedDriverId: null };

        expect(estaEnElRepartoDe(albaran, JUAN)).toBe(false);
        expect(estaEnElRepartoDe(albaran, null)).toBe(false);
    });

    it('compara ids aunque uno venga como texto', () => {
        const albaran = { id: 'SUM-139', status: 'En reparto', assignedDriverId: '3' };

        expect(estaEnElRepartoDe(albaran, JUAN)).toBe(true);
    });
});

describe('intervinoConductor', () => {
    // El caso que lo motivó: Miguel cubre la ruta de Juan. El albarán sigue asignado
    // a Juan, pero lo entrega y lo cobra Miguel.
    const cubierto = {
        id: 'SUM-4',
        status: 'Entregado',
        assignedDriverId: JUAN,
        deliveredById: MIGUEL,
        porteCollectedById: MIGUEL
    };

    it('sale en el filtro del que lo entregó, no solo en el del asignado', () => {
        expect(intervinoConductor(cubierto, MIGUEL)).toBe(true);
        expect(intervinoConductor(cubierto, JUAN)).toBe(true);
        expect(intervinoConductor(cubierto, PACO)).toBe(false);
    });

    it('cuenta el reembolso cobrado y los bultos recogidos', () => {
        expect(intervinoConductor({ codCollectedById: MIGUEL }, MIGUEL)).toBe(true);
        expect(intervinoConductor({ pickedUpById: MIGUEL }, MIGUEL)).toBe(true);
    });

    it('no cuenta haberlo devuelto a Asignar: eso es rechazarlo, no hacerlo', () => {
        expect(intervinoConductor({ returnedToAssignById: MIGUEL }, MIGUEL)).toBe(false);
    });

    it('un albarán sin conductores no es de nadie aunque el id venga vacío', () => {
        const deOficina = { assignedDriverId: null, deliveredById: null, createdById: null };
        expect(intervinoConductor(deOficina, MIGUEL)).toBe(false);
        expect(intervinoConductor(deOficina, null)).toBe(false);
        expect(intervinoConductor(deOficina, '')).toBe(false);
    });

    it('compara ids aunque uno venga como texto (el filtro los pasa en string)', () => {
        expect(intervinoConductor({ assignedDriverId: 2 }, '2')).toBe(true);
        expect(intervinoConductor({ assignedDriverId: '2' }, 2)).toBe(true);
    });

    it('sin albarán no revienta', () => {
        expect(intervinoConductor(null, MIGUEL)).toBe(false);
    });
});

describe('quienPagaElPorte', () => {
    it('Debido lo paga el destinatario', () => {
        expect(quienPagaElPorte({ porteType: 'Debido' })).toBe('Destinatario');
        expect(quienPagaElPorte({ porteType: 'debido' })).toBe('Destinatario');
    });

    it('Pagado lo paga el remitente', () => {
        expect(quienPagaElPorte({ porteType: 'Pagado' })).toBe('Remitente');
    });

    it('un albarán antiguo sin el campo lo paga el remitente', () => {
        expect(quienPagaElPorte({})).toBe('Remitente');
        expect(quienPagaElPorte(null)).toBe('Remitente');
    });
});

describe('lineasDeDineroDelJustificante', () => {
    // El caso de Antonio: SUM-52, porte debido de 40 €, justificante al remitente.
    const SUM52 = { id: 'SUM-52', porteType: 'Debido', amount: '40' };

    it('a quien paga se le manda el precio y el estado del cobro', () => {
        const { estadoText, priceText } = lineasDeDineroDelJustificante(SUM52, { paga: true });
        expect(priceText).toBe('*Precio:* 40,00 € + IVA = *48,40 €*\n');
        expect(estadoText).toBe('*Estado:* PENDIENTE DE COBRO\n');
    });

    it('a quien NO paga no se le manda ni precio ni "pendiente de cobro"', () => {
        const lineas = lineasDeDineroDelJustificante(SUM52, { paga: false });
        expect(lineas).toEqual({ estadoText: '', priceText: '', codText: '' });
    });

    it('un porte ya cobrado tampoco se le cuenta al que no paga', () => {
        const cobrado = { ...SUM52, portePaid: true };
        expect(lineasDeDineroDelJustificante(cobrado, { paga: true }).estadoText).toBe('*Estado:* PAGADO\n');
        expect(lineasDeDineroDelJustificante(cobrado, { paga: false }).estadoText).toBe('');
    });

    it('el reembolso va en los dos justificantes: es dinero del remitente', () => {
        const conCod = { ...SUM52, codAmount: '150,50' };
        expect(lineasDeDineroDelJustificante(conCod, { paga: true }).codText)
            .toBe('*Reembolso a cobrar:* 150,50 €\n');
        expect(lineasDeDineroDelJustificante(conCod, { paga: false }).codText)
            .toBe('*Reembolso a cobrar:* 150,50 €\n');
    });

    it('reembolso ya cobrado se dice cobrado', () => {
        const conCod = { ...SUM52, codAmount: '150,50', codPaid: true, portePaid: true };
        expect(lineasDeDineroDelJustificante(conCod, { paga: true }).codText)
            .toBe('*Reembolso cobrado:* 150,50 €\n');
        expect(lineasDeDineroDelJustificante(conCod, { paga: true }).estadoText)
            .toBe('*Estado:* PAGADO\n');
    });

    it('porte pagado con reembolso suelto lo dice a medias', () => {
        const mixto = { ...SUM52, portePaid: true, codAmount: '20' };
        expect(lineasDeDineroDelJustificante(mixto, { paga: true }).estadoText)
            .toBe('*Estado:* Porte pagado · reembolso pendiente\n');
    });

    it('al contado (serie HAB-) el precio va sin desglose de IVA', () => {
        const { priceText } = lineasDeDineroDelJustificante(
            { id: 'HAB-7', amount: '25' }, { paga: true, isContado: true }
        );
        expect(priceText).toBe('*Precio:* 25,00 €\n');
    });

    it("'Tarifa' no tiene importe pero sí deja el cobro pendiente", () => {
        const { estadoText, priceText } = lineasDeDineroDelJustificante(
            { id: 'SUM-9', amount: 'Tarifa' }, { paga: true }
        );
        expect(priceText).toBe('');
        expect(estadoText).toBe('*Estado:* PENDIENTE DE COBRO\n');
    });

    it('sin nada que cobrar no sale ninguna línea', () => {
        expect(lineasDeDineroDelJustificante({ id: 'SUM-1' }, { paga: true }))
            .toEqual({ estadoText: '', priceText: '', codText: '' });
    });

    it('el precio a mano (customAmount) manda sobre el de tarifa', () => {
        const { priceText } = lineasDeDineroDelJustificante(
            { id: 'SUM-3', amount: '40', customAmount: '55' }, { paga: true }
        );
        expect(priceText).toBe('*Precio:* 55,00 € + IVA = *66,55 €*\n');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Qué envíos son de un cliente a efectos de su portal
// ─────────────────────────────────────────────────────────────────────────────
const ESMEBRA = {
    id: 42,
    name: 'ESMEBRA',
    legalName: 'Esmebra Construcciones, S.L.',
    branches: [{ name: 'ESMEBRA Almacén Lucena' }]
};

describe('papelDelClienteEnElEnvio', () => {
    it('un porte debido que manda él sigue siendo suyo: paga el otro, pero lo ve', () => {
        const envio = { client: 'ESMEBRA', destinationName: 'FERRETERIA PEPE', porteType: 'Debido' };
        expect(papelDelClienteEnElEnvio(envio, ESMEBRA)).toBe('Remitente');
        expect(envioEsDelCliente(envio, ESMEBRA)).toBe(true);
    });

    it('lo que le mandan a él también es suyo, aunque el remitente sea otro', () => {
        const envio = { client: 'FERRETERIA PEPE', destinationName: 'ESMEBRA', porteType: 'Pagado' };
        expect(papelDelClienteEnElEnvio(envio, ESMEBRA)).toBe('Destinatario');
        expect(envioEsDelCliente(envio, ESMEBRA)).toBe(true);
    });

    it('no importa cómo lo tecleara la oficina: tildes, mayúsculas y espacios de más', () => {
        expect(papelDelClienteEnElEnvio({ destinationName: '  esmebra   construcciones, s.l. ' }, ESMEBRA)).toBe('Destinatario');
        expect(papelDelClienteEnElEnvio({ originName: 'Esmebra ALMACÉN Lucena' }, ESMEBRA)).toBe('Remitente');
    });

    it('un albarán de oficina viene sin clientId y se reconoce por el nombre', () => {
        expect(papelDelClienteEnElEnvio({ client: 'ESMEBRA' }, ESMEBRA)).toBe('Remitente');
    });

    it('un albarán del portal se reconoce por el id aunque el nombre haya cambiado', () => {
        expect(papelDelClienteEnElEnvio({ clientId: 42, client: 'Nombre viejo' }, ESMEBRA)).toBe('Remitente');
        expect(papelDelClienteEnElEnvio({ clientId: '42' }, ESMEBRA)).toBe('Remitente');
    });

    it('sin id ni nombre que coincida, no es suyo', () => {
        expect(papelDelClienteEnElEnvio({ client: 'OTRO', destinationName: 'OTRO MAS' }, ESMEBRA)).toBeNull();
        expect(envioEsDelCliente({ client: 'OTRO' }, ESMEBRA)).toBe(false);
    });

    it('un albarán sin nombres no es de nadie, ni siquiera de una ficha sin nombre', () => {
        const fichaVacia = { id: 7, name: '' };
        expect(papelDelClienteEnElEnvio({ client: '', destinationName: '' }, fichaVacia)).toBeNull();
        expect(papelDelClienteEnElEnvio({}, fichaVacia)).toBeNull();
        // Number(null) === 0, y clientId ausente no puede casar con nada
        expect(papelDelClienteEnElEnvio({ clientId: null }, { id: null, name: '' })).toBeNull();
    });

    it('si se manda algo a una sede suya, se queda con el papel del que paga', () => {
        const aSuSede = { client: 'ESMEBRA', destinationName: 'ESMEBRA Almacén Lucena' };
        expect(papelDelClienteEnElEnvio({ ...aSuSede, porteType: 'Pagado' }, ESMEBRA)).toBe('Remitente');
        expect(papelDelClienteEnElEnvio({ ...aSuSede, porteType: 'Debido' }, ESMEBRA)).toBe('Destinatario');
    });

    it('sin envío o sin ficha no rompe: simplemente no es suyo', () => {
        expect(papelDelClienteEnElEnvio(null, ESMEBRA)).toBeNull();
        expect(papelDelClienteEnElEnvio({ client: 'ESMEBRA' }, null)).toBeNull();
    });
});

describe('clientePagaElPorte · qué importes se le enseñan', () => {
    it('remitente con porte pagado: paga él, ve el precio', () => {
        expect(clientePagaElPorte({ client: 'ESMEBRA', porteType: 'Pagado' }, ESMEBRA)).toBe(true);
    });

    it('remitente con porte debido: paga el destinatario, no ve el precio', () => {
        expect(clientePagaElPorte({ client: 'ESMEBRA', destinationName: 'OTRO', porteType: 'Debido' }, ESMEBRA)).toBe(false);
    });

    it('destinatario con porte debido: paga él, ve el precio', () => {
        expect(clientePagaElPorte({ client: 'OTRO', destinationName: 'ESMEBRA', porteType: 'Debido' }, ESMEBRA)).toBe(true);
    });

    it('destinatario con porte pagado: paga el remitente, no ve el precio', () => {
        expect(clientePagaElPorte({ client: 'OTRO', destinationName: 'ESMEBRA', porteType: 'Pagado' }, ESMEBRA)).toBe(false);
    });

    it('un albarán antiguo sin tipo de porte lo paga el remitente', () => {
        expect(clientePagaElPorte({ client: 'ESMEBRA' }, ESMEBRA)).toBe(true);
        expect(clientePagaElPorte({ client: 'OTRO', destinationName: 'ESMEBRA' }, ESMEBRA)).toBe(false);
    });

    it('un envío que no es suyo nunca le enseña el precio', () => {
        expect(clientePagaElPorte({ client: 'OTRO', porteType: 'Pagado' }, ESMEBRA)).toBe(false);
    });
});

describe('nombresDelCliente', () => {
    it('reúne el comercial, el fiscal y las sedes, normalizados y sin repetidos', () => {
        expect(nombresDelCliente(ESMEBRA)).toEqual([
            'esmebra',
            'esmebra construcciones, s.l.',
            'esmebra almacen lucena'
        ]);
        expect(nombresDelCliente({ name: 'A', legalName: 'a', branches: [{ name: ' A ' }, null] })).toEqual(['a']);
    });

    it('sin ficha o sin nombres, lista vacía', () => {
        expect(nombresDelCliente(null)).toEqual([]);
        expect(nombresDelCliente({ id: 1 })).toEqual([]);
    });
});

describe('getIrregularReasons · kilos del portal', () => {
    const delPortal = (extra = {}) => ({
        id: 'CLI-1',
        status: 'Pendiente de asignar',
        createdBy: 'ClienteWeb: Ferretería Pepe',
        ...extra
    });

    it('un albarán del portal con kilos entra en el centro de notificaciones', () => {
        expect(getIrregularReasons(delPortal({ weightKg: 12.5 }))).toContain('Indica peso: 12.5 kg');
        expect(getIrregularReasons(delPortal({ weightKg: '8' }))).toContain('Indica peso: 8 kg');
    });

    it('sin kilos (o a cero) el portal no avisa por peso', () => {
        expect(getIrregularReasons(delPortal({ weightKg: null }))).toEqual([]);
        expect(getIrregularReasons(delPortal({ weightKg: 0 }))).toEqual([]);
        expect(getIrregularReasons(delPortal({ weightKg: '' }))).toEqual([]);
    });

    it('los kilos que teclea la oficina o un conductor no son novedad', () => {
        expect(getIrregularReasons(delPortal({ createdBy: 'Administrador', weightKg: 40 }))).toEqual([]);
        expect(getIrregularReasons(delPortal({ createdBy: 'Cond.Paco ', weightKg: 40 }))).toEqual([]);
        expect(getIrregularReasons(delPortal({ createdBy: 'Admin (Import Excel: Pepe)', weightKg: 40 }))).toEqual([]);
    });

    it('el aviso desaparece al marcarlo como visto', () => {
        expect(getIrregularReasons(delPortal({ weightKg: 12, notificationDismissed: true }))).toEqual([]);
    });

    it('vieneDelPortal reconoce las dos marcas del creador', () => {
        expect(vieneDelPortal({ createdBy: 'ClienteWeb: X' })).toBe(true);
        expect(vieneDelPortal({ createdBy: 'Portal Cliente' })).toBe(true);
        expect(vieneDelPortal({ createdBy: 'Administrador' })).toBe(false);
        expect(vieneDelPortal({})).toBe(false);
    });
});

describe('importeParaMostrar · la columna Valor con un solo formato', () => {
    it('lo que se teclea al editar ("6") sale como al crear ("€6.00")', () => {
        expect(importeParaMostrar('6')).toBe('€6.00');
        expect(importeParaMostrar(6)).toBe('€6.00');
        expect(importeParaMostrar('€3.00')).toBe('€3.00');
        expect(importeParaMostrar('12,5')).toBe('€12.50');
    });

    it('lo que no es un importe se deja tal cual', () => {
        expect(importeParaMostrar('Tarifa')).toBe('Tarifa');
        expect(importeParaMostrar('')).toBe('');
        expect(importeParaMostrar(null)).toBe('');
    });
});

describe('poblacionYCalle', () => {
    it('saca la población del último tramo y le quita el código postal', () => {
        expect(poblacionYCalle('C/ FRESADORES S/N-POL. LOS SANTOS, 14900 Lucena'))
            .toEqual({ ciudad: 'Lucena', calle: 'C/ FRESADORES S/N-POL. LOS SANTOS' });
    });

    it('prefiere la población grabada en el envío', () => {
        expect(poblacionYCalle('Avda. de Andalucía 12, 14800 Priego de Córdoba', 'Priego de Córdoba'))
            .toEqual({ ciudad: 'Priego de Córdoba', calle: 'Avda. de Andalucía 12' });
    });

    it('con la calle vacía sigue enseñando la población', () => {
        expect(poblacionYCalle(', 14800 Priego de Córdoba'))
            .toEqual({ ciudad: 'Priego de Córdoba', calle: '' });
        expect(poblacionYCalle('14500 Puente Genil'))
            .toEqual({ ciudad: 'Puente Genil', calle: '' });
    });

    it('sin comas ni código postal lo trata todo como población', () => {
        expect(poblacionYCalle('Rute')).toEqual({ ciudad: 'Rute', calle: '' });
        expect(poblacionYCalle('', 'Cabra')).toEqual({ ciudad: 'Cabra', calle: '' });
        expect(poblacionYCalle('')).toEqual({ ciudad: '', calle: '' });
    });
});

// ── El enlace con NUESTRA ficha del destinatario (fase 21) ──
// El envío guarda lo que tecleó el cliente; el repartidor tiene que ver el nombre
// comercial de la oficina, con sus señas, y el portal el texto del cliente.
describe('fichaDelDestinatario / nombreDestinatarioEnRuta', () => {
    const cartera = [
        { id: 101, name: 'Ferretería Pérez e Hijos S.L. (la del polígono)', branches: [
            { id: 'sede-2', name: 'Ferretería Pérez · almacén' },
        ] },
        { id: 102, name: 'Otra Empresa' },
    ];

    it('sin enlace, el repartidor ve lo que tecleó el cliente', () => {
        const envio = { destinationName: 'Ferretería Pérez', client: 'Remitente S.A.' };
        expect(fichaDelDestinatario(envio, cartera)).toBeNull();
        expect(nombreDestinatarioEnRuta(envio, cartera)).toBe('Ferretería Pérez');
    });

    it('con enlace, el repartidor ve el nombre comercial de la ficha', () => {
        const envio = { destinationName: 'Ferretería Pérez', destinatarioId: 101 };
        expect(fichaDelDestinatario(envio, cartera)).toEqual({ client: cartera[0], branch: null });
        expect(nombreDestinatarioEnRuta(envio, cartera)).toBe('Ferretería Pérez e Hijos S.L. (la del polígono)');
    });

    it('el id vale como número o como texto: la base lo guarda de una forma y la app de otra', () => {
        const envio = { destinationName: 'Ferretería Pérez', destinatarioId: '101' };
        expect(nombreDestinatarioEnRuta(envio, cartera)).toBe('Ferretería Pérez e Hijos S.L. (la del polígono)');
    });

    it('si el enlace es a una sede, manda el nombre de la sede', () => {
        const envio = { destinationName: 'Ferretería Pérez', destinatarioId: 101, destinatarioSedeId: 'sede-2' };
        expect(fichaDelDestinatario(envio, cartera)).toEqual({ client: cartera[0], branch: cartera[0].branches[0] });
        expect(nombreDestinatarioEnRuta(envio, cartera)).toBe('Ferretería Pérez · almacén');
    });

    it('una sede que ya no existe cae en la ficha madre, no en el texto del envío', () => {
        const envio = { destinationName: 'Ferretería Pérez', destinatarioId: 101, destinatarioSedeId: 'borrada' };
        expect(fichaDelDestinatario(envio, cartera)).toEqual({ client: cartera[0], branch: null });
        expect(nombreDestinatarioEnRuta(envio, cartera)).toBe('Ferretería Pérez e Hijos S.L. (la del polígono)');
    });

    it('si la ficha enlazada no está cargada, se queda con el texto del envío', () => {
        const envio = { destinationName: 'Ferretería Pérez', destinatarioId: 999 };
        expect(fichaDelDestinatario(envio, cartera)).toBeNull();
        expect(nombreDestinatarioEnRuta(envio, cartera)).toBe('Ferretería Pérez');
    });

    it('un envío sin destinatario ni enlace no se casa con nadie por un id vacío', () => {
        expect(fichaDelDestinatario({ destinatarioId: null }, [{ id: null, name: 'Rara' }])).toBeNull();
        expect(fichaDelDestinatario({ destinatarioId: '' }, [{ id: '', name: 'Rara' }])).toBeNull();
        expect(nombreDestinatarioEnRuta(null, cartera)).toBe('');
    });

    it('el portal sigue reconociendo al destinatario por el enlace', () => {
        const envio = { destinationName: 'Ferretería Pérez', client: 'Remitente S.A.', destinatarioId: 101, porteType: 'Pagado' };
        expect(papelDelClienteEnElEnvio(envio, cartera[0])).toBe('Destinatario');
    });
});
