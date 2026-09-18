// Lógica común a las importaciones masivas de envíos (Excel y fotos de albaranes
// de agencia): qué artículo BADI toca por bultos, en qué baremo cae un punto y
// qué precio unitario se aplica al cliente. Vivía dentro de ImportExcelShipments;
// se saca aquí para que las dos importaciones no puedan calcular distinto.

import { ALL_BAREMO_PUEBLOS } from '../data/baremos';
import { baremoDelPunto as baremoDelPuntoAlta } from './precioArticulo';

export const normalizarTexto = (text) => {
    if (!text) return '';
    return String(text).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
};

/** Artículo BADI (BLT_n) que corresponde a un número de bultos. */
export function buscarArticuloBadi(articles, numPackages) {
    const num = parseInt(numPackages) || 1;
    const badiArticles = (articles || []).filter(a => a.category === 'BADI');
    const exact = badiArticles.find(a => {
        const parsed = parseInt(String(a.name).replace(/\D/g, ''));
        return parsed === num;
    });
    if (exact) return exact;
    const sorted = badiArticles.map(a => ({ ...a, _num: parseInt(String(a.name).replace(/\D/g, '')) || 0 })).sort((a, b) => a._num - b._num);
    const closest = sorted.find(a => a._num >= num);
    return closest || sorted[sorted.length - 1] || null;
}

/**
 * Baremo (1 ó 2) de una población/CP. Es la misma cuenta que el alta
 * (utils/precioArticulo.js): hasta el 18/9/2026 aquí vivía una copia vieja que
 * daba Baremo 1 a Antequera cuando en Ajustes quedaba una fila suya sin baremo,
 * y los albaranes importados salían a precio B1.
 */
export function baremoDelPunto(city, zip, { tariffs, coverageZones } = {}) {
    return baremoDelPuntoAlta(city, zip, { tariffs: tariffs || null, coverageZones: coverageZones || [] }).baremo;
}

/** Si la población o el CP aparecen en tarifas, zonas de cobertura o el maestro de pueblos. */
export function esPoblacionConocida(city, zip, { tariffs, coverageZones } = {}) {
    const normCity = normalizarTexto(city);
    const cleanZip = String(zip || '').trim();
    if (!normCity && !cleanZip) return false;
    const coincide = (nombre, cp) => (normCity && normalizarTexto(nombre) === normCity) || (cleanZip && String(cp || '').trim() === cleanZip);
    if ((tariffs || []).some(t => (t.match && normalizarTexto(t.match) === normCity) || (t.zipPrefix && cleanZip && cleanZip.startsWith(t.zipPrefix.trim())))) return true;
    if ((coverageZones || []).some(p => coincide(p.name, p.zip))) return true;
    return (ALL_BAREMO_PUEBLOS || []).some(p => coincide(p.name, p.zip));
}

/** Precio unitario de un artículo para un cliente en un baremo, respetando sus tarifas personalizadas. */
export function precioUnitarioParaCliente(article, cliente, baremo) {
    if (!article) return 0;
    let unitPrice = parseFloat(article.price || 0);
    if (!cliente) return unitPrice;
    if (baremo === 2 && cliente.customRatesB2?.[article.id] !== undefined && cliente.customRatesB2[article.id] !== '') {
        unitPrice = parseFloat(cliente.customRatesB2[article.id]);
    } else if (baremo === 1 && cliente.customRates?.[article.id] !== undefined && cliente.customRates[article.id] !== '') {
        unitPrice = parseFloat(cliente.customRates[article.id]);
    } else if (cliente.customRates?.[article.id] !== undefined && cliente.customRates[article.id] !== '') {
        unitPrice = parseFloat(cliente.customRates[article.id]);
    } else if (baremo === 2 && article.priceB2 !== undefined && article.priceB2 !== null && article.priceB2 !== '') {
        unitPrice = parseFloat(article.priceB2);
    }
    return unitPrice;
}

/** Prefijo de serie (HAB/SUM) según el tipo de facturación del cliente. */
export function prefijoSerieDelCliente(cliente) {
    const clientBt = String(cliente?.billingType || '').toLowerCase();
    const isHabClient = clientBt.includes('habitual') || clientBt.includes('diar') ||
        clientBt.includes('libre') || clientBt.includes('contado') ||
        clientBt.includes('presupuesto');
    return isHabClient ? 'HAB' : 'SUM';
}
