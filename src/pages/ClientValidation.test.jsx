// ── Que un registro de la web se distinga de lo que crea la app sola ──
//
// En "Validar Clientes" caen mezcladas dos cosas: las fichas que nacen al hacer
// un albarán o una entrega (decenas, no las ha pedido nadie) y las empresas que
// se registran en el formulario de la web (las que están esperando respuesta).
// Se veían exactamente igual, y la tarjeta no enseñaba correo, CIF ni persona
// de contacto, así que no había forma de saber QUIÉN se había registrado.

import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClientValidation from './ClientValidation';

// El modal de alta arrastra medio proyecto y aquí no se abre nunca.
vi.mock('../components/clients/CreateClientModal', () => ({
    default: () => null,
}));

const registroWeb = {
    id: 1,
    name: 'PANADERÍA LA ESPIGA',
    legalName: 'LA ESPIGA SL',
    status: 'pending',
    type: 'Remitente',
    createdFrom: 'web-registro',
    createdAt: '2026-08-17T09:30:00.000Z',
    email: 'pedidos@laespiga.com',
    cif: 'B14567890',
    contactPerson: 'Ana Ruiz',
    city: 'Cabra',
    phone: '957000111',
};

const creadoEnAlbaran = {
    id: 2,
    name: 'FERRETERÍA EL TORNILLO',
    status: 'pending',
    type: 'Destinatario',
    createdFrom: 'Albarán',
    lastInteraction: '2026-08-16',
    city: 'Lucena',
};

// Estas pruebas miran la tarjeta entera. La lista compacta (la vista por
// defecto) tiene las suyas al final.
beforeEach(() => localStorage.setItem('validacion-vista', 'tarjetas'));

const props = {
    onValidateClient: vi.fn(),
    onUpdateClient: vi.fn(),
    onDeleteClients: vi.fn(),
    articles: [],
    tariffs: [],
    allPoblaciones: [],
};

