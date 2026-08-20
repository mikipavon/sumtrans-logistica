import { describe, it, expect } from 'vitest';
import { hashGhostPassword, verifyGhostPassword, validarNuevaGhostPassword } from './ghostPassword';

describe('contraseña del Modo Fantasma', () => {
  it('acepta la contraseña correcta', async () => {
    const guardado = await hashGhostPassword('Sumtrans2026');
    expect(await verifyGhostPassword('Sumtrans2026', guardado)).toBe(true);
  });

  it('rechaza cualquier otra', async () => {
    const guardado = await hashGhostPassword('Sumtrans2026');
    expect(await verifyGhostPassword('sumtrans2026', guardado)).toBe(false);
    expect(await verifyGhostPassword('Sumtrans202', guardado)).toBe(false);
    expect(await verifyGhostPassword('', guardado)).toBe(false);
  });

  it('no guarda la contraseña en ningún sitio del valor', async () => {
    const guardado = await hashGhostPassword('Sumtrans2026');
    expect(guardado).not.toContain('Sumtrans2026');
    expect(guardado.startsWith('pbkdf2$210000$')).toBe(true);
  });

  it('usa una sal distinta cada vez, así que dos iguales no se parecen', async () => {
    const a = await hashGhostPassword('misma');
    const b = await hashGhostPassword('misma');
    expect(a).not.toBe(b);
    expect(await verifyGhostPassword('misma', a)).toBe(true);
    expect(await verifyGhostPassword('misma', b)).toBe(true);
  });

  it('no revienta con valores corruptos o ausentes', async () => {
    for (const basura of [null, undefined, '', 'loquesea', 'pbkdf2$0$a$b', 'pbkdf2$1000$$', 'md5$1$a$b']) {
      expect(await verifyGhostPassword('x', basura)).toBe(false);
    }
  });

  it('valida la contraseña nueva', () => {
    expect(validarNuevaGhostPassword('12345', '12345')).toMatch(/al menos 6/);
    expect(validarNuevaGhostPassword('123456', '123457')).toMatch(/no coinciden/);
    expect(validarNuevaGhostPassword('123456', '123456')).toBeNull();
  });
});
