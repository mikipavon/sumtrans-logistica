// Una incidencia "aparcada" sigue abierta para el cliente y el repartidor
// (incidentStatus 'active'); sólo la oficina la quita de su panel porque ya sabe
// cuándo se resuelve. Resolver sí la cierra para todos.

export const incidenciaAbierta = (s) => s?.incidentStatus === 'active' || s?.status === 'Incidencia';

export const incidenciaAparcada = (s) => incidenciaAbierta(s) && !!s?.incidentParkedAt;

// Lo que cuenta el panel de Incidencias, el contador del menú y la campana.
export const incidenciaEnPanel = (s) => incidenciaAbierta(s) && !s?.incidentParkedAt;
