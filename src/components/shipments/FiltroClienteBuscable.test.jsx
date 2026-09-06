import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FiltroClienteBuscable from './FiltroClienteBuscable';
import { SIN_FILTRO } from '../../utils/filtrosEnvios';

const opciones = ['ACEITES VIZCANTAR', 'AGROCOR BAENA', 'INDUSTRIAL LEKUE S.L.', 'PECOMARK S.A.'];

describe('FiltroClienteBuscable', () => {
    it('cerrado enseña "Todos los Clientes" y al escribir deja sólo los que contienen el texto', () => {
        const onChange = vi.fn();
        render(<FiltroClienteBuscable value={SIN_FILTRO} onChange={onChange} opciones={opciones} />);
        const input = screen.getByPlaceholderText('Todos los Clientes');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'lekue' } });
        expect(screen.getByText('INDUSTRIAL LEKUE S.L.')).toBeInTheDocument();
        expect(screen.queryByText('AGROCOR BAENA')).toBeNull();
        expect(screen.getByText('Todos los Clientes')).toBeInTheDocument();
    });

    it('con flecha abajo y Enter elige el primero que coincide', () => {
        const onChange = vi.fn();
        render(<FiltroClienteBuscable value={SIN_FILTRO} onChange={onChange} opciones={opciones} />);
        const input = screen.getByPlaceholderText('Todos los Clientes');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'agro' } });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('AGROCOR BAENA');
    });

    it('pinchar una opción la elige, y la X vuelve a todos', () => {
        const onChange = vi.fn();
        const { rerender } = render(<FiltroClienteBuscable value={SIN_FILTRO} onChange={onChange} opciones={opciones} />);
        fireEvent.focus(screen.getByPlaceholderText('Todos los Clientes'));
        fireEvent.mouseDown(screen.getByText('PECOMARK S.A.'));
        expect(onChange).toHaveBeenCalledWith('PECOMARK S.A.');

        rerender(<FiltroClienteBuscable value="PECOMARK S.A." onChange={onChange} opciones={opciones} />);
        expect(screen.getByDisplayValue('PECOMARK S.A.')).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByTitle('Quitar el filtro de cliente'));
        expect(onChange).toHaveBeenLastCalledWith(SIN_FILTRO);
    });

    it('avisa cuando nada coincide', () => {
        render(<FiltroClienteBuscable value={SIN_FILTRO} onChange={() => {}} opciones={opciones} />);
        const input = screen.getByPlaceholderText('Todos los Clientes');
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'zzz' } });
        expect(screen.getByText(/Ningún cliente contiene/)).toBeInTheDocument();
    });
});