describe('Validar Clientes — quién se ha registrado por la web', () => {
    it('al entrar enseña sólo las fichas de albarán, no los registros de la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
        expect(screen.queryByText('PANADERÍA LA ESPIGA')).not.toBeInTheDocument();
    });

    it('en «Registrados en la web» salen los de la web y no las fichas de albarán', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.queryByText('FERRETERÍA EL TORNILLO')).not.toBeInTheDocument();
    });

    it('la tarjeta del registro web identifica a quien se ha dado de alta', () => {
        render(<ClientValidation clients={[registroWeb]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        expect(screen.getByText('Se ha registrado en la web')).toBeInTheDocument();
        // Lo que hace falta para reconocer la empresa y llamarla.
        expect(screen.getByText('pedidos@laespiga.com')).toBeInTheDocument();
        expect(screen.getByText('B14567890')).toBeInTheDocument();
        expect(screen.getByText('Ana Ruiz')).toBeInTheDocument();
        expect(screen.getByText('LA ESPIGA SL')).toBeInTheDocument();
        // Y cuándo lo hizo, con la hora: `createdAt` en vez del día suelto.
        expect(screen.getByText(/17\/08\/2026/)).toBeInTheDocument();
    });

    it('con «Todos» vuelven a salir también las fichas creadas al hacer albaranes', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Todos/ }));

        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
    });

    it('si al entrar no hay fichas de albarán, avisa de los que esperan en la web', () => {
        render(<ClientValidation clients={[registroWeb]} {...props} />);

        // Se entra por «Creados al hacer albaranes» y ahí no hay nada: sin este
        // aviso la pantalla parecería vacía teniendo a alguien esperando.
        expect(screen.getByText(/En «Registrados en la web» esperan 1/)).toBeInTheDocument();
    });

    it('la ficha creada en un albarán no finge ser un registro de la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran]} {...props} />);

        // El filtro arranca en «Creados al hacer albaranes», así que ya se ve.
        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
        expect(screen.queryByText('Se ha registrado en la web')).not.toBeInTheDocument();

        // Y el filtro de web avisa de que no hay nadie, en vez de decir que
        // ningún cliente coincide con una búsqueda que no se ha escrito.
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));
        expect(screen.getByText(/Nadie se ha registrado por la web/)).toBeInTheDocument();
    });

    it('el buscador encuentra por correo y por CIF, no sólo por nombre', () => {
        const otroWeb = { ...registroWeb, id: 3, name: 'BODEGAS MONTILLA', email: 'admin@bodegas.com', cif: 'B99999999', contactPerson: '', legalName: '' };
        render(<ClientValidation clients={[registroWeb, otroWeb]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        const buscador = screen.getByPlaceholderText(/Buscar por nombre/);
        fireEvent.change(buscador, { target: { value: 'pedidos@laespiga' } });
        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.queryByText('BODEGAS MONTILLA')).not.toBeInTheDocument();

        fireEvent.change(buscador, { target: { value: 'B99999999' } });
        expect(screen.getByText('BODEGAS MONTILLA')).toBeInTheDocument();
        expect(screen.queryByText('PANADERÍA LA ESPIGA')).not.toBeInTheDocument();
    });

    it('los registros web salen antes que las fichas de albarán, y el último arriba', () => {
        const webAntiguo = { ...registroWeb, id: 4, name: 'WEB VIEJA', createdAt: '2026-08-10T08:00:00.000Z' };
        render(<ClientValidation clients={[creadoEnAlbaran, webAntiguo, registroWeb]} {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /Todos/ }));

        const nombres = screen.getAllByTitle(/PANADERÍA LA ESPIGA|WEB VIEJA|FERRETERÍA EL TORNILLO/)
            .map(el => el.textContent);
        expect(nombres).toEqual(['PANADERÍA LA ESPIGA', 'WEB VIEJA', 'FERRETERÍA EL TORNILLO']);
    });

    it('el contador del encabezado dice cuántos se han registrado por la web', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        const chip = screen.getByText('registrados en la web').closest('div');
        expect(within(chip).getByText('1')).toBeInTheDocument();
    });

    // ── Que los de la web no se pasen ──
    //
    // Se entra por «Creados al hacer albaranes» y ahí los registros de la web ni
    // salen; y en «Todos», entre decenas de fichas ámbar, el icono azul no se
    // distinguía. Lo que los señala parpadea: el botón del encabezado y un
    // aviso en la pestaña por defecto mientras no se estén viendo, y la chapa
    // de cada ficha en la fila y en la tarjeta.

    it('desde la pestaña por defecto, el botón del encabezado y el aviso parpadean', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);

        expect(screen.getByRole('button', { name: /^1registrados en la web/ })).toHaveClass('animate-parpadeo-web');
        const aviso = screen.getByRole('button', { name: /Hay 1 empresa registrada en la web esperando respuesta/ });
        expect(aviso).toHaveClass('animate-parpadeo-web');

        // Al pinchar el aviso se ven, y entonces ya no hace falta que parpadee nada arriba.
        fireEvent.click(aviso);
        expect(screen.getByText('PANADERÍA LA ESPIGA')).toBeInTheDocument();
        expect(screen.queryByText(/esperando respuesta/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^1registrados en la web/ })).not.toHaveClass('animate-parpadeo-web');
    });

    it('sin registros de la web no hay aviso ni nada que parpadee', () => {
        render(<ClientValidation clients={[creadoEnAlbaran]} {...props} />);

        expect(screen.queryByText(/esperando respuesta/)).not.toBeInTheDocument();
        expect(document.querySelector('.animate-parpadeo-web')).toBeNull();
    });

    it('la chapa del registro web parpadea en la tarjeta, y la ficha de albarán no', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /^Todos/ }));

        expect(screen.getByText('Se ha registrado en la web')).toHaveClass('animate-parpadeo-web');
        const tarjeta = screen.getByText('FERRETERÍA EL TORNILLO').closest('.rounded-xl');
        expect(tarjeta.querySelector('.animate-parpadeo-web')).toBeNull();
    });

    it('en la lista, la fila del registro web también lleva la chapa parpadeando', () => {
        localStorage.setItem('validacion-vista', 'lista');
        render(<ClientValidation clients={[creadoEnAlbaran, registroWeb]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /^Todos/ }));

        expect(screen.getByText('Se ha registrado en la web')).toHaveClass('animate-parpadeo-web');
    });
});

