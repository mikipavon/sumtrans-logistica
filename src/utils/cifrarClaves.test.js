import { describe, it, expect } from 'vitest';
import {
  crearComprobante,
  abrirConComprobante,
  cifrarClave,
  descifrarClave,
  validarNuevaLlaveMaestra,
} from './cifrarClaves';

describe('libreta de contraseñas cifrada', () => {
  it('la llave buena abre el comprobante y descifra lo guardado', async () => {
    const { comprobante, llave } = await crearComprobante('llave-de-la-oficina');
    const guardado = await cifrarClave(llave, 'Factusol#2026');

    expect(guardado.startsWith('v1.')).toBe(true);
    expect(guardado).not.toContain('Factusol');

    const reabierta = await abrirConComprobante('llave-de-la-oficina', comprobante);
    expect(reabierta).not.toBeNull();
    expect(await descifrarClave(reabierta, guardado)).toBe('Factusol#2026');
  });

  it('una llave equivocada no abre la libreta', async () => {
    const { comprobante } = await crearComprobante('llave-de-la-oficina');
    expect(await abrirConComprobante('otra-llave', comprobante)).toBeNull();
    expect(await abrirConComprobante('', comprobante)).toBeNull();
    expect(await abrirConComprobante('llave-de-la-oficina', 'basura')).toBeNull();
  });

  it('la misma contraseña cifrada dos veces no se parece', async () => {
    const { llave } = await crearComprobante('llave-de-la-oficina');
    expect(await cifrarClave(llave, 'igual')).not.toBe(await cifrarClave(llave, 'igual'));
  });

  it('pide una llave maestra larga y repetida igual', () => {
    expect(validarNuevaLlaveMaestra('corta', 'corta')).toMatch(/8 caracteres/);
    expect(validarNuevaLlaveMaestra('larga-larga', 'otra-cosa')).toMatch(/no coinciden/);
    expect(validarNuevaLlaveMaestra('larga-larga', 'larga-larga')).toBeNull();
  });
});
