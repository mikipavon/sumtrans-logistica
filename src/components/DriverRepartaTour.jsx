import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTourAudio } from '../hooks/useTourAudio';

// Pasos — isRealContext: true = sin overlay, tooltip ancla abajo, app visible
// targetId: spotlight sobre elemento real
const TOUR_STEPS = [
  {
    emoji: '🚚',
    title: 'Tutorial: Gestión del Reparto',
    description: 'Te explico todos los elementos de la pestaña Reparto usando la app real. Podrás ver cada botón y función tal como aparece en tu día a día.',
    audio: 'Ahora te explico todos los elementos de la pestaña Reparto usando la aplicación real. Verás cada botón y función tal como aparece en tu día a día.',
    audioId: 'reparto_01_intro',
    isIntro: true,
    tab: 'route',
  },
  {
    emoji: '↕️',
    title: 'Mover albaranes arrastrando',
    description: 'Mantén pulsado el icono ⋮⋮ de la izquierda y arrastra la tarjeta arriba o abajo para cambiar el orden de tu ruta.\n\nCambia el orden según el tráfico o las urgencias del momento.',
    audio: 'Puedes cambiar el orden de las paradas fácilmente. Mantén pulsada cualquier tarjeta y arrástrala arriba o abajo para moverla en la ruta. Útil si necesitas cambiar el orden por tráfico o urgencias.',
    audioId: 'reparto_02_arrastrar',
    tab: 'route',
    inlineDemo: 'drag_demo',
  },
  {
    emoji: '🔄',
    title: '¿Te asignaron un reparto que no es tuyo?',
    description: 'Desliza la tarjeta hacia la derecha con el dedo. Detrás asoma un panel azul “Devolver a Asignar”: sigue deslizando hasta que ponga “Suelta ya” y levanta el dedo. No hay que pulsar nada.\n\nEl albarán desaparece de tu lista de Reparto y te aparece a ti en la pestaña “Asignar”, para que se lo mandes al conductor correcto.',
    audio: 'Si te asignan por error un reparto que no es tuyo, desliza la tarjeta hacia la derecha. Detrás asoma un panel azul de Devolver a Asignar. Sigue deslizando hasta que ponga Suelta ya, y levanta el dedo: no hay que pulsar nada. El albarán desaparece de tu lista y te aparece a ti en la pestaña Asignar, para que se lo mandes al conductor correcto.',
    audioId: 'reparto_02b_reasignar_deslizar',
    tab: 'route',
    inlineDemo: 'swipe_reasignar',
  },
  {
    emoji: '👥',
    title: 'Asignárselo al conductor correcto',
    description: 'Ve a la pestaña “Asignar” — el albarán aparecerá ahí esperando. Busca la tarjeta y asignála al transportista que corresponda desde el desplegable o los botones de turno.',
    audio: 'Una vez devuelto, ve a la pestaña Asignar. El albarán aparecerá ahí esperando. Busca la tarjeta y asígnala al transportista correcto desde el desplegable o los botones de turno.',
    audioId: 'reparto_02c_reasignar_asignar',
    tab: 'assign',
    targetId: 'driver-tab-assign',
    padding: 10,
  },
  {
    emoji: '✨',
    title: 'Optimizar Ruta (v4)',
    description: 'Este botón morado agrupa automáticamente las paradas por pueblos y calcula el orden más eficiente.\n\nDespués de pulsar, aparecerá el botón verde "Ver Mapa" para ver la ruta en Maps.',
    audio: 'El botón morado de Optimizar Ruta agrupa automáticamente las paradas por pueblos y calcula el orden más eficiente. Después de pulsar aparece el botón Ver Mapa para ver la ruta en Google Maps.',
    audioId: 'reparto_03_optimizar',
    tab: 'route',
    targetId: 'tour-optimize-btn',
    padding: 10,
  },
  {
    emoji: '📍',
    title: 'Botón GPS — Navegar',
    description: 'El icono 📍 azul de cada tarjeta abre Google Maps directamente con la dirección del destinatario ya cargada.\n\nSi hay coordenadas GPS exactas, calcula la ruta. Si no, busca la dirección.',
    audio: 'El icono de GPS azul de cada tarjeta abre Google Maps directamente con la dirección ya cargada. Si hay coordenadas exactas calcula la ruta. Si no, busca la dirección.',
    audioId: 'reparto_04_gps',
    tab: 'route',
    targetId: 'tour-gps-btn',
    padding: 8,
    fallbackMsg: 'Necesitas al menos un albarán en Reparto para ver este botón.',
  },
  {
    emoji: '📞',
    title: 'Llamar al cliente',
    description: 'Si el destinatario tiene teléfono guardado, aparece el icono 📞 verde junto al GPS.\n\nAl pulsarlo llamas directamente sin salir de la app. Si no hay teléfono, el icono no aparece.',
    audio: 'Si el destinatario tiene teléfono guardado, aparece el icono verde del teléfono junto al GPS. Al pulsarlo llamas directamente sin salir de la aplicación.',
    audioId: 'reparto_05_telefono',
    tab: 'route',
    targetId: 'tour-phone-btn',
    padding: 8,
    fallbackMsg: 'Este icono solo aparece si el albarán tiene teléfono del destinatario guardado.',
  },
  {
    emoji: '📄',
    title: 'Menú de documentos (⋯)',
    description: 'El icono de documento 📄 azul abre un menú con dos opciones:\n\n🖨️ IMPRIMIR TICKET — imprime el albarán en formato pequeño\n📤 ENVIAR WHATSAPP — manda un mensaje al cliente con los datos del envío',
    audio: 'El icono de documento azul abre un menú con dos opciones: Imprimir Ticket, que imprime el albarán en formato pequeño, y Enviar WhatsApp, que manda un mensaje al cliente con los datos del envío.',
    audioId: 'reparto_06_documentos',
    tab: 'route',
    targetId: 'tour-doc-btn',
    padding: 8,
    fallbackMsg: 'Necesitas al menos un albarán en Reparto para ver este botón.',
  },
  {
    emoji: '💶',
    title: 'Identificar cobros en las tarjetas',
    description: 'Si una tarjeta muestra la etiqueta verde 💰 "COBRAR: Porte: Xé + Reembolso: Xé" significa que debes cobrar al entregar.\n\n• Porte: X€ → lo cobra el repartidor y lo entrega en oficina\n• Reembolso: X€ → lo cobra y lo entrega al remitente con justificante',
    audio: 'Si una tarjeta muestra la etiqueta verde con el importe, significa que debes cobrar al entregar. El porte lo entregas en la oficina. El reembolso lo entregas al remitente con el justificante.',
    audioId: 'reparto_07_cobros',
    tab: 'route',
    targetId: 'tour-cobros-label',
    padding: 12,
    fallbackMsg: 'Pulsa en cualquier tarjeta de reparto para ver si tiene cobros pendientes.',
  },
  {
    emoji: '💵',
    title: 'Con cobro — así se ve la pantalla',
    description: 'Cuando el albarán tiene cobro pendiente (Debido o Reembolso), al pulsar Confirmar Entrega aparece primero esta pantalla con el importe exacto a cobrar. Cobra el dinero, pulsa Confirmar y luego pides la firma.',
    audio: 'Cuando el albarán tiene cobro pendiente, al pulsar Confirmar Entrega aparece primero esta pantalla con el importe exacto. Cobra el dinero, confirmas, y después pides la firma.',
    audioId: 'reparto_08_confirmar_flujo',
    tab: 'route',
    isRealModal: true,
    demoMode: 'delivery_debido',
  },
  {
    emoji: '💳',
    title: 'Sin cobro (Facturación) — así se ve',
    description: 'Cuando el albarán es de facturación (ya pagado), al pulsar Confirmar Entrega va directo a la pantalla de firma. No hay cobro — solo pides la firma con el dedo o haces una foto del paquete.',
    audio: 'Cuando el albarán es de facturación, al pulsar Confirmar Entrega va directo a la pantalla de firma. No hay cobro. Solo pides la firma con el dedo o haces una foto del paquete.',
    audioId: 'reparto_08b_confirmar_pagado',
    tab: 'route',
    isRealModal: true,
    demoMode: 'delivery_pagado',
  },
  {
    emoji: '🚨',
    title: 'Pruebas de entrega — reglas importantes',
    description: '¡Lee esto bien! Las reglas cambian según el tipo de envío:',
    audio: 'Atención, hay reglas importantes para documentar las entregas. Para agencias como TXT, TSB y XPO, siempre debes firmar el albarán de la agencia y hacer una foto en la app. Si no llevas el albarán, haz una foto de la etiqueta firmada o sellada. Para el resto de clientes, si tienen sello, que sellen la etiqueta del paquete y haces foto. Y si no tienen sello, anota el nombre de quien recibe.',
    audioId: 'reparto_09b_notas_entrega',
    tab: 'route',
    inlineDemo: 'notas_entrega',
  },
  {
    emoji: '💮',
    title: 'Truco: clientes con sello de empresa',
    description: 'Haz que sellen la etiqueta del paquete y saca una foto — así quedan registrados el sello y el GPS al mismo tiempo:',
    audio: 'Un truco importante para clientes con sello de empresa: pídele que selle la etiqueta del paquete, no el albarán de papel. Luego haz una foto de esa etiqueta sellada desde la app. Así quedan registrados el sello y la ubicación GPS exacta al mismo tiempo. Es el justificante más completo posible.',
    audioId: 'reparto_09_sello',
    tab: 'route',
    inlineDemo: 'sello_demo',
  },
  {
    emoji: '⚠️',
    title: 'Registrar una incidencia',
    description: 'Si no puedes entregar, pulsa el botón rojo ⚠️ "Incidencia" en la tarjeta.\n\nSelecciona el motivo: Ausente, Dirección incorrecta, Rehúsa la entrega...\n\nEl albarán queda marcado en rojo y la oficina recibirá la notificación.',
    audio: 'Si no puedes entregar, pulsa el botón rojo de Incidencia en la tarjeta. Selecciona el motivo: ausente, dirección incorrecta, rehusa la entrega... El albarán queda marcado y la oficina recibe la notificación.',
    audioId: 'reparto_08_incidencia',
    tab: 'route',
    targetId: 'tour-incident-btn',
    padding: 8,
    fallbackMsg: 'Necesitas al menos un albarán en Reparto para ver el botón de incidencia.',
  },
  {
    emoji: '📋',
    title: 'Ventana de incidencias',
    description: 'Al pulsar "Incidencia" se abre este formulario. Tienes tres formas de escribir el motivo:\n\n✏️ Escribir manualmente en el cuadro\n🎤 Dictar por voz pulsando el botón "Hablar"\n🔘 Usar los botones de acceso rápido (abajo)',
    audio: 'Al pulsar Incidencia se abre este formulario. Tienes tres formas de escribir el motivo: escribir manualmente, dictar por voz pulsando el botón Hablar, o usar los botones de acceso rápido de abajo.',
    audioId: 'reparto_09_modal_incidencia',
    tab: 'route',
    isIncidentModal: true,
    targetId: 'tour-incident-textarea',
    padding: 10,
  },
  {
    emoji: '🔘',
    title: 'Botones de acceso rápido',
    description: 'Los botones de la parte inferior del formulario insertan el motivo de un solo toque, sin tener que escribir:\n\n• Cliente ausente\n• Dirección incorrecta\n• Paquete dañado\n• Local cerrado\n• Rechazado\n• No dispone del reembolso',
    audio: 'Los botones de la parte inferior insertan el motivo de un solo toque, sin tener que escribir: cliente ausente, dirección incorrecta, paquete dañado, local cerrado, rechazado, o no dispone del reembolso.',
    audioId: 'reparto_10_atajos',
    tab: 'route',
    isIncidentModal: true,
    targetId: 'tour-incident-shortcuts',
    padding: 6,
  },
  {
    emoji: '🎉',
    title: '¡Ya dominas el Reparto!',
    description: '✅ Arrastra para reordenar\n✨ Optimizador agrupa por pueblo\n📍 GPS abre Maps directamente\n📞 Llama si hay teléfono\n📄 WhatsApp o Ticket desde el menú\n💶 Etiqueta verde = cobrar antes de confirmar\n✅ Facturación = solo firma / foto\n💮 Sello en etiqueta del paquete + foto\n⚠️ Incidencia → modal con atajos rápidos',
    audio: '¡Ya dominas el Reparto! Recuerda los puntos clave: arrastra para reordenar, el GPS abre Maps directamente, si hay cobro pendiente te aparecerá la pantalla de cobro antes de la firma, y si el cliente tiene sello de empresa, él sella la etiqueta del paquete y tú haces la foto para registrar sello y ubicación.',
    audioId: 'reparto_13_final',
    isFinal: true,
    tab: 'route',
  },
];

