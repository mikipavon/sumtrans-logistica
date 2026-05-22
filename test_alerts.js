// Test script para verificar el sistema de alertas
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Leer .env manualmente
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key.trim()] = vals.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

(async () => {
  console.log('=== TEST DEL SISTEMA DE ALERTAS ===\n');
  
  const now = new Date();
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  console.log('Hoy es: ' + dias[now.getDay()] + ' (dayOfWeek=' + now.getDay() + ')');
  console.log('Hora actual: ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + '\n');

  const { data: alertsData, error: alertsErr } = await supabase
    .from('settings').select('*').eq('key', 'driverAlerts').maybeSingle();
  
  if (alertsErr) {
    console.log('ERROR leyendo driverAlerts: ' + alertsErr.message);
  } else if (!alertsData) {
    console.log('driverAlerts NO EXISTE en Supabase');
    console.log('Los conductores solo veran la alerta hardcoded de lunes\n');
  } else {
    const alerts = JSON.parse(alertsData.value);
    console.log('driverAlerts EXISTE en Supabase - ' + alerts.length + ' alerta(s):');
    alerts.forEach(a => {
      const dia = a.dayOfWeek !== undefined ? dias[a.dayOfWeek] : 'Todos';
      const hora = (a.timeFrom || a.timeTo) ? (a.timeFrom||'00:00') + '-' + (a.timeTo||'23:59') : 'Todo el dia';
      const conds = a.targetDriverIds && a.targetDriverIds.length > 0 ? a.targetDriverIds.join(',') : 'Todos';
      console.log('  ' + (a.enabled !== false ? 'ON' : 'OFF') + ' "' + a.title + '" | ' + dia + ' | ' + hora + ' | Conductores: [' + conds + ']');
    });
    console.log('');
  }

  // Simulacion
  console.log('--- SIMULACION: Que alertas saltarian hoy? ---\n');
  const dayOfWeek = now.getDay();
  const currentTimeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  
  let configAlerts = [];
  if (alertsData) { try { configAlerts = JSON.parse(alertsData.value); } catch(e) {} }
  
  const wouldShow = [];
  configAlerts.forEach(a => {
    if (a.dayOfWeek !== undefined && a.dayOfWeek !== dayOfWeek) {
      console.log('  NO "' + a.title + '" - dia incorrecto (espera ' + dias[a.dayOfWeek] + ', hoy ' + dias[dayOfWeek] + ')');
      return;
    }
    if (a.enabled === false) { console.log('  NO "' + a.title + '" - desactivada'); return; }
    if (a.timeFrom && currentTimeStr < a.timeFrom) { console.log('  NO "' + a.title + '" - aun no son las ' + a.timeFrom); return; }
    if (a.timeTo && currentTimeStr > a.timeTo) { console.log('  NO "' + a.title + '" - ya pasaron las ' + a.timeTo); return; }
    console.log('  SI "' + a.title + '" - SALTARIA!');
    wouldShow.push(a);
  });

  if (dayOfWeek === 1) {
    if (!wouldShow.find(a => a.id === 'monday_vehicle_check'))
      console.log('  SI "Revision Semanal" (hardcoded lunes) - SALTARIA!');
  } else {
    console.log('  NO "Revision Semanal" (hardcoded) - solo lunes, hoy ' + dias[dayOfWeek]);
  }

  if (wouldShow.length === 0 && dayOfWeek !== 1) {
    console.log('\n  RESULTADO: Ninguna alerta salta hoy.');
    console.log('  La alerta de revision esta para LUNES. Hoy es ' + dias[dayOfWeek] + '.');
    console.log('  Para probar, crea una alerta para "Todos los dias" o "' + dias[dayOfWeek] + '".');
  }

  // Historial
  const { data: histData } = await supabase.from('settings').select('*').eq('key', 'alert_acknowledgments').maybeSingle();
  console.log('\n--- HISTORIAL ---');
  if (!histData) { console.log('  Sin historial'); }
  else {
    const hist = JSON.parse(histData.value);
    console.log('  ' + hist.length + ' registro(s)');
    hist.slice(0, 5).forEach(h => {
      console.log('  * ' + h.driverName + ' -> "' + h.alertTitle + '" (' + new Date(h.timestamp).toLocaleString('es-ES') + ')');
    });
  }

  console.log('\n=== FIN ===');
  process.exit();
})();
