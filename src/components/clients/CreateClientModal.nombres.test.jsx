// ── La pestaña «Nombres» de la ficha ──
//
// Cómo escriben a esta empresa en los albaranes. Casan igual que el nombre
// comercial (ver utils/otrosNombres.js) pero no son sedes: no llevan dirección
// ni salen como "7 sedes" en la lista de clientes.

import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CreateClientModal from './CreateClientModal';

vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));

const agrocor = { id: 7, name: 'AGROCOR TORRECILLA', legalName: 'COMERCIAL AGROCOR S.A.', otrosNombres: ['AGROCOR'] };

function abrirFicha(initialData, onSave = vi.fn()) {
    render(
        <CreateClientModal
            isOpen
            onClose={vi.fn()}
            onSave={onSave}
            initialData={initialData}
            articles={[]}
            tariffs={[]}
            allPoblaciones={[]}
            allClients={[initialData]}
        />
    );
    fireEvent.click(screen.getByRole('button', { name: /^Nombres$/ }));
}

describe('CreateClientModal — otros nombres', () => {
    it('enseña los que ya tiene y deja añadir uno más sin repetir', () => {
        abrirFicha(agrocor);

        expect(screen.getByText('AGROCOR')).toBeInTheDocument();

        const casilla = screen.getByLabelText('Otro nombre');
        fireEvent.change(casilla, { target: { value: '  Comercial Agrocor  ' } });
        fireEvent.click(screen.getByRole('button', { name: /Añadir/ }));
        expect(screen.getByText('Comercial Agrocor')).toBeInTheDocument();
        expect(casilla).toHaveValue('');

        // Uno que ya responde (la razón social, sin mayúsculas) no se añade.
        fireEvent.change(casilla, { target: { value: 'comercial agrocor s.a.' } });
        fireEvent.click(screen.getByRole('button', { name: /Añadir/ }));
        expect(screen.getAllByRole('button', { name: /^Quitar / })).toHaveLength(2);
    });

    it('Intro en la casilla añade el nombre, no guarda la ficha', () => {
        const onSave = vi.fn();
        abrirFicha(agrocor, onSave);

        const casilla = screen.getByLabelText('Otro nombre');
        fireEvent.change(casilla, { target: { value: 'Agrocor Sur' } });
        fireEvent.keyDown(casilla, { key: 'Enter', code: 'Enter' });

        expect(screen.getByText('Agrocor Sur')).toBeInTheDocument();
        expect(casilla).toHaveValue('');
        expect(onSave).not.toHaveBeenCalled();
    });

    it('quitar uno lo saca de la lista, y al guardar van los que quedan', () => {
        const onSave = vi.fn();
        abrirFicha({ ...agrocor, otrosNombres: ['AGROCOR', 'AGROCOR CORDOBA'] }, onSave);

        fireEvent.click(screen.getByRole('button', { name: 'Quitar AGROCOR' }));
        expect(screen.queryByText('AGROCOR')).not.toBeInTheDocument();
        expect(screen.getByText('AGROCOR CORDOBA')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
        expect(onSave).toHaveBeenCalled();
        expect(onSave.mock.calls[0][0].otrosNombres).toEqual(['AGROCOR CORDOBA']);
    });

    it('sin otros nombres lo dice, y no cuenta como sede', () => {
        abrirFicha({ id: 8, name: 'TALLERES PEREZ' });

        expect(screen.getByText('Sin otros nombres')).toBeInTheDocument();
        const pestanaSedes = screen.getByRole('button', { name: /^Sedes$/ });
        expect(within(pestanaSedes).queryByText(/\d/)).not.toBeInTheDocument();
    });
});