// ── Demo animada: arrastrar tarjetas ──────────────────────────────────────────
const DRAG_CSS = `
@keyframes drag-lift {
  0%   { transform: translateY(0px)   scale(1);    box-shadow: 0 2px 8px rgba(0,0,0,0.08); opacity:1; }
  15%  { transform: translateY(-2px)  scale(1.03); box-shadow: 0 12px 30px rgba(59,130,246,0.35); opacity:1; }
  45%  { transform: translateY(-72px) scale(1.03); box-shadow: 0 16px 40px rgba(59,130,246,0.4); opacity:1; }
  70%  { transform: translateY(-72px) scale(1.03); box-shadow: 0 16px 40px rgba(59,130,246,0.4); opacity:1; }
  90%  { transform: translateY(0px)   scale(1);    box-shadow: 0 2px 8px rgba(0,0,0,0.08); opacity:1; }
  100% { transform: translateY(0px)   scale(1);    box-shadow: 0 2px 8px rgba(0,0,0,0.08); opacity:1; }
}
@keyframes drag-push-down {
  0%   { transform: translateY(0); }
  15%  { transform: translateY(0); }
  45%  { transform: translateY(68px); }
  70%  { transform: translateY(68px); }
  90%  { transform: translateY(0); }
  100% { transform: translateY(0); }
}
@keyframes handle-pulse {
  0%,100% { background: #dbeafe; color:#3b82f6; }
  45%,70% { background: #3b82f6; color:white; }
}
.drag-card-lift    { animation: drag-lift     2.8s ease-in-out infinite; }
.drag-card-push    { animation: drag-push-down 2.8s ease-in-out infinite; }
.drag-handle-pulse { animation: handle-pulse   2.8s ease-in-out infinite; }
`;

