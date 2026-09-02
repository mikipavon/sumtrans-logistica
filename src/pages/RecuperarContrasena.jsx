// ── El cliente se pone su propia contraseña ──
//
// Hasta ahora, un cliente que olvidaba su contraseña sólo podía llamar a la
// oficina, y la oficina no podía "recordársela" porque no existe en ningún
// sitio: la ficha no la guarda y Auth conserva sólo una huella cifrada. Lo
// único posible era ponerle otra y dictársela por teléfono.
//
// Con esto deja de depender de nadie: pide un enlace, llega a esta pantalla y
// escribe la que quiera. Las condiciones se ven ANTES de escribir y el botón no
// se activa hasta que se cumplen, que es lo que evita la llamada de después.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
    CONDICIONES,
    loQueLeFaltaALaContrasena,
    contrasenaValida,
    explicarFalloDeAuth,
} from '../utils/reglasContrasena';

export default function RecuperarContrasena({ onListo }) {
    const [password, setPassword] = useState('');
    const [repetida, setRepetida] = useState('');
    const [verla, setVerla] = useState(false);
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [hecho, setHecho] = useState(false);

    // Sólo se enseña cuando ya ha escrito algo: regañar por una casilla vacía
    // que aún no ha tocado es ruido.
    const falta = password ? loQueLeFaltaALaContrasena(password) : null;
    const noCoinciden = repetida.length > 0 && password !== repetida;
    const puedeGuardar = contrasenaValida(password) && password === repetida && !guardando;

    const guardar = async () => {
        setError('');
        setGuardando(true);
        try {
            const { error: fallo } = await supabase.auth.updateUser({ password });
            if (fallo) {
                setError(explicarFalloDeAuth(fallo.message));
                return;
            }
            setHecho(true);
        } catch (e) {
            console.error('[Recuperar] Error cambiando la contraseña:', e);
            setError('No se ha podido conectar. Inténtalo de nuevo en un momento.');
        } finally {
            setGuardando(false);
        }
    };

    if (hecho) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-10 text-center">
                    <CheckCircle className="mx-auto text-emerald-500 mb-4" size={48} />
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Contraseña cambiada</h1>
                    <p className="text-slate-500 text-sm mb-8">
                        Ya puedes entrar en tu portal con la contraseña nueva.
                    </p>
                    <button
                        onClick={onListo}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-xl transition-colors"
                    >
                        Ir a la pantalla de entrada
                    </button>
                </div>
            </div>
        );
    }

    const campoCls = 'w-full px-5 py-3.5 rounded-xl border border-slate-200 focus:border-transparent focus:ring-2 focus:ring-emerald-200 outline-none transition-all shadow-sm bg-slate-50 focus:bg-white';

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-10">
                <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white mb-4">
                    <Lock size={24} />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Elige tu contraseña</h1>
                <p className="text-slate-500 text-sm mb-6">
                    La que escribas aquí será con la que entres a partir de ahora.
                </p>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100 mb-5">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-sm font-bold text-slate-600 ml-1">Contraseña nueva</label>
                        <div className="relative">
                            <input
                                type={verla ? 'text' : 'password'}
                                autoComplete="new-password"
                                className={campoCls}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setVerla(!verla)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                                aria-label={verla ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {verla ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>

                        {/* Las condiciones, siempre a la vista. Es lo que evita que se
                            escriba algo que el servidor va a rechazar después. */}
                        <ul className="mt-2 space-y-1">
                            {CONDICIONES.map((c, i) => (
                                <li key={i} className="text-[11px] text-slate-500 flex gap-1.5">
                                    <span className="text-slate-300">•</span>{c}
                                </li>
                            ))}
                        </ul>

                        {falta && (
                            <p className="text-xs text-red-600 font-bold mt-2">{falta}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-sm font-bold text-slate-600 ml-1">Repítela</label>
                        <input
                            type={verla ? 'text' : 'password'}
                            autoComplete="new-password"
                            className={campoCls}
                            value={repetida}
                            onChange={e => setRepetida(e.target.value)}
                        />
                        {noCoinciden && (
                            <p className="text-xs text-red-600 font-bold mt-1">Las dos contraseñas no son iguales.</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={guardar}
                        disabled={!puedeGuardar}
                        className={`w-full font-bold py-4 rounded-xl transition-all shadow-lg ${puedeGuardar
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white active:scale-95'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}
                    >
                        {guardando ? 'Guardando...' : 'Guardar contraseña'}
                    </button>
                </div>
            </div>
        </div>
    );
}

RecuperarContrasena.propTypes = {
    onListo: PropTypes.func,
};
