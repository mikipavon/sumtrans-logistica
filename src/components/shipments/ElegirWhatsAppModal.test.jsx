import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ElegirWhatsAppModal, { PUNTUAL } from './ElegirWhatsAppModal';

/**
 * La ventana de "Enviar Justificante", la misma para el repartidor y para la
 * oficina: las dos puntas siempre a la vista, y al teclear un número hay que
 * decir de quién es, sin nada marcado de antemano.
 */

// HAB-341: el remitente tiene móvil en la ficha, el destinatario sólo un fijo.
const LADOS = [
    { papel: 'Destinatario', nombre: 'DIESEL GAVILAN.S.L.', paga: false, moviles: [], tieneFijo: true, fijo: '957429207', destino: 'mobile', movilActual: '' },
    { papel: 'Remitente', nombre: 'FRANCISCO URBANO', paga: true, moviles: [{ numero: '616636299', papel: 'Remitente', nombre: 'FRANCISCO URBANO', paga: true }], tieneFijo: false, fijo: '', destino: 'sustituye', movilActual: '616636299' },
];

// Simula el useState de quien la abre: onChange admite valor o función.
const pintar = (inicial) => {
    let prompt = inicial;
    const onChange = vi.fn((v) => { prompt = typeof v === 'function' ? v(prompt) : v; });
    const onElegirOpcion = vi.fn();
    const onEnviarTecleado = vi.fn();
    const props = () => ({ prompt, onChange, onElegirOpcion, onEnviarTecleado });
    const vista = render(<ElegirWhatsAppModal {...props()} />);
    const repintar = () => vista.rerender(<ElegirWhatsAppModal {...props()} />);
    return { onChange, onElegirOpcion, onEnviarTecleado, repintar, prompt: () => prompt };
};

describe('ElegirWhatsAppModal', () => {
    it('cerrada no pinta nada', () => {
        render(<ElegirWhatsAppModal prompt={null} onChange={() => {}} onElegirOpcion={() => {}} onEnviarTecleado={() => {}} />);
        expect(screen.queryByText('Enviar Justificante')).toBeNull();
    });

    it('enseña las dos puntas: la que tiene móvil con el número y la que no con "Añadir teléfono"', () => {
        pintar({ lados: LADOS, editando: false, phone: '', deQuien: null });
        expect(screen.getByText('616636299')).toBeTruthy();
        expect(screen.getByText(/Remitente/).textContent).toContain('PAGA EL PORTE');
        expect(screen.getByText(/Destinatario/).textContent).toContain('SIN IMPORTES');
        expect(screen.getByText(/957429207 es un fijo/).textContent).toContain('Añadir teléfono');
    });

    it('al pulsar un móvil avisa con la opción entera (número y si paga)', () => {
        const { onElegirOpcion } = pintar({ lados: LADOS, editando: false, phone: '', deQuien: null });
        fireEvent.click(screen.getByText('616636299'));
        expect(onElegirOpcion).toHaveBeenCalledWith(LADOS[1].moviles[0]);
    });

    it('"Añadir teléfono" y "Enviar a otro número" llevan al teclado sin nadie marcado', () => {
        const { repintar, prompt } = pintar({ lados: LADOS, editando: false, phone: '', deQuien: null });
        fireEvent.click(screen.getByText(/Añadir teléfono/));
        expect(prompt()).toMatchObject({ editando: true, deQuien: null });
        repintar();
        expect(screen.getByPlaceholderText('Ej: 600123456')).toBeTruthy();
        // Ninguna opción marcada de antemano.
        screen.getAllByRole('radio').forEach(r => expect(r.getAttribute('aria-checked')).toBe('false'));
        fireEvent.click(screen.getByText('Volver'));
        expect(prompt().editando).toBe(false);
        repintar();
        fireEvent.click(screen.getByText('Enviar a otro número'));
        expect(prompt()).toMatchObject({ editando: true, deQuien: null });
    });

    it('no envía sin número ni sin decir de quién es', () => {
        const { onEnviarTecleado, repintar, prompt } = pintar({ lados: LADOS, editando: true, phone: '', deQuien: null });
        fireEvent.click(screen.getByText('Abrir WhatsApp'));
        expect(onEnviarTecleado).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('Escribe el número');

        fireEvent.change(screen.getByPlaceholderText('Ej: 600123456'), { target: { value: '655443322' } });
        repintar();
        fireEvent.click(screen.getByText('Abrir WhatsApp'));
        expect(onEnviarTecleado).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('de quién es');
        expect(prompt().phone).toBe('655443322');
    });

    it('con el destinatario marcado avisa de que se guarda y envía con ese papel', () => {
        const { onEnviarTecleado, repintar, prompt } = pintar({ lados: LADOS, editando: true, phone: '655443322', deQuien: null });
        fireEvent.click(screen.getByRole('radio', { name: /Destinatario/ }));
        expect(prompt().deQuien).toBe('Destinatario');
        repintar();
        expect(screen.getByText('Se guarda en su ficha')).toBeTruthy();
        fireEvent.click(screen.getByText('Guardar y abrir WhatsApp'));
        expect(onEnviarTecleado).toHaveBeenCalledWith({ phone: '655443322', deQuien: 'Destinatario' });
    });

    it('con la ficha llena avisa de qué móvil va a sustituir', () => {
        pintar({ lados: LADOS, editando: true, phone: '655443322', deQuien: 'Remitente' });
        expect(screen.getByText('Ficha llena: sustituye a su móvil 616636299')).toBeTruthy();
    });

    it('"Sólo este envío" no guarda y el botón lo dice', () => {
        const { onEnviarTecleado, repintar } = pintar({ lados: LADOS, editando: true, phone: '655443322', deQuien: null });
        fireEvent.click(screen.getByRole('radio', { name: /Sólo este envío/ }));
        repintar();
        fireEvent.click(screen.getByText('Abrir WhatsApp'));
        expect(onEnviarTecleado).toHaveBeenCalledWith({ phone: '655443322', deQuien: PUNTUAL });
    });

    it('con Enter también se envía, salvo mientras está guardando', () => {
        const { onEnviarTecleado } = pintar({ lados: LADOS, editando: true, phone: '655443322', deQuien: PUNTUAL, saving: true });
        fireEvent.keyDown(screen.getByPlaceholderText('Ej: 600123456'), { key: 'Enter' });
        expect(onEnviarTecleado).not.toHaveBeenCalled();
        expect(screen.getByText('Guardando...')).toBeTruthy();
    });

    it('sin ningún móvil en las dos puntas, el botón de la izquierda es Cancelar', () => {
        const sinMoviles = LADOS.map(l => ({ ...l, moviles: [] }));
        const { prompt } = pintar({ lados: sinMoviles, editando: true, phone: '', deQuien: null });
        fireEvent.click(screen.getByText('Cancelar'));
        expect(prompt()).toBeNull();
    });
});