const DEMO_CARDS = [
  { stop: 1, name: 'Mercadona S.A.',    addr: 'Avda. Juan Carlos I · Lucena',   color: '#3b82f6', badge: 'ENTREGA' },
  { stop: 2, name: 'Leroy Merlín',      addr: 'Polígono Las Quemadas · Córdoba', color: '#8b5cf6', badge: 'ENTREGA' },
  { stop: 3, name: 'Frutería García',   addr: 'C/ Real 14 · Cabra',              color: '#10b981', badge: 'ENTREGA', cobro: '€9.00' },
];

function DragDemo() {
  return (
    <div style={{ marginTop: 12, userSelect: 'none' }}>
      <style>{DRAG_CSS}</style>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        ⬇️ Demo en vivo — así se reordena
      </p>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Tarjeta 1 — se eleva y sube */}
        {DEMO_CARDS.map((card, i) => (
          <div
            key={i}
            className={i === 1 ? 'drag-card-lift' : i === 0 ? 'drag-card-push' : ''}
            style={{
              background: 'white',
              borderRadius: 12,
              border: '1.5px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              zIndex: i === 1 ? 10 : 1,
              position: 'relative',
            }}
          >
            {/* ── Franja de color izquierda ── */}
            <div style={{ width: 4, alignSelf: 'stretch', background: card.color, flexShrink: 0 }} />

            {/* ── Handle de arrastre ── */}
            <div
              className={i === 1 ? 'drag-handle-pulse' : ''}
              style={{
                width: 30, alignSelf: 'stretch',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                background: i === 1 ? '#dbeafe' : '#f8fafc',
                borderRight: '1px solid #f1f5f9',
                flexShrink: 0, padding: '0 6px',
                transition: 'background 0.2s',
              }}
            >
              {[0,1,2].map(r => (
                <div key={r} style={{ display: 'flex', gap: 3 }}>
                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: i === 1 ? 'inherit' : '#cbd5e1' }} />
                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: i === 1 ? 'inherit' : '#cbd5e1' }} />
                </div>
              ))}
            </div>

            {/* ── Contenido ── */}
            <div style={{ flex: 1, padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 8, fontWeight: 800, color: '#64748b' }}>PARADA #{card.stop}</span>
                <span style={{
                  fontSize: 8, fontWeight: 800, background: '#eff6ff', color: '#2563eb',
                  border: '1px solid #bfdbfe', borderRadius: 4, padding: '1px 5px',
                }}>{card.badge}</span>
              </div>
              <p style={{ fontWeight: 700, fontSize: 11, color: '#0f172a', margin: 0 }}>{card.name}</p>
              <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>📍 {card.addr}</p>
              {card.cobro && (
                <span style={{
                  fontSize: 9, fontWeight: 800, background: '#f0fdf4', color: '#16a34a',
                  border: '1px solid #bbf7d0', borderRadius: 4, padding: '1px 5px', marginTop: 3, display: 'inline-block',
                }}>💰 COBRAR: {card.cobro}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
        La tarjeta morada se mueve sola — así funciona el arrastre
      </p>
    </div>
  );
}

