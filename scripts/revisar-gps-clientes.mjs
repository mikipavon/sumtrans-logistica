/**
 * ¿Qué coordenadas de las fichas son buenas y cuáles son de las pruebas?
 *
 * Durante las pruebas, las fichas se dieron de alta EN LA NAVE, y el móvil les guardó
 * el GPS del momento: decenas de fichas de pueblos distintos con el mismo punto, el de
 * Cabra. Las que puso administración a mano son puntos sueltos, cada uno en su sitio.
 *
 * Aquí no se adivina por el número de decimales: se mira quién comparte punto con
 * quién. Un punto donde caen varias fichas de pueblos distintos es la nave, no es la
 * puerta de nadie.
 *
 * Uso:  node scripts/revisar-gps-clientes.mjs <copia_logistica_XXXX.json>
 */

import { readFileSync } from 'node:fs';

/** A cuántos metros dos fichas se consideran "en el mismo punto". */
const MISMO_PUNTO_M = 250;

/** Desde cuántas fichas compartiendo punto eso ya no es una casualidad. */
const FICHAS_QUE_HACEN_SOSPECHOSO_UN_PUNTO = 3;

const RADIO_TIERRA_KM = 6371;

const distanciaKm = (a, b) => {
    const rad = (x) => x * Math.PI / 180;
    const dLat = rad(b[0] - a[0]);
    const dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return RADIO_TIERRA_KM * 2 * Math.asin(Math.sqrt(h));
};

const parsear = (texto) => {
    if (!texto || !String(texto).includes(',')) return null;
    const [lat, lon] = String(texto).split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lat, lon];
};

/** Cuántos decimales trae cada mitad: "6/6" es lo que escribe el móvil (toFixed(6)). */
const decimalesDe = (texto) => String(texto).split(',')
    .map(t => (t.trim().split('.')[1] || '').length).join('/');

const normalizar = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Las copias vienen de dos sitios y no tienen la misma forma: la que saca la app
 * (Ajustes → copia de seguridad) trae la ficha entera; un volcado de la base de datos
 * la trae dentro de `data`. Aquí se aplanan las dos, con las sedes como fichas aparte.
 */
function fichasDe(copia) {
    const lista = copia.clients || copia.clientes || [];
    const salida = [];
    for (const fila of lista) {
        const ficha = fila.data ? { ...fila.data, id: fila.id, name: fila.name ?? fila.data.name } : fila;
        salida.push({ ...ficha, _sede: null });
        for (const sede of (ficha.branches || [])) {
            salida.push({
                ...sede,
                id: ficha.id,
                name: `${ficha.name} — ${sede.name || 'sede'}`,
                createdFrom: ficha.createdFrom,
                _sede: sede.id,
            });
        }
    }
    return salida;
}

const [, , archivo] = process.argv;
if (!archivo) {
    console.error('Falta la copia: node scripts/revisar-gps-clientes.mjs copia_logistica_XXXX.json');
    process.exit(1);
}

const copia = JSON.parse(readFileSync(archivo, 'utf-8'));
const fichas = fichasDe(copia);
const conGps = fichas
    .map(f => ({ ficha: f, punto: parsear(f.coordinates) }))
    .filter(x => x.punto);

// ── Agrupar por punto ──
const grupos = [];
for (const x of conGps) {
    const grupo = grupos.find(g => distanciaKm(g.centro, x.punto) * 1000 < MISMO_PUNTO_M);
    if (grupo) grupo.items.push(x);
    else grupos.push({ centro: x.punto, items: [x] });
}
grupos.sort((a, b) => b.items.length - a.items.length);

const sospechosos = grupos.filter(g => g.items.length >= FICHAS_QUE_HACEN_SOSPECHOSO_UN_PUNTO);
const sueltos = grupos.filter(g => g.items.length < FICHAS_QUE_HACEN_SOSPECHOSO_UN_PUNTO);

const pueblosDe = (g) => [...new Set(g.items.map(i => normalizar(i.ficha.city) || '(sin pueblo)'))];

console.log(`\nCopia: ${archivo}`);
console.log(`Fecha de la copia: ${copia.backupInfo?.timestamp || copia.timestamp || '(no consta)'}`);
console.log(`Fichas (con sedes): ${fichas.length} — con coordenadas: ${conGps.length}\n`);

console.log('═══ PUNTOS COMPARTIDOS POR VARIAS FICHAS — casi seguro son de las pruebas ═══\n');
if (!sospechosos.length) console.log('  Ninguno. No hay montones de fichas apiladas en el mismo sitio.\n');
for (const g of sospechosos) {
    const pueblos = pueblosDe(g);
    console.log(`  ${g.centro.map(n => n.toFixed(6)).join(', ')}  →  ${g.items.length} fichas, ${pueblos.length} pueblo(s) distintos`);
    console.log(`    Pueblos que dicen ser: ${pueblos.join(', ')}`);
    for (const i of g.items) {
        console.log(`      · #${i.ficha.id} ${String(i.ficha.name).slice(0, 34).padEnd(34)} ${String(i.ficha.city || '').padEnd(18)} ` +
            `dec ${decimalesDe(i.ficha.coordinates).padEnd(5)} ${i.ficha.createdFrom ? 'creada en ' + i.ficha.createdFrom : 'alta a mano'}`);
    }
    console.log('');
}

console.log('═══ PUNTOS SUELTOS — los candidatos a ser buenos ═══\n');
if (!sueltos.length) console.log('  Ninguno.\n');
for (const g of sueltos) {
    for (const i of g.items) {
        console.log(`  #${String(i.ficha.id).padEnd(5)} ${String(i.ficha.name).slice(0, 34).padEnd(34)} ${String(i.ficha.city || '').padEnd(18)} ` +
            `${i.ficha.coordinates.padEnd(26)} dec ${decimalesDe(i.ficha.coordinates).padEnd(5)} ` +
            `${i.ficha.createdFrom ? 'creada en ' + i.ficha.createdFrom : 'alta a mano'}`);
    }
}

// ── El resumen que se mira de un vistazo ──
const enSospechosos = sospechosos.reduce((n, g) => n + g.items.length, 0);
const aMano = conGps.filter(x => !x.ficha.createdFrom).length;
const seisSeis = conGps.filter(x => decimalesDe(x.ficha.coordinates) === '6/6').length;
console.log('\n═══ RESUMEN ═══');
console.log(`  Coordenadas en total ............................. ${conGps.length}`);
console.log(`  En un punto compartido (tirar) ................... ${enSospechosos}`);
console.log(`  En punto propio (revisar y quedarse) ............. ${conGps.length - enSospechosos}`);
console.log(`  De fichas de alta a mano (administración) ........ ${aMano}`);
console.log(`  Con 6 y 6 decimales, o sea escritas por el móvil . ${seisSeis}`);