// ── La ficha que nació en una entrega y que ya teníamos con otro nombre ──
//
// El conductor entrega a "FERRETERIA EL REPUESTO, S.L." y la app no encuentra
// la ficha porque en cartera está como "FERRETERIA EL REPUESTO JOAQUIN SALIDO":
// crea una pendiente con el GPS. Rechazarla tira el GPS; aprobarla deja dos
// fichas. El botón del aviso rojo se queda con la de siempre.
describe('Validar Clientes — vincular la ficha del reparto con la de siempre', () => {
    const delReparto = {
        id: 388,
        name: 'FERRETERIA EL REPUESTO, S.L.',
        status: 'pending',
        type: 'Destinatario',
        createdFrom: 'Reparto (Driver)',
        createdBy: 'Cond.FRANCISCO JAVIER PAVON MAIZ',
        city: 'CASTRO DEL RIO',
        coordinates: '37.690619, -4.478713',
        lastInteraction: '2026-09-16',
    };
    const deSiempre = { id: 26, name: 'FERRETERIA EL REPUESTO JOAQUIN SALIDO', clientNumber: 'P-26', status: 'approved', type: 'Destinatario', city: 'CASTRO DEL RIO' };
    const albaran = { id: 'SUM-1426', destinationName: 'FERRETERIA EL REPUESTO, S.L.', destinatarioId: 388, originName: 'IBERMANGUERAS' };

    it('la ficha del reparto ofrece vincularse con la parecida de cartera, y la de la web no', () => {
        const webParecida = { ...registroWeb, id: 5, name: 'FERRETERIA EL REPUESTO SL' };
        render(<ClientValidation clients={[delReparto, webParecida, deSiempre]} {...props} onVincularFichaPendiente={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /^Todos/ }));

        expect(screen.getAllByText(/un nombre casi igual/)).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: 'Es esta ficha: vincular' })).toHaveLength(1);
        // El registro web no tiene botón de vincular: lo suyo es dar el acceso
        // (ver «otra persona de la misma empresa» más abajo).
        expect(screen.getAllByRole('button', { name: /Dar el acceso/ })).toHaveLength(1);
    });

    it('sin la función de App no se ofrece el botón', () => {
        render(<ClientValidation clients={[delReparto, deSiempre]} {...props} />);
        expect(screen.queryByRole('button', { name: 'Es esta ficha: vincular' })).not.toBeInTheDocument();
    });

    it('al pinchar explica qué va a pasar, y si se confirma vincula con la ficha de siempre', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const onVincularFichaPendiente = vi.fn().mockResolvedValue({ envios: 1, otroNombre: true });
        render(<ClientValidation clients={[delReparto, deSiempre]} shipments={[albaran]} {...props} onVincularFichaPendiente={onVincularFichaPendiente} />);

        fireEvent.click(screen.getByRole('button', { name: 'Es esta ficha: vincular' }));

        const texto = confirm.mock.calls[0][0];
        expect(texto).toContain('«FERRETERIA EL REPUESTO JOAQUIN SALIDO» (nº P-26)');
        expect(texto).toContain('se le apunta «FERRETERIA EL REPUESTO, S.L.» en «Otros nombres»');
        expect(texto).toContain('1 albarán pasa a apuntar a esa ficha');
        await vi.waitFor(() => expect(onVincularFichaPendiente).toHaveBeenCalledWith(delReparto, deSiempre));
        await vi.waitFor(() => expect(alerta).toHaveBeenCalledWith(expect.stringContaining('1 albarán apunta ya a esa ficha')));

        confirm.mockRestore();
        alerta.mockRestore();
    });

    it('si no se confirma, no se toca nada', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const onVincularFichaPendiente = vi.fn();
        render(<ClientValidation clients={[delReparto, deSiempre]} {...props} onVincularFichaPendiente={onVincularFichaPendiente} />);

        fireEvent.click(screen.getByRole('button', { name: 'Es esta ficha: vincular' }));
        expect(onVincularFichaPendiente).not.toHaveBeenCalled();
        confirm.mockRestore();
    });
});