// ── Demo: deslizar tarjeta a la derecha para reasignar ────────────────────────
const SWIPE_CSS = `
@keyframes swipe-card {
  0%   { transform: translateX(0);    box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  20%  { transform: translateX(30%);  box-shadow: 0 8px 24px rgba(37,99,235,0.25); }
  55%  { transform: translateX(65%);  box-shadow: 0 8px 24px rgba(37,99,235,0.35); }
  72%  { transform: translateX(65%);  box-shadow: 0 8px 24px rgba(37,99,235,0.35); }
  90%  { transform: translateX(0);    box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  100% { transform: translateX(0);    box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
}
/* El panel no "aparece": está siempre detrás y lo destapa la tarjeta al moverse,
   igual que en la app. Solo se apaga al final del bucle, cuando la tarjeta vuelve. */
@keyframes swipe-btn-appear {
  0%,10%  { opacity:0; }
  14%,80% { opacity:1; }
  90%,100%{ opacity:0; }
}
@keyframes swipe-finger {
  0%,10%  { opacity:0; left: 55%; }
  18%     { opacity:1; left: 55%; }
  55%     { opacity:1; left: 85%; }
  70%     { opacity:0; left: 85%; }
  100%    { opacity:0; left: 55%; }
}
@keyframes tab-flash {
  0%,60%  { background: rgba(255,255,255,0.05); color: #94a3b8; }
  70%,85% { background: #2563eb; color: white; box-shadow: 0 0 12px rgba(37,99,235,0.5); }
  100%    { background: rgba(255,255,255,0.05); color: #94a3b8; }
}
.swipe-card-anim  { animation: swipe-card       3.5s ease-in-out infinite; }
.swipe-btn-anim   { animation: swipe-btn-appear  3.5s ease-in-out infinite; }
.swipe-finger-anim{ animation: swipe-finger      3.5s ease-in-out infinite; }
.swipe-tab-flash  { animation: tab-flash         3.5s ease-in-out 2s infinite; }
`;

