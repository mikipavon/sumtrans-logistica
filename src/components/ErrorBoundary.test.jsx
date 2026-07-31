import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const registrarError = vi.fn();
vi.mock('../utils/errorLog', () => ({ registrarError: (...args) => registrarError(...args) }));

import ErrorBoundary from './ErrorBoundary';

const Explota = () => { throw new Error('la lié'); };

let consolaError;
beforeEach(() => {
    registrarError.mockClear();
    // React escupe el error por consola aunque lo atrape el boundary.
    consolaError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consolaError.mockRestore());

describe('ErrorBoundary', () => {
    it('deja pasar lo de dentro cuando no hay error', () => {
        render(<ErrorBoundary><p>la ruta de hoy</p></ErrorBoundary>);
        expect(screen.getByText('la ruta de hoy')).toBeInTheDocument();
    });

    it('en vez de la página en blanco, enseña qué hacer', () => {
        render(<ErrorBoundary><Explota /></ErrorBoundary>);
        expect(screen.getByText('La aplicación se ha parado')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Volver a abrir' })).toBeInTheDocument();
    });

    // Lo importante: que en la oficina se enteren sin que llame nadie.
    it('deja constancia del error en la nube', () => {
        render(<ErrorBoundary origen="reparto"><Explota /></ErrorBoundary>);

        expect(registrarError).toHaveBeenCalledTimes(1);
        const [error, datos] = registrarError.mock.calls[0];
        expect(error.message).toBe('la lié');
        expect(datos.origen).toBe('reparto');
        expect(datos.componentStack).toContain('Explota');
    });

    it('el detalle técnico se puede leer, para poder dictarlo por teléfono', () => {
        render(<ErrorBoundary><Explota /></ErrorBoundary>);
        expect(screen.getByText(/la lié/)).toBeInTheDocument();
    });
});
