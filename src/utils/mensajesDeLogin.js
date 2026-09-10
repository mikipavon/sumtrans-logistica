// ── Cómo se le dice a alguien que no ha entrado ──
//
// Vive fuera de la pantalla de login porque lo dicen dos caminos distintos —el
// formulario que se rellena a mano y el auto-login del portal embebido en
// sumtransportes.com— y los dos tienen que decir lo mismo. Cuando cada uno se
// escribía su texto, el mismo fallo se contaba de dos maneras según por dónde
// se hubiera entrado.
//
// Ojo con lo que NO va aquí: los fallos del servidor. Ésos traen su propio
// mensaje desde topeDeTiempo.js y hay que dejarlo pasar tal cual, porque lo
// primero que dicen es que no es cosa de la contraseña.
export const mensajeDeCredenciales = (tab) =>
    tab === 'driver' ? 'Usuario o contraseña incorrectos' : 'Credenciales inválidas';