function SwipeReasignarDEMO() {
  return (
    <div style={{ marginTop: 12, userSelect: 'none' }}>
      <style>{SWIPE_CSS}</style>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
        ⬇️ Demo — desliza la tarjeta a la derecha
      </p>

      {/* Contenedor con overflow hidden para el efecto swipe */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>

        {/* Panel azul que queda detrás, por la izquierda: mismo sitio y mismos
            colores que en la app, para que el conductor reconozca lo que ve. */}
        <div className="swipe-btn-anim" style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: '68%', background: 'linear-gradient(90deg,#3b82f6,#4338ca)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          paddingLeft: 12, gap: 6, borderRadius: 14,
        }}>
          <span style={{ fontSize: 14 }}>↩️</span>
          <span style={{ fontSize: 10, fontWeight: 900, color: 'white', letterSpacing: 0.3 }}>
            Devolver a Asignar
          </span>
        </div>

        {/* Tarjeta que se mueve */}
        <div className="swipe-card-anim" style={{
          background: 'white', borderRadius: 14,
          border: '1.5px solid #e2e8f0',
          display: 'flex', alignItems: 'center',
          overflow: 'hidden', position: 'relative', zIndex: 2,
        }}>
          <div style={{ width: 4, alignSelf: 'stretch', background: '#ef4444', flexShrink: 0 }} />
          <div style={{ width: 30, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: '#f8fafc', borderRight: '1px solid #f1f5f9', flexShrink: 0, padding: '0 6px' }}>
            {[0,1,2].map(r => (
              <div key={r} style={{ display: 'flex', gap: 3 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }} />
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }} />
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '10px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: '#ef4444' }}>⚠️ ERROR</span>
              <span style={{ fontSize: 8, fontWeight: 800, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 5px' }}>REPARTO INCORRECTO</span>
            </div>
            <p style={{ fontWeight: 800, fontSize: 11, color: '#0f172a', margin: 0 }}>Mercadona Lucena</p>
            <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>📍 Avda. Juan Carlos I · Lucena</p>
          </div>
        </div>

        {/* Dedo animado */}
        <div className="swipe-finger-anim" style={{
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          fontSize: 18, zIndex: 10, pointerEvents: 'none',
        }}>👆</div>
      </div>

      {/* Paso 2: ir a Asignar */}
      <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', border: '1.5px solid #7dd3fc', borderRadius: 12, padding: '10px 12px' }}>
        <p style={{ fontWeight: 800, fontSize: 10, color: '#0369a1', margin: '0 0 6px' }}>A continuación:</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="swipe-tab-flash" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', fontSize: 10, fontWeight: 700, color: '#94a3b8', transition: 'all 0.3s' }}>
            📋 Asignar
          </div>
          <span style={{ fontSize: 10, color: '#0369a1' }}>← Pulsa esta pestaña</span>
        </div>
        <p style={{ fontSize: 9, color: '#0369a1', margin: '6px 0 0' }}>Busca el albarán y asígnalo al transportista correcto</p>
      </div>
    </div>
  );
}

// ── Demo: flujo Confirmar Entrega (facturación vs cobro) ─────────────────────
const CONFIRMAR_CSS = `
@keyframes cf-fadein {
  from { opacity:0; transform:translateY(6px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes cf-pulse-red {
  0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.4); }
  50%      { box-shadow: 0 0 0 7px rgba(220,38,38,0); }
}
.cf-step   { animation: cf-fadein 0.4s ease both; }
.cf-cobro  { animation: cf-pulse-red 1.6s infinite; }
`;

function FlowRow({ icon, label, sub, color, pulse, delay = 0 }) {
  return (
    <div className="cf-step" style={{ animationDelay: `${delay}s`,
      background: 'white', border: `1.5px solid ${color}22`,
      borderRadius: 10, padding: '6px 8px', marginBottom: 4,
      display: 'flex', alignItems: 'center', gap: 7,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <p style={{ fontWeight: 700, fontSize: 10, color, margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

function Arrow({ color }) {
  return <div style={{ textAlign:'center', color, fontSize:12, lineHeight:1, marginBottom:4 }}>↓</div>;
}

function ConfirmarFlujoDEMO() {
  return (
    <div style={{ marginTop: 10, userSelect: 'none' }}>
      <style>{CONFIRMAR_CSS}</style>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        ⇓ Las dos situaciones reales
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

        {/* ── Facturación ── */}
        <div style={{ background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #86efac', padding: 10 }}>
          <div style={{ textAlign:'center', marginBottom:8 }}>
            <span style={{ fontSize:9, fontWeight:800, background:'#dcfce7', color:'#16a34a', borderRadius:5, padding:'2px 8px', border:'1px solid #86efac' }}>
              💳 FACTURACIÓN
            </span>
          </div>
          <FlowRow icon="✅" label="Confirmar Entrega" color="#16a34a" delay={0.1} />
          <Arrow color="#16a34a" />
          <FlowRow icon="✍️" label="Firma del cliente" sub="Con el dedo en pantalla" color="#16a34a" delay={0.2} />
          <Arrow color="#16a34a" />
          <FlowRow icon="📷" label="Foto del paquete" sub="Opcional pero recomendada" color="#16a34a" delay={0.3} />
          <Arrow color="#16a34a" />
          <FlowRow icon="🎉" label="¡Entregado!" color="#16a34a" delay={0.4} />
        </div>

        {/* ── Con cobro ── */}
        <div style={{ background: '#eff6ff', borderRadius: 12, border: '1.5px solid #93c5fd', padding: 10 }}>
          <div style={{ textAlign:'center', marginBottom:8 }}>
            <span style={{ fontSize:9, fontWeight:800, background:'#dbeafe', color:'#1d4ed8', borderRadius:5, padding:'2px 8px', border:'1px solid #93c5fd' }}>
              💵 CON COBRO
            </span>
          </div>
          <FlowRow icon="✅" label="Confirmar Entrega" color="#1d4ed8" delay={0.1} />
          <Arrow color="#dc2626" />
          <div className="cf-cobro" style={{ background:'#fef2f2', border:'2px solid #fca5a5', borderRadius:10, padding:'6px 8px', marginBottom:4, display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontSize:16 }}>💰</span>
            <div>
              <p style={{ fontWeight:800, fontSize:10, color:'#dc2626', margin:0 }}>Cobrar al cliente</p>
              <p style={{ fontSize:9, color:'#b91c1c', margin:0 }}>Porte + Reembolso</p>
            </div>
          </div>
          <Arrow color="#1d4ed8" />
          <FlowRow icon="✍️" label="Firma del cliente" color="#1d4ed8" delay={0.3} />
          <Arrow color="#1d4ed8" />
          <FlowRow icon="🎉" label="¡Entregado!" color="#1d4ed8" delay={0.4} />
        </div>
      </div>
    </div>
  );
}

// ── Demo: truco sello de empresa ─────────────────────────────────────
const SELLO_CSS = `
@keyframes sello-stamp {
  0%   { transform: scale(2) translateY(-20px); opacity:0; }
  30%  { transform: scale(1.1) translateY(0px); opacity:1; }
  50%  { transform: scale(0.95); opacity:1; }
  65%  { transform: scale(1); opacity:1; }
  100% { transform: scale(1); opacity:1; }
}
@keyframes cam-flash {
  0%,80%  { background: #1e293b; }
  85%     { background: white; }
  100%    { background: #1e293b; }
}
@keyframes gps-appear {
  from { opacity:0; transform:scale(0.7); }
  to   { opacity:1; transform:scale(1); }
}
.sello-stamp-anim { animation: sello-stamp 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
.cam-anim         { animation: cam-flash  1.2s ease 1.8s both; }
.gps-anim         { animation: gps-appear 0.5s ease 2.5s both; opacity:0; }
`;

function SelloDEMO() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ marginTop: 10, userSelect: 'none' }}>
      <style>{SELLO_CSS}</style>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        ⇓ Así se hace — paso a paso
      </p>

      {/* Etiqueta del paquete */}
      <div style={{ background: 'white', border: '2px dashed #cbd5e1', borderRadius: 12, padding: 10, marginBottom: 8, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {/* Barcode simulado */}
          <div style={{ display:'flex', gap:1.5, height:36, alignItems:'flex-end', flexShrink:0 }}>
            {[4,7,3,8,5,6,4,7,3,6,5,8,4].map((h,i) => (
              <div key={i} style={{ width: i%3===0?2:1, height:`${h*4}px`, background:'#334155', borderRadius:1 }} />
            ))}
          </div>
          <div>
            <p style={{ fontWeight:800, fontSize:10, color:'#0f172a', margin:0 }}>MERCADONA S.A.</p>
            <p style={{ fontSize:9, color:'#64748b', margin:0 }}>Avda. Juan Carlos I · Lucena</p>
            <p style={{ fontSize:8, fontFamily:'monospace', color:'#94a3b8', margin:'2px 0 0' }}>ALB-20240612-1042</p>
          </div>
        </div>

        {/* Sello animado */}
        <div
          key={`stamp-${tick}`}
          className="sello-stamp-anim"
          style={{
            position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
            width:56, height:56, borderRadius:'50%',
            border:'3px solid #1d4ed8',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            color:'#1d4ed8', opacity:0.85,
          }}
        >
          <span style={{ fontSize:8, fontWeight:900, letterSpacing:0.5, lineHeight:1.1, textAlign:'center' }}>RECIBIDO</span>
          <div style={{ width:32, height:1, background:'#1d4ed8', margin:'2px 0' }} />
          <span style={{ fontSize:7, fontWeight:700 }}>12/06/2024</span>
        </div>
      </div>

      {/* Cámara + foto */}
      <div style={{ display:'flex', gap:8, alignItems:'stretch', marginBottom:8 }}>
        <div
          key={`cam-${tick}`}
          className="cam-anim"
          style={{
            flex:1, background:'#1e293b', borderRadius:10, padding:'8px 10px',
            display:'flex', alignItems:'center', gap:8,
          }}
        >
          <span style={{ fontSize:20 }}>📷</span>
          <div>
            <p style={{ fontWeight:700, fontSize:10, color:'white', margin:0 }}>Foto de la etiqueta</p>
            <p style={{ fontSize:9, color:'#94a3b8', margin:0 }}>Con sello visible</p>
          </div>
        </div>
      </div>

      {/* Resultado registrado */}
      <div
        key={`gps-${tick}`}
        className="gps-anim"
        style={{
          background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',
          border:'1.5px solid #86efac',
          borderRadius:10, padding:'8px 12px',
          display:'flex', alignItems:'center', gap:10,
        }}
      >
        <span style={{ fontSize:22 }}>✅</span>
        <div>
          <p style={{ fontWeight:800, fontSize:11, color:'#15803d', margin:0 }}>Queda registrado:</p>
          <p style={{ fontSize:9, color:'#166534', margin:'2px 0 0' }}>💮 Sello de empresa · 📍 GPS: Lucena, Córdoba · 🕒 12/06/2024 11:32</p>
        </div>
      </div>
    </div>
  );
}

// ── Demo: Notas importantes de entrega ──────────────────────────────────────
const NOTAS_CSS = `
@keyframes notas-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}
.nota-row { animation: notas-in 0.35s ease both; }
`;

function NRule({ icon, label, sub, color = '#1e293b', bg = '#f8fafc', border = '#e2e8f0', delay = 0, badge }) {
  return (
    <div className="nota-row" style={{
      animationDelay: `${delay}s`,
      display: 'flex', alignItems: 'flex-start', gap: 8,
      background: bg, border: `1.5px solid ${border}`,
      borderRadius: 10, padding: '7px 10px', marginBottom: 5,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.3 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <p style={{ fontWeight: 700, fontSize: 10.5, color, margin: 0 }}>{label}</p>
          {badge && (
            <span style={{
              fontSize: 8, fontWeight: 900, padding: '1px 6px', borderRadius: 4,
              background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
              textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
            }}>{badge.text}</span>
          )}
        </div>
        {sub && <p style={{ fontSize: 9, color: '#64748b', margin: '2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function NotasEntregaDEMO() {
  return (
    <div style={{ marginTop: 10, userSelect: 'none' }}>
      <style>{NOTAS_CSS}</style>

      {/* ── BLOQUE 1: AGENCIAS ── */}
      <div style={{
        background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)',
        border: '2px solid #fca5a5', borderRadius: 14,
        padding: '10px 12px', marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div>
            <p style={{ fontWeight: 900, fontSize: 11, color: '#991b1b', margin: 0 }}>AGENCIAS</p>
            <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
              {['TXT', 'TSB', 'XPO'].map(a => (
                <span key={a} style={{
                  fontSize: 9, fontWeight: 900, background: '#dc2626', color: 'white',
                  borderRadius: 4, padding: '1px 6px',
                }}>{a}</span>
              ))}
            </div>
          </div>
        </div>

        <NRule
          icon="✅"
          label="Firmar el albarán de la agencia"
          sub="El papel que trae la agencia — ¡debe quedar firmado!"
          color="#15803d" bg="#f0fdf4" border="#86efac"
          badge={{ text: 'SIEMPRE', bg: '#15803d', color: 'white', border: '#15803d' }}
          delay={0.05}
        />
        <NRule
          icon="📷"
          label="Foto del albarán de la agencia en la app"
          sub="Sube la foto antes de cerrar la entrega"
          color="#1d4ed8" bg="#eff6ff" border="#93c5fd"
          badge={{ text: 'OBLIGATORIO', bg: '#1d4ed8', color: 'white', border: '#1d4ed8' }}
          delay={0.1}
        />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          margin: '8px 0 6px', padding: '4px 8px',
          background: '#fef9c3', border: '1px dashed #ca8a04',
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 12 }}>⚠️</span>
          <p style={{ fontSize: 9, fontWeight: 700, color: '#92400e', margin: 0 }}>Si no llevamos el albarán de la agencia:</p>
        </div>
        <NRule
          icon="📷"
          label="Foto de la etiqueta del paquete firmada o sellada"
          sub="Vale como justificante alternativo"
          color="#92400e" bg="#fffbeb" border="#fde68a"
          delay={0.15}
        />
      </div>

      {/* ── BLOQUE 2: TODOS LOS CLIENTES ── */}
      <div style={{
        background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
        border: '2px solid #86efac', borderRadius: 14,
        padding: '10px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>📦</span>
          <p style={{ fontWeight: 900, fontSize: 11, color: '#15803d', margin: 0 }}>TODOS LOS CLIENTES</p>
        </div>

        <NRule
          icon="💮"
          label="Cliente con sello → sellar etiqueta del paquete + foto"
          sub="No el albarán de papel — la etiqueta adhesiva del bulto"
          color="#1d4ed8" bg="#eff6ff" border="#93c5fd"
          badge={{ text: 'PREFERIDO', bg: '#6d28d9', color: 'white', border: '#6d28d9' }}
          delay={0.2}
        />
        <NRule
          icon="✍️"
          label="Sin sello → nombre de quien recibe en la firma"
          sub="Pedíle que escriba su nombre antes de firmar"
          color="#374151" bg="#f8fafc" border="#e2e8f0"
          delay={0.25}
        />
      </div>
    </div>
  );
}

export default function DriverRepartaTour({ isVisible, onComplete, onSkip, onChangeTab, onOpenIncidentModal, onCloseIncidentModal, onDemoModeChange }) {
  const [step, setStep]         = useState(0);
  const [animOut, setAnimOut]   = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const { speak, stop, isMuted, toggleMute } = useTourAudio();

  // Guardar callbacks en refs para que nunca causen re-disparos innecesarios
  const openModalRef  = useRef(onOpenIncidentModal);
  const closeModalRef = useRef(onCloseIncidentModal);
  useEffect(() => { openModalRef.current  = onOpenIncidentModal; },  [onOpenIncidentModal]);
  useEffect(() => { closeModalRef.current = onCloseIncidentModal; }, [onCloseIncidentModal]);
  const demoModeRef = useRef(onDemoModeChange);
  useEffect(() => { demoModeRef.current = onDemoModeChange; }, [onDemoModeChange]);

  const currentStep = TOUR_STEPS[step];
  const hasTarget      = !!currentStep.targetId;
  const hasInlineDemo  = !!currentStep.inlineDemo;

  // Navegar a la pestaña correcta al cambiar de paso
  useEffect(() => {
    if (!isVisible) return;
    if (currentStep.tab && onChangeTab) onChangeTab(currentStep.tab);
  }, [step, isVisible, currentStep, onChangeTab]);

  // Abrir/cerrar el modal de incidencias real según el paso
  useEffect(() => {
    if (!isVisible) return;
    if (currentStep.isIncidentModal) {
      openModalRef.current?.();
    } else {
      closeModalRef.current?.();
    }
  }, [step, isVisible, currentStep]);

  // Activar/desactivar el demoMode del modal de entrega según el paso
  useEffect(() => {
    if (!isVisible) return;
    demoModeRef.current?.(currentStep.demoMode || null);
  }, [step, isVisible, currentStep]);

  // Reset al abrir / cerrar tour
  useEffect(() => {
    if (!isVisible) {
      closeModalRef.current?.();
      demoModeRef.current?.(null);
      stop();
      return;
    }
    setStep(0);
  }, [isVisible, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Narrar cada paso
  useEffect(() => {
    if (!isVisible) return;
    const { audio, audioId } = currentStep;
    if (audio || audioId) {
      const t = setTimeout(() => speak(audio, audioId), 400);
      return () => clearTimeout(t);
    }
  }, [step, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Medir el elemento target real
  useEffect(() => {
    if (!isVisible || !currentStep.targetId) { setTargetRect(null); return; }
    const measure = () => {
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setTargetRect(el.getBoundingClientRect()), 400);
      } else {
        setTargetRect(null);
      }
    };
    const t = setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [step, isVisible, currentStep]);

  const goNext = () => {
    if (step >= TOUR_STEPS.length - 1) { onComplete(); return; }
    setAnimOut(true);
    setTimeout(() => { setStep(s => s + 1); setAnimOut(false); }, 180);
  };
  const goPrev = () => {
    if (step === 0) return;
    setAnimOut(true);
    setTimeout(() => { setStep(s => s - 1); setAnimOut(false); }, 180);
  };

  if (!isVisible) return null;

  const vw  = window.innerWidth;
  const vh  = window.innerHeight;
  const pad = currentStep.padding || 8;

  // Coordenadas spotlight
  let sTop = 0, sLeft = 0, sRight = vw, sBottom = vh;
  if (targetRect && hasTarget) {
    sTop    = Math.max(0, targetRect.top    - pad);
    sLeft   = Math.max(0, targetRect.left   - pad);
    sRight  = Math.min(vw, targetRect.right + pad);
    sBottom = Math.min(vh, targetRect.bottom + pad);
  }

  const tooltipW = Math.min(360, vw - 24);
  const tooltipLeft = Math.max(12, vw / 2 - tooltipW / 2);

  // Si hay target y elemento visible → anclar tooltip arriba o abajo del spotlight
  // Si no hay target o no se encontró → anclar siempre abajo (app visible debajo)
  let tooltipTop = null, tooltipBottom = null;
  let dynamicMaxHeight = vh - 32;

  if (hasTarget && targetRect) {
    const spaceBelow = vh - sBottom;
    const spaceAbove = sTop;
    if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
      tooltipTop = sBottom + 14;
      tooltipTop = Math.min(tooltipTop, vh - 220); // At least 220px for tooltip
      dynamicMaxHeight = Math.max(200, vh - tooltipTop - 16);
    } else {
      tooltipBottom = vh - sTop + 14;
      dynamicMaxHeight = Math.max(200, sTop - 32);
    }
  } else if (currentStep.isIntro || currentStep.isFinal) {
    tooltipTop = 16;
    dynamicMaxHeight = vh - 32;
  } else {
    tooltipBottom = 16; // sin target → barra inferior
    dynamicMaxHeight = vh - 100;
  }

  // ── Overlay con spotlight (solo si hay target real encontrado) ────────────
  const overlayEl = hasTarget && targetRect ? (
    <>
      {/* Paneles oscuros alrededor */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:sTop, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:sBottom, left:0, right:0, bottom:0, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:sTop, left:0, width:sLeft, height:sBottom-sTop, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:sTop, left:sRight, right:0, height:sBottom-sTop, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      {/* Borde azul sobre el elemento */}
      <div style={{
        position:'fixed', top:sTop, left:sLeft, width:sRight-sLeft, height:sBottom-sTop,
        borderRadius:14, border:'3px solid #3b82f6',
        boxShadow:'0 0 0 3px rgba(59,130,246,0.25), 0 0 30px rgba(59,130,246,0.5)',
        zIndex:10001, pointerEvents:'none',
      }} />
    </>
  ) : null;

  // Fallback si no hay tarjetas reales
  const showFallback = hasTarget && !targetRect && currentStep.fallbackMsg;

  // ── Overlay simple para intro/final ─────────────────────────────────────
  const simpleOverlay = (currentStep.isIntro || currentStep.isFinal) ? (
    <div style={{ position:'fixed', inset:0, zIndex:9990, background:'rgba(2,6,23,0.88)', backdropFilter:'blur(3px)', pointerEvents:'all' }} />
  ) : null;

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const tooltipStyle = {
    position: 'fixed',
    ...(tooltipBottom !== null ? { bottom: tooltipBottom } : { top: Math.max(8, tooltipTop) }),
    left: Math.max(8, tooltipLeft),
    width: tooltipW,
    zIndex: 2147483647,
    background: 'white',
    borderRadius: 22,
    boxShadow: tooltipBottom !== null
      ? '0 -8px 40px rgba(0,0,0,0.18), 0 32px 80px rgba(0,0,0,0.3)'
      : '0 32px 80px rgba(0,0,0,0.5)',
    padding: '18px 20px 14px',
    opacity: animOut ? 0 : 1,
    transform: animOut ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
    transition: 'opacity 0.18s ease, transform 0.18s ease',
    pointerEvents: 'all',
    maxHeight: vh - 32,
    overflowY: 'auto',
  };

  const tooltipEl = (
    <div style={tooltipStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{
          width:46, height:46, borderRadius:14, flexShrink:0,
          background: currentStep.isFinal ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#eff6ff,#dbeafe)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:24,
          border: currentStep.isFinal ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
        }}>
          {currentStep.emoji}
        </div>
        <h3 style={{ fontWeight:800, fontSize:14, color:'#0f172a', lineHeight:1.3, flex:1, margin:0 }}>
          {currentStep.title}
        </h3>
      </div>

      <p style={{ color:'#475569', fontSize:13, lineHeight:1.65, margin:'0 0 10px', whiteSpace:'pre-line' }}>
        {currentStep.description}
      </p>

      {/* Demos inline */}
      {hasInlineDemo && currentStep.inlineDemo === 'drag_demo'       && <DragDemo />}
      {hasInlineDemo && currentStep.inlineDemo === 'swipe_reasignar' && <SwipeReasignarDEMO />}
      {hasInlineDemo && currentStep.inlineDemo === 'confirmar_flujo' && <ConfirmarFlujoDEMO />}
      {hasInlineDemo && currentStep.inlineDemo === 'sello_demo'      && <SelloDEMO />}
      {hasInlineDemo && currentStep.inlineDemo === 'notas_entrega'   && <NotasEntregaDEMO />}

      {showFallback && (
        <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'8px 12px', fontSize:11, color:'#92400e', fontWeight:600, marginBottom:10 }}>
          ℹ️ {currentStep.fallbackMsg}
        </div>
      )}

      {/* Barra de progreso */}
      <div style={{ display:'flex', gap:3, alignItems:'center', margin:'12px 0' }}>
        {TOUR_STEPS.map((_, i) => (
          <div key={i} style={{
            height:4, width: i === step ? 20 : 5, borderRadius:2, flexShrink:0,
            background: i === step ? '#3b82f6' : i < step ? '#93c5fd' : '#e2e8f0',
            transition:'all 0.3s ease',
          }} />
        ))}
        <span style={{ marginLeft:6, fontSize:11, color:'#94a3b8', fontWeight:600, flexShrink:0 }}>
          {step+1}/{TOUR_STEPS.length}
        </span>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        {step > 0 && !currentStep.isFinal && (
          <button onClick={goPrev} style={{ padding:'10px 14px', borderRadius:12, border:'1.5px solid #e2e8f0', background:'white', color:'#64748b', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            ← Atrás
          </button>
        )}
        <button onClick={goNext} style={{
          flex:1, padding:'11px 16px', borderRadius:12,
          background: currentStep.isFinal ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
          color:'white', fontWeight:700, fontSize:13, border:'none', cursor:'pointer',
          boxShadow: currentStep.isFinal ? '0 4px 14px rgba(22,163,74,0.35)' : '0 4px 14px rgba(59,130,246,0.3)',
        }}>
          {currentStep.isIntro ? '¡Empezamos! →' : currentStep.isFinal ? '¡Perfecto! 🎉' : 'Siguiente →'}
        </button>
      </div>

      {!currentStep.isFinal && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <button
            onClick={toggleMute}
            title={isMuted ? 'Activar voz' : 'Silenciar voz'}
            style={{
              padding: '5px 10px', borderRadius: 10,
              border: '1.5px solid #e2e8f0',
              background: isMuted ? '#f1f5f9' : '#eff6ff',
              color: isMuted ? '#94a3b8' : '#3b82f6',
              fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontWeight: 600, flexShrink: 0,
            }}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button onClick={onSkip} style={{ padding: '6px 8px', background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
            Saltar tutorial
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {simpleOverlay && createPortal(simpleOverlay, document.body)}
      {overlayEl    && createPortal(overlayEl,    document.body)}
      {createPortal(tooltipEl, document.body)}
    </>
  );
}
