// La lista de cobros del día del repartidor, la misma en todos sus aparatos.
//
// Vive en tres sitios: el estado de la pantalla, el localStorage del aparato
// (para que aguante sin cobertura y al cerrar la app) y la fila del conductor
// en la nube (`collectedCollections_AAAA-MM-DD`), que es de donde la leen la
// oficina y los demás aparatos.
//
// Antes cada aparato sólo la juntaba con la de la nube al abrir la app y, al
// apuntar un cobro, subía la suya ENTERA. Un porte cobrado desde el ordenador
// de la oficina (entrando como el repartidor) no le salía en la Cuenta al
// móvil, que ya estaba abierto, y el siguiente cobro del móvil lo borraba de la
// nube (01/10/2026). Ahora:
//   · lo que llega con la fila del conductor (Realtime, y el refresco de
//     conductores al volver a la app o recuperar cobertura) se junta con lo de
//     este aparato;
//   · a la nube se sube la UNIÓN con lo que ya hubiera, nunca la lista de este
//     aparato a secas.
// Ver utils/cobrosDelDia.js.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { unirCobros, leFaltanCobros } from '../utils/cobrosDelDia';

export const claveCobrosEnLaNube = (dia) => `collectedCollections_${dia}`;

const leerDatosDelConductor = async (conductorId) => {
    const { data: fila } = await supabase.from('drivers').select('data').eq('id', conductorId).single();
    return fila ? (fila.data || {}) : null;
};

const guardarDatosDelConductor = async (conductorId, datos) => {
    const { error } = await supabase.from('drivers').update({ data: datos }).eq('id', conductorId);
    if (error) throw error;
};

/**
 * @param {Object} p
 * @param {number|string} p.conductorId
 * @param {string} p.dia - 'AAAA-MM-DD'
 * @param {Array} [p.cobrosEnLaNube] - la lista de hoy tal como viene en la fila del conductor ya cargada
 * @returns {[Array, Function]} la lista y su setState, como useState
 */
export function useCobrosDelDia({
    conductorId,
    dia,
    cobrosEnLaNube,
    leerDatos = leerDatosDelConductor,
    guardarDatos = guardarDatosDelConductor,
}) {
    const [cobros, setCobros] = useState(() => {
        const saved = localStorage.getItem(`drv_collections_${conductorId}_${dia}`);
        return saved ? JSON.parse(saved) : [];
    });

    // Lo que apunta otro aparato. Si no trae nada nuevo, unirCobros devuelve la
    // misma lista y ni se repinta ni se vuelve a subir.
    useEffect(() => {
        setCobros(prev => unirCobros(prev, cobrosEnLaNube));
    }, [cobrosEnLaNube]);

    // Guardar en localStorage Y en la nube cada vez que cambian los cobros (y al
    // abrir la app, que es cuando se recoge lo que haya en la nube).
    useEffect(() => {
        const key = `drv_collections_${conductorId}_${dia}`;
        try { localStorage.setItem(key, JSON.stringify(cobros)); } catch (e) {
            console.warn("No se pudo guardar la colección localmente por límite de cuota iOS", e);
        }
        if (!conductorId) return;
        const clave = claveCobrosEnLaNube(dia);
        Promise.resolve(leerDatos(conductorId)).then((datos) => {
            if (!datos) return;
            const enLaNube = datos[clave];
            // Los que la nube tiene y este aparato no: se traen
            if (leFaltanCobros(cobros, enLaNube)) setCobros(prev => unirCobros(prev, enLaNube));
            // Los que este aparato tiene y la nube no: se suben junto a los suyos
            if (!leFaltanCobros(enLaNube, cobros)) return;
            const todos = unirCobros(enLaNube, cobros);
            return Promise.resolve(guardarDatos(conductorId, { ...datos, [clave]: todos }))
                .then(() => console.log('[Cobros] Guardado en Supabase:', todos.length, 'entradas'));
        }).catch(err => console.warn('[Cobros] Error sync Supabase:', err?.message));
    // leerDatos y guardarDatos no cambian (sólo se sustituyen en las pruebas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cobros, conductorId, dia]);

    return [cobros, setCobros];
}
