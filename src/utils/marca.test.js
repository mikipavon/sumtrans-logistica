import { describe, it, expect } from 'vitest';
import { esDeAgencia, resolverLogo, buscarClienteDeEnvio, LOGO_SUM } from './marca';

describe('esDeAgencia', () => {
    it('sin etiqueta o con la nuestra, es nuestro', () => {
        expect(esDeAgencia({ agencyLabel: 'SUM ESPECIAL' })).toBe(false);
        expect(esDeAgencia({ agencyLabel: '' })).toBe(false);
        expect(esDeAgencia({})).toBe(false);
    });

    it('una etiqueta de marca distinta de la nuestra es agencia', () => {
        expect(esDeAgencia({ agencyLabel: 'logistica_plus' })).toBe(true);
    });

    it('el logo propio del envío manda aunque la etiqueta sea la nuestra', () => {
        expect(esDeAgencia({ agencyLabel: 'SUM ESPECIAL', agencyLogoUrl: '/logos/otro.png' })).toBe(true);
        expect(esDeAgencia({ agencyLabel: 'SUM ESPECIAL', agencyLogoUrl: LOGO_SUM })).toBe(false);
    });

    // El caso que se colaba: la tarjeta pintaba el logo de TSB y el optimizador lo
    // metía en el bloque de los nuestros.
    it('detecta la agencia por la ficha del cliente, igual que la tarjeta', () => {
        const envio = { agencyLabel: 'SUM ESPECIAL', destinationName: 'Ferretería Paco' };
        const cliente = { name: 'Ferretería Paco', agencyLabel: 'tsb' };
        expect(esDeAgencia(envio, null)).toBe(false);
        expect(esDeAgencia(envio, cliente)).toBe(true);
    });

    it('detecta la agencia por el nombre', () => {
        expect(esDeAgencia({ client: 'XPO Logistics' })).toBe(true);
        expect(esDeAgencia({ destinationName: 'Almacén TSB Córdoba' })).toBe(true);
    });

    // La prioridad es otro eje: un cliente nuestro "normal" sigue siendo nuestro.
    it('la prioridad del cliente no convierte a nadie en agencia', () => {
        const cliente = { name: 'Mamaki', priority: 'normal' };
        expect(esDeAgencia({ destinationName: 'Mamaki', agencyLabel: 'SUM ESPECIAL' }, cliente)).toBe(false);
    });
});

describe('resolverLogo', () => {
    it('por defecto el de SUM', () => {
        expect(resolverLogo({ agencyLabel: 'SUM ESPECIAL' })).toBe(LOGO_SUM);
    });

    it('el logo del envío tiene preferencia', () => {
        expect(resolverLogo({ agencyLogoUrl: '/logos/propio.png' })).toBe('/logos/propio.png');
    });

    it('luego el del cliente y luego el de la agencia conocida', () => {
        expect(resolverLogo({}, { agencyLogoUrl: '/logos/cliente.png' })).toBe('/logos/cliente.png');
        expect(resolverLogo({ agencyLabel: 'tsb' })).toBe('/logos/tsb_logo.png');
    });

    it('el logo y el bloque de la ruta siempre están de acuerdo', () => {
        const casos = [
            [{ agencyLabel: 'SUM ESPECIAL' }, null],
            [{ agencyLabel: 'tsb' }, null],
            [{ agencyLabel: 'SUM ESPECIAL' }, { agencyLabel: 'xpo' }],
            [{ client: 'TXT Transportes' }, null],
        ];
        casos.forEach(([envio, cliente]) => {
            const agencia = esDeAgencia(envio, cliente);
            const logo = resolverLogo(envio, cliente);
            expect(agencia).toBe(logo !== LOGO_SUM);
        });
    });
});

describe('buscarClienteDeEnvio', () => {
    const clientes = [
        { name: 'Mamaki', legalName: 'Mamaki SL' },
        { name: 'Otro', agencyLabel: 'tsb' },
    ];

    it('encuentra por nombre y por razón social', () => {
        expect(buscarClienteDeEnvio({ destinationName: 'Mamaki' }, clientes)?.name).toBe('Mamaki');
        expect(buscarClienteDeEnvio({ client: 'Mamaki SL' }, clientes)?.name).toBe('Mamaki');
    });

    it('encuentra por etiqueta de marca compartida', () => {
        expect(buscarClienteDeEnvio({ agencyLabel: 'tsb' }, clientes)?.name).toBe('Otro');
    });

    it('no inventa clientes', () => {
        expect(buscarClienteDeEnvio({ destinationName: 'Nadie' }, clientes)).toBeNull();
        expect(buscarClienteDeEnvio({ agencyLabel: 'SUM ESPECIAL' }, clientes)).toBeNull();
    });
});