// ── Otra persona de la misma empresa registrándose con su propio correo ──
//
// FRANALMCE (AHORA LA MEJOR COMPRA DE ELECTRODOMESTICOS S.L.) se registró en la
// web el 22/09/2026 y lo único que lo unía a la ficha nº 45 (ACTIVA LA MEJOR
// COMPRA DE ELECTRODOMESTICOS S.L., que ya entraba en el portal) era el nombre:
// ni el CIF ni el correo. Hasta entonces, con un parecido a secas no se ofrecía
// dar el acceso, y aprobarla dejaba dos fichas. Miguel quiso que se ofreciera:
// si es la misma empresa, ese correo se le AÑADE a la ficha de siempre como un
// acceso más, sin quitarle el suyo al que ya entraba.
describe('Validar Clientes — un registro web con nombre sólo parecido a una ficha con acceso', () => {
    const franalmce = {
        id: 700,
        name: 'FRANALMCE',
        legalName: 'AHORA LA MEJOR COMPRA DE ELECTRODOMESTICOS S.L.',
        status: 'pending',
        type: 'Remitente',
        createdFrom: 'web-registro',
        createdAt: '2026-09-22T12:16:00.000Z',
        email: 'comercialcordoba@ahoralamejorcompra.com',
        cif: 'B11111111',
        contactPerson: 'FRANCISCO JOSE CAÑAS GONZALEZ',
        city: 'CORDOBA',
    };
    // La razón social sin el "ACTIVA" es lo que hace que el nombre se parezca:
    // "AHORA" y "ACTIVA" no son una errata la una de la otra.
    const activa = {
        id: 45,
        name: 'ACTIVA LA MEJOR COMPRA DE ELECTRODOMESTICOS S.L.',
        legalName: 'LA MEJOR COMPRA DE ELECTRODOMESTICOS S.L.',
        clientNumber: '45',
        status: 'approved',
        type: 'Remitente',
        city: 'CORDOBA',
        cif: 'B22222222',
        email: 'admin@activa.com',
        tieneAccesoPortal: true,
    };

    it('ofrece darle el acceso a la ficha parecida, y el pie dice que el correo se añade', () => {
        render(<ClientValidation clients={[franalmce, activa]} {...props} onGrantAccessToExisting={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        expect(screen.getByText('Se parece a una ficha que ya tienes')).toBeInTheDocument();
        expect(screen.getByText('Esa ficha ya entra en el portal')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Dar el acceso a esta ficha' })).toBeInTheDocument();
        expect(screen.getByText(/ese correo se le añade a la ficha de siempre como un acceso más/)).toBeInTheDocument();
    });

    it('al pinchar avisa de que sólo se parecen los nombres y de que el acceso se añade; si se confirma, lo da', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
        const onGrantAccessToExisting = vi.fn().mockResolvedValue(true);
        render(<ClientValidation clients={[franalmce, activa]} {...props} onGrantAccessToExisting={onGrantAccessToExisting} />);
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        fireEvent.click(screen.getByRole('button', { name: 'Dar el acceso a esta ficha' }));

        const texto = confirm.mock.calls[0][0];
        expect(texto).toContain('«ACTIVA LA MEJOR COMPRA DE ELECTRODOMESTICOS S.L.» (nº 45)');
        expect(texto).toContain('Entrará con: comercialcordoba@ahoralamejorcompra.com');
        expect(texto).toContain('éste se le añade: entrarán los dos');
        expect(texto).toContain('sólo se parecen los nombres');
        await vi.waitFor(() => expect(onGrantAccessToExisting).toHaveBeenCalledWith(franalmce, activa));

        confirm.mockRestore();
        alerta.mockRestore();
    });

    it('si no se confirma, no se da ningún acceso', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const onGrantAccessToExisting = vi.fn();
        render(<ClientValidation clients={[franalmce, activa]} {...props} onGrantAccessToExisting={onGrantAccessToExisting} />);
        fireEvent.click(screen.getByRole('button', { name: /Registrados en la web/ }));

        fireEvent.click(screen.getByRole('button', { name: 'Dar el acceso a esta ficha' }));
        expect(onGrantAccessToExisting).not.toHaveBeenCalled();
        confirm.mockRestore();
    });
});

// ── La misma empresa, dos y tres veces en la lista ──
//
// Cada camino de alta creaba su propia ficha sin saber de las demás, así que en
// esta pantalla salían varias tarjetas del mismo cliente y ninguna entera: una
// con coordenadas y sin teléfono, otra al revés. No había ningún aviso, y
// aprobar a ojo significaba tirar lo que trajera la otra.
describe('Validar Clientes — solicitudes repetidas del mismo cliente', () => {
    const sinGps = {
        id: 10,
        name: 'BasicRoca',
        status: 'pending',
        type: 'Remitente',
        createdFrom: 'Albarán Automático',
        createdBy: 'Conductor',
        city: 'Cordoba',
        lastInteraction: '2026-08-20',
    };
    const conGps = {
        id: 11,
        name: 'BasicRoca',
        status: 'pending',
        type: 'Remitente',
        createdFrom: 'Albarán',
        createdBy: 'Cond.FRANCISCO JAVIER PAVON MAIZ',
        city: 'Cordoba',
        address: ', 14000 Cordoba',
        coordinates: '37.547904, -4.663849',
        lastInteraction: '2026-08-20',
    };
    const sola = { id: 12, name: 'Zuricar', status: 'pending', type: 'Destinatario', city: 'Espejo' };

    const renderLista = (extra = {}) =>
        render(<ClientValidation clients={[sinGps, conGps, sola]} {...props} {...extra} />);

    it('avisa en la tarjeta de cuántas solicitudes hay de ese cliente', () => {
        renderLista();
        const avisos = screen.getAllByText('Repetida: 2 solicitudes de este mismo cliente');
        // Una en cada una de las dos tarjetas de BasicRoca.
        expect(avisos).toHaveLength(2);
    });

    it('dice qué se gana al unirlas, para saber con cuál quedarse', () => {
        renderLista();
        // La que no tiene GPS gana el GPS de la otra; la que sí lo tiene no gana nada.
        expect(screen.getByText(/ésta se queda la dirección y las coordenadas/)).toBeInTheDocument();
        expect(screen.getByText('Las otras no aportan ningún dato que a ésta le falte.')).toBeInTheDocument();
    });

    it('no marca como repetida a la que no tiene pareja', () => {
        renderLista();
        const zuricar = screen.getByText('Zuricar').closest('div.bg-white');
        expect(within(zuricar).queryByText(/Repetida:/)).not.toBeInTheDocument();
    });

    it('al unir, copia los huecos en la que se queda y borra la otra', async () => {
        const onUpdateClient = vi.fn().mockResolvedValue();
        const onDeleteClients = vi.fn().mockResolvedValue();
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderLista({ onUpdateClient, onDeleteClients });

        // La tarjeta sin GPS: es la única que tiene algo que ganar al unir.
        const tarjetaSinGps = screen
            .getByText(/ésta se queda la dirección y las coordenadas/)
            .closest('div.bg-white');
        const boton = within(tarjetaSinGps).getByRole('button', { name: /unir las demás/i });
        fireEvent.click(boton);
        await screen.findByText('Zuricar');

        expect(onUpdateClient).toHaveBeenCalledWith(10, {
            address: ', 14000 Cordoba',
            coordinates: '37.547904, -4.663849',
        });
        expect(onDeleteClients).toHaveBeenCalledWith([11]);
        window.confirm.mockRestore();
    });

    it('el encabezado dice cuántos clientes están repetidos, no cuántas tarjetas sobran', () => {
        renderLista();
        const contador = screen.getByText('repetidos en la lista').closest('div');
        expect(within(contador).getByText('1')).toBeInTheDocument();
    });
});

// ── La lista compacta ──
//
// Con decenas de fichas de albarán la pantalla de tarjetas era un muro de
// recuadros. La lista enseña una fila por cliente con TODO lo de la tarjeta
// (conductor, ubicación, de quién es, avisos) sin tener que desplegar nada.
describe('Validar Clientes — vista de lista', () => {
    beforeEach(() => localStorage.setItem('validacion-vista', 'lista'));

    const sinGps = { id: 10, name: 'BasicRoca', status: 'pending', type: 'Remitente', createdFrom: 'Albarán', city: 'Cordoba', lastInteraction: '2026-08-20' };
    const conGps = { id: 11, name: 'BasicRoca', status: 'pending', type: 'Remitente', createdFrom: 'Albarán', createdBy: 'Cond. MANUEL', city: 'Cordoba', coordinates: '37.5, -4.6', lastInteraction: '2026-08-20' };
    const sola = { id: 12, name: 'Zuricar', status: 'pending', type: 'Destinatario', city: 'Espejo' };

    it('sin nada guardado sale la lista, con una fila por ficha', () => {
        localStorage.removeItem('validacion-vista');
        render(<ClientValidation clients={[sinGps, conGps, sola]} {...props} />);
        expect(screen.getByText('Zuricar')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Aprobar' })).toHaveLength(3);
        expect(screen.getAllByRole('button', { name: 'Editar y Validar' })).toHaveLength(3);
    });

    it('la fila enseña conductor, ubicación, de quién es y los avisos, como la tarjeta', () => {
        render(<ClientValidation clients={[sinGps, conGps, sola]} {...props} />);
        expect(screen.getByText('Por: Cond. MANUEL')).toBeInTheDocument();
        expect(screen.getByText('37.5, -4.6').closest('a')).toHaveAttribute('href', expect.stringContaining('google.com/maps'));
        expect(screen.getAllByText('Mis clientes')).toHaveLength(3);
        expect(screen.getAllByText('Repetida: 2 solicitudes de este mismo cliente')).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: /unir las demás/i })).toHaveLength(2);
    });

    it('los botones de la fila aprueban y rechazan igual que en la tarjeta', () => {
        const onValidateClient = vi.fn().mockResolvedValue();
        render(<ClientValidation clients={[sola]} {...props} onValidateClient={onValidateClient} />);
        fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
        expect(onValidateClient).toHaveBeenCalledWith(12, false);
    });

    it('el conmutador cambia a tarjetas y lo deja guardado', () => {
        render(<ClientValidation clients={[sola]} {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Tarjetas/ }));
        expect(screen.getByRole('button', { name: /Editar y Validar/ })).toHaveTextContent('Editar y Validar');
        expect(localStorage.getItem('validacion-vista')).toBe('tarjetas');
    });
});

// ── De quién venía el paquete ──
//
// Un destinatario que se apuntó solo al entregarle trae nombre y calle y poco
// más: así no hay forma de decidir si la ficha vale. Lo que lo identifica es
// quién le mandó la mercancía, y eso está en el albarán, no en la ficha.
describe('Validar Clientes — quién le mandó la mercancía', () => {
    const destinatario = { id: 20, name: 'José López', status: 'pending', type: 'Destinatario', createdFrom: 'Reparto (Driver)', city: 'Aguilar de la Frontera' };
    const remitente = { id: 21, name: 'PROSERVICE', status: 'pending', type: 'Remitente', createdFrom: 'Albarán', city: 'Cordoba' };
    const envio = {
        id: 'SUM-518',
        client: 'PROSERVICE',
        originName: 'PROSERVICE',
        destinationName: 'JOSE LOPEZ',
        date: '10 sept 2026',
        createdAt: '2026-09-10T07:00:00.000Z',
    };

    it('en la lista, la fila del destinatario dice de quién era el paquete', () => {
        localStorage.setItem('validacion-vista', 'lista');
        render(<ClientValidation clients={[destinatario]} shipments={[envio]} {...props} />);
        expect(screen.getByText(/Mercancía de:/)).toBeInTheDocument();
        expect(screen.getByText('PROSERVICE')).toBeInTheDocument();
        expect(screen.getByText('SUM-518')).toBeInTheDocument();
    });

    it('en la tarjeta también, y a un remitente le dice a quién se la mandó', () => {
        localStorage.setItem('validacion-vista', 'tarjetas');
        render(<ClientValidation clients={[remitente]} shipments={[envio]} {...props} />);
        expect(screen.getByText(/Mercancía para:/)).toBeInTheDocument();
        expect(screen.getByText('JOSE LOPEZ')).toBeInTheDocument();
    });

    it('el filtro «Mercancía de» deja sólo las fichas de esa empresa, también las del "y 1 más"', () => {
        localStorage.setItem('validacion-vista', 'lista');
        const otra = { id: 22, name: 'Bar Pepe', status: 'pending', type: 'Destinatario', createdFrom: 'Reparto (Driver)' };
        const envios = [
            envio,
            { ...envio, id: 'SUM-600', originName: 'TSB', client: 'TSB', destinationName: 'José López', createdAt: '2026-09-11T07:00:00.000Z' },
            { ...envio, id: 'SUM-601', originName: 'TSB', client: 'TSB', destinationName: 'BAR PEPE' },
        ];
        render(<ClientValidation clients={[destinatario, otra]} shipments={envios} {...props} />);
        const filtro = screen.getByRole('combobox', { name: /quién mandó la mercancía/ });
        expect(screen.getByRole('option', { name: 'TSB (2)' })).toBeInTheDocument();

        // PROSERVICE sólo sale como "y 1 más" en José López: aun así la encuentra.
        fireEvent.change(filtro, { target: { value: screen.getByRole('option', { name: 'PROSERVICE (1)' }).value } });
        expect(screen.getByText('José López')).toBeInTheDocument();
        expect(screen.queryByText('Bar Pepe')).not.toBeInTheDocument();

        fireEvent.change(filtro, { target: { value: screen.getByRole('option', { name: 'TSB (2)' }).value } });
        expect(screen.getByText('José López')).toBeInTheDocument();
        expect(screen.getByText('Bar Pepe')).toBeInTheDocument();
    });

    it('sin el albarán cargado no se enseña ninguna línea', () => {
        localStorage.setItem('validacion-vista', 'lista');
        render(<ClientValidation clients={[destinatario]} shipments={[]} {...props} />);
        expect(screen.queryByText(/Mercancía de:/)).not.toBeInTheDocument();
    });
});

describe('Validar Clientes — botón provisional de las revisadas con Google Maps', () => {
    // Talleres Clavellinas, una de las de la lista del 24/09/2026.
    const revisada = { id: 1789977593840, name: 'Talleres clavellinas', status: 'pending', type: 'Destinatario', createdFrom: 'Reparto (Driver)', city: 'Puente Genil' };

    it('filtra y deja sólo las revisadas, y al volver a pulsarlo salen todas', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, revisada]} {...props} />);
        const boton = screen.getByRole('button', { name: /revisadas con Google Maps/ });
        expect(boton).toHaveTextContent('1');

        fireEvent.click(boton);
        expect(screen.getByText('Talleres clavellinas')).toBeInTheDocument();
        expect(screen.queryByText('FERRETERÍA EL TORNILLO')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /revisadas con Google Maps/ }));
        expect(screen.getByText('FERRETERÍA EL TORNILLO')).toBeInTheDocument();
    });

    it('cuando ya están aprobadas, el botón desaparece solo', () => {
        render(<ClientValidation clients={[creadoEnAlbaran, { ...revisada, status: 'approved' }]} {...props} />);
        expect(screen.queryByRole('button', { name: /revisadas con Google Maps/ })).not.toBeInTheDocument();
    });
});
