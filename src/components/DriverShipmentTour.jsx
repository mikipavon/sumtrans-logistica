import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTourAudio } from '../hooks/useTourAudio';

const TOUR_STEPS = [
  // ── INTRO ─────────────────────────────────────────────────────────────
  {
    emoji: '📋',
    title: '¿Cómo crear un albarán?',
    description: 'Este tutorial abre el formulario REAL de la app y te explica cada sección campo a campo. Ningún dato se guardará — es solo formación. ¡Tarda 3 minutos!',
    audio: 'En este tutorial te explico cómo crear un albarán paso a paso. Vamos a abrir el formulario real de la aplicación. Ningún dato se guardará — es solo formación. Tarda unos tres minutos.',
    audioId: 'shipment_01_intro',
    isIntro: true,
    demoMode: null,
  },

  // ── ABRIR EL FORMULARIO ───────────────────────────────────────────────
  {
    emoji: '📝',
    title: 'Abrir el formulario',
    description: 'Pulsa el botón de crear nuevo albarán. Se abrirá el formulario real. A partir de aquí el tutorial te irá explicando cada sección.',
    audio: 'Primero, pulsa el botón de crear nuevo albarán. Se abrirá el formulario real y a partir de ahí te iré explicando cada sección.',
    audioId: 'shipment_02_abrir',
    targetId: 'driver-create-shipment-btn',
    tab: 'assign',
    padding: 10,
    demoMode: null,
  },

  // ── SECCIONES DEL FORMULARIO ──────────────────────────────────────────
  {
    emoji: '🏢',
    title: 'Remitente (quien envía)',
    description: 'Escribe el cliente que envía. La app busca en tu lista y rellena la dirección automáticamente.\n\n💡 Si vas a crear varios del mismo remitente seguidos, marca "ENVÍO MÚLTIPLE" — el formulario se reabre ya relleno.',
    audio: 'La primera sección es el remitente, que es quien envía el paquete. Escribe el nombre del cliente y la aplicación buscará en tu lista y rellenará la dirección automáticamente. Si vas a crear varios del mismo remitente seguidos, activa la opción de Envío Múltiple.',
    audioId: 'shipment_03_remitente',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-sender',
    padding: 12,
  },
  {
    emoji: '📍',
    title: 'Destinatario (quien recibe)',
    description: 'Rellena el nombre, dirección, código postal, ciudad y teléfono de quien va a recibir el paquete. Si ya está en la lista de clientes, se autocompleta todo.',
    audio: 'Ahora el destinatario, que es quien va a recibir el paquete. Rellena el nombre, la dirección, el código postal, la ciudad y el teléfono. Si ya está en la lista de clientes, se autocompleta todo.',
    audioId: 'shipment_04_destinatario',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-dest',
    padding: 12,
  },
  {
    emoji: '💶',
    title: 'Condiciones de pago',
    description: '"PAGADO (Remitente)" → ya pagó el remitente, no cobres al entregar.\n"DEBIDO (Destinatario)" → cobras al entregar.\n\n"Con Retorno" → el cliente te devuelve algo.\n"Firma Doc." → el cliente firma el albarán de papel.',
    audio: 'Las condiciones de pago. Pagado significa que el remitente ya pagó y no cobras al entregar. Debido significa que cobras al entregar. Con Retorno significa que el cliente te devuelve algo. Y Firma de Documento significa que el cliente firma el albarán de papel.',
    audioId: 'shipment_05_pago',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-payment',
    padding: 12,
  },
  {
    emoji: '📦',
    title: 'Artículos y Servicios',
    description: 'Selecciona el tipo de bulto (BLT_1, BLT_2...) y la cantidad. El precio se calcula solo según la tarifa del cliente. Si aparece el campo "Kg", introduce el peso.',
    audio: 'Selecciona el tipo de bulto y la cantidad. El precio se calcula solo según la tarifa del cliente. Si aparece el campo de kilogramos, introduce el peso.',
    audioId: 'shipment_06_articulos',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-articles',
    padding: 12,
  },
  {
    emoji: '💸',
    title: 'Reembolso (COD)',
    description: 'Si el destinatario debe pagarte dinero en efectivo que luego devuelves al remitente, escríbelo aquí. Esto activa el modo COD y añade la comisión automáticamente.',
    audio: 'Si el destinatario debe pagarte dinero en efectivo que luego devuelves al remitente, escribe el importe aquí. Esto activa el modo de reembolso y añade la comisión automáticamente.',
    audioId: 'shipment_07_reembolso',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-cod',
    padding: 12,
  },
  {
    emoji: '💰',
    title: 'Precio / Facturación',
    description: 'Si el precio está fijado en tarifa aparecerá en gris. Puedes pulsarlo para sobrescribirlo si es necesario. Normalmente no hace falta tocarlo — se calcula solo.',
    audio: 'Si el precio está fijado en tarifa aparecerá en gris. Puedes pulsarlo para cambiarlo si es necesario. Normalmente no hace falta tocarlo porque se calcula solo.',
    audioId: 'shipment_08_precio',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-price',
    padding: 12,
  },
  {
    emoji: '💾',
    title: 'Guardar el albarán',
    description: 'Cuando hayas rellenado los datos pulsa "Generar Albarán". Quedará registrado en el sistema.\n\n📚 En este tutorial el botón no guarda nada real — puedes pulsarlo para avanzar.',
    audio: 'Cuando hayas rellenado todos los datos, pulsa Generar Albarán. Quedará registrado en el sistema. En el tutorial, el botón no guarda nada real, pero puedes pulsarlo para avanzar.',
    audioId: 'shipment_09_guardar',
    isRealModal: true,
    demoMode: 'create_form',
    targetId: 'shipment-form-save-btn',
    padding: 12,
  },

  // ── DESPUÉS DE GUARDAR ────────────────────────────────────────────────
  {
    emoji: '➡️',
    title: '¿Dónde va el albarán después de guardarlo?',
    description: 'Una vez guardado, el albarán queda en el sistema a la espera de que la oficina lo asigne al conductor de reparto:\n\n• Recogida de mañana → asignado al reparto de tarde\n• Creado por la tarde → asignado al reparto de mañana siguiente',
    audio: 'Una vez guardado, el albarán queda en el sistema esperando que la oficina lo asigne al conductor de reparto. Si lo creas por la mañana, va al reparto de tarde. Si lo creas por la tarde, va al reparto de la mañana siguiente.',
    audioId: 'shipment_10_despues',
    targetId: 'driver-tab-assign',
    tab: 'assign',
    padding: 8,
    demoMode: null,
  },
  {
    emoji: '👥',
    title: 'Así se ve la asignación',
    description: 'Debajo de cada albarán aparece una fila con los repartidores sugeridos por turno y un desplegable manual. Los botones parpadeantes en rojo son el turno más urgente.',
    audio: 'Así se ve la pantalla de asignación. Debajo de cada albarán aparece una fila con los repartidores sugeridos y un botón que parpadea en rojo indicando el turno más urgente.',
    audioId: 'shipment_11_asignacion',
    demoMode: null,
    inlineDemo: 'assign_card',
  },

  // ── CONFIRMAR ENTREGA ─────────────────────────────────────────────────
  {
    emoji: '🚪',
    title: 'Llegando al cliente',
    description: 'Cuando te asignen el reparto, verás las tarjetas de tus envíos en "Reparto". Cuando llegues a la dirección, localiza la tarjeta y pulsa "Confirmar Entrega".',
    audio: 'Cuando te asignen el reparto, verás las tarjetas de tus envíos en la pestaña Reparto. Cuando llegues a la dirección, localiza la tarjeta y pulsa Confirmar Entrega.',
    audioId: 'shipment_12_cliente',
    targetId: 'driver-tab-route',
    tab: 'route',
    padding: 8,
    demoMode: null,
  },
  {
    emoji: '💰',
    title: 'Cobros al entregar',
    description: 'Si hay importe a cobrar (Porte Debido o Reembolso COD) aparece en rojo automáticamente. Usa la calculadora de cambio si el cliente te da un billete grande.',
    audio: 'Si hay importe a cobrar — porte debido o reembolso — aparece en rojo automáticamente. Puedes usar la calculadora de cambio si el cliente te da un billete grande.',
    audioId: 'shipment_13_cobros',
    isRealModal: true,
    demoMode: 'delivery_debido',
  },
  {
    emoji: '📋',
    title: 'Varios portes del mismo cliente',
    description: 'Si el cliente tenía albaranes anteriores sin cobrar, aparecen TODOS agrupados. Puedes cobrarlos de golpe o desmarcar los que no puedas cobrar ahora.',
    audio: 'Si el cliente tenía albaranes anteriores sin cobrar, aparecen todos agrupados. Puedes cobrarlos todos a la vez o desmarcar los que no puedas cobrar en ese momento.',
    audioId: 'shipment_14_agrupados',
    isRealModal: true,
    demoMode: 'delivery_multi',
  },
  {
    emoji: '✍️',
    title: 'Nombre y firma',
    description: '¡Practica ahora! Escribe el nombre de quien recibe y pide la firma con el dedo en la pantalla. En el tutorial no se guarda nada.',
    audio: 'Pide al cliente que escriba su nombre y firme con el dedo en la pantalla. En el tutorial no se guarda nada, así que puedes practicar.',
    audioId: 'shipment_15_firma',
    isRealModal: true,
    demoMode: 'delivery_debido',
  },
  {
    emoji: '✅',
    title: 'Confirmar entrega',
    description: 'Pulsa "Entregado" para registrar la entrega con la prueba (firma, foto). En el tutorial este botón no guarda nada — en el trabajo real sí queda todo guardado.',
    audio: 'Pulsa Entregado para registrar la entrega con la prueba de firma o foto. En el tutorial este botón no guarda nada, pero en el trabajo real sí queda todo guardado.',
    audioId: 'shipment_16_confirmar',
    isRealModal: true,
    demoMode: 'delivery_debido',
  },
  {
    emoji: '🎉',
    title: '¡Ya sabes crear albaranes!',
    description: 'Flujo completo: Rellenar formulario → guardar → esperar asignación → llegar al cliente → confirmar con firma o foto. Vuelve a este tutorial desde el botón 📚.',
    audio: '¡Ya sabes crear albaranes! El flujo completo es: rellenar el formulario, guardar, esperar la asignación, llegar al cliente, y confirmar con firma o foto. Puedes volver a este tutorial desde el botón de tutoriales.',
    audioId: 'shipment_17_final',
    isFinal: true,
    demoMode: null,
  },
];

// ─── DEMO INLINE: tarjeta de asignación ─────────────────────────────────────
const PULSE_STYLE = `
@keyframes tour-pulse {
  0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
  50%      { opacity:.75; box-shadow: 0 0 0 5px rgba(239,68,68,0); }
}
.tour-pulse-btn { animation: tour-pulse 1.3s infinite; }
`;

function AssignCardDemo() {
  const [selected, setSelected] = useState(null);
  const [done, setDone]       = useState(false);

  const hour = new Date().getHours();
  const isMorning = hour < 15;
  const urgentLabel = isMorning ? '🌙 reparto tarde' : '☀️ reparto mañana';
  const urgentDriver = { id: 'miguel', name: 'Miguel', initials: 'MP' };
  const otherDriver  = { id: 'carlos',  name: 'Carlos',  initials: 'CG' };

  const handleAssign = (who) => {
    setSelected(who);
    setTimeout(() => setDone(true), 300);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <style>{PULSE_STYLE}</style>

      {/* Mini-tarjeta albarán */}
      <div style={{
        background: 'white', borderRadius: 14,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}>
        {/* Cabecera */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 9, fontWeight: 800, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 5, padding: '2px 6px', letterSpacing: 0.5 }}>ALBARÁN</span>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', margin: '3px 0 1px' }}>MERCADONA S.A.</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>📍 Avda. Ronda Tejares 13 · Córdoba</p>
          </div>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#cbd5e1', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 6, padding: '2px 5px' }}>ALB-1042</span>
        </div>

        {/* Fila de asignación */}
        {!done ? (
          <div style={{ padding: '10px 14px', background: '#fafafa' }}>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Asignar a conductor</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

              {/* Urgente (parpadea) */}
              <button
                className="tour-pulse-btn"
                onClick={() => handleAssign('miguel')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                  background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  color: 'white', border: '2px solid #f87171', cursor: 'pointer',
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900 }}>
                  {urgentDriver.initials}
                </span>
                {urgentDriver.name} — <em style={{ fontStyle: 'normal', opacity: 0.9 }}>{urgentLabel}</em>
              </button>

              {/* Otro turno */}
              <button
                onClick={() => handleAssign('carlos')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                  background: '#fffbeb', color: '#92400e',
                  border: '1px solid #fcd34d', cursor: 'pointer',
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900 }}>
                  {otherDriver.initials}
                </span>
                {otherDriver.name}
              </button>

              {/* Desplegable manual */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                <span style={{ fontSize: 16, color: '#94a3b8' }}>👤</span>
                <select
                  style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '7px 10px', fontSize: 11,
                    color: '#334155', cursor: 'pointer',
                  }}
                  value=""
                  onChange={e => { if (e.target.value) handleAssign(e.target.value); }}
                >
                  <option value="">Asignar a...</option>
                  <option value="miguel">Miguel Pavón</option>
                  <option value="carlos">Carlos García</option>
                  <option value="pedro">Pedro Ruiz</option>
                  <option value="antonio">Antonio López</option>
                  <option value="jose">José Fernández</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          /* Confirmación animada */
          <div style={{
            padding: '12px 14px', background: '#f0fdf4',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div>
              <p style={{ fontWeight: 800, fontSize: 12, color: '#15803d', margin: 0 }}>
                ¡Asignado a {
                  selected === 'miguel' ? 'Miguel Pavón' :
                  selected === 'carlos' ? 'Carlos García' :
                  selected === 'pedro'  ? 'Pedro Ruiz' :
                  selected === 'antonio'? 'Antonio López' :
                  selected === 'jose'   ? 'José Fernández' : selected
                }!
              </p>
              <p style={{ fontSize: 11, color: '#16a34a', margin: '2px 0 0' }}>Pasa a la pestaña Reparto del conductor.</p>
            </div>
            <button onClick={() => { setSelected(null); setDone(false); }} style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>Reiniciar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DriverShipmentTour({ isVisible, onComplete, onSkip, onChangeTab, onDemoModeChange }) {
  const [step, setStep] = useState(0);
  const [animOut, setAnimOut] = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const { speak, stop, isMuted, toggleMute } = useTourAudio();

  const currentStep = TOUR_STEPS[step];
  const isRealModal = !!currentStep.isRealModal;
  const hasTarget    = !!currentStep.targetId;
  const hasInlineDemo = !!currentStep.inlineDemo;

  useEffect(() => {
    if (!isVisible) return;
    onDemoModeChange?.(currentStep.demoMode || null);
  }, [step, isVisible, currentStep, onDemoModeChange]);

  useEffect(() => {
    if (!isVisible) { onDemoModeChange?.(null); stop(); return; }
    setStep(0);
  }, [isVisible, onDemoModeChange, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Narrar cada paso
  useEffect(() => {
    if (!isVisible) return;
    const { audio, audioId } = currentStep;
    if (audio || audioId) {
      const t = setTimeout(() => speak(audio, audioId), 400);
      return () => clearTimeout(t);
    }
  }, [step, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isVisible) return;
    if (currentStep.tab && onChangeTab) onChangeTab(currentStep.tab);
  }, [step, isVisible, currentStep, onChangeTab]);

  // Medir elemento + scroll al campo (funciona tanto en modal como en UI normal)
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
    const t = setTimeout(measure, 320);
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

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = currentStep.padding || 8;

  // Spotlight coords — se calculan siempre que haya targetRect
  let sTop = 0, sLeft = 0, sRight = vw, sBottom = vh;
  if (targetRect && hasTarget) {
    sTop    = Math.max(0, targetRect.top - pad);
    sLeft   = Math.max(0, targetRect.left - pad);
    sRight  = Math.min(vw, targetRect.right + pad);
    sBottom = Math.min(vh, targetRect.bottom + pad);
  }

  // Posición tooltip
  const tooltipW = Math.min(330, vw - 32);
  // useBottom: cuando hay modal real SIN campo concreto, anclamos abajo para no tapar el modal
  const useBottom = isRealModal && !hasTarget;
  let tooltipTop = 0, tooltipLeft = 0, tooltipBottom = 0;
  // maxH: espacio vertical disponible para el tooltip (para que los botones no se corten)
  let tooltipMaxH = vh - 32;

  if (useBottom) {
    // Barra flotante en la parte inferior — el modal queda visible encima
    tooltipBottom = 16;
    tooltipLeft   = Math.max(16, vw / 2 - tooltipW / 2);
    tooltipMaxH   = Math.min(320, vh * 0.45);
  } else if (isRealModal && hasTarget && targetRect) {
    // Elegir el lado con MÁS espacio disponible
    const spaceBelow = vh - sBottom - 16;   // espacio libre debajo del campo
    const spaceAbove = sTop - 16;           // espacio libre encima del campo
    if (spaceBelow >= spaceAbove) {
      // Hay más espacio abajo → tooltip DEBAJO del campo
      tooltipTop  = sBottom + 12;
      tooltipMaxH = Math.max(100, spaceBelow - 8);
    } else {
      // Hay más espacio arriba → tooltip ENCIMA del campo
      tooltipMaxH = Math.max(100, spaceAbove - 8);
      tooltipTop  = Math.max(8, sTop - 12 - tooltipMaxH);
    }
    tooltipLeft = Math.max(16, vw / 2 - tooltipW / 2);
  } else if (isRealModal && hasTarget && !targetRect) {
    // Sin rect todavía: tooltip arriba por defecto
    tooltipTop  = 12;
    tooltipLeft = Math.max(16, vw / 2 - tooltipW / 2);
    tooltipMaxH = vh * 0.4;
  } else if (currentStep.isFinal || currentStep.isIntro) {
    tooltipTop  = 16;
    tooltipLeft = vw / 2 - tooltipW / 2;
    tooltipMaxH = vh - 32;
  } else if (targetRect && hasTarget) {
    const spaceBelow = vh - sBottom - 16;
    const spaceAbove = sTop - 16;
    if (spaceBelow >= spaceAbove) {
      tooltipTop  = sBottom + 12;
      tooltipMaxH = Math.max(100, spaceBelow - 8);
    } else {
      tooltipMaxH = Math.max(100, spaceAbove - 8);
      tooltipTop  = Math.max(8, sTop - 12 - tooltipMaxH);
    }
    tooltipLeft = Math.max(16, Math.min(vw - tooltipW - 16, (sLeft + sRight) / 2 - tooltipW / 2));
  } else {
    tooltipTop  = 16;
    tooltipLeft = vw / 2 - tooltipW / 2;
    tooltipMaxH = vh - 32;
  }

  // Padding compacto si el espacio es pequeño
  const compact = tooltipMaxH < 220;
  const tPad = compact ? '12px 16px 10px' : '18px 20px 14px';

  // ── PORTAL 1: Overlay (solo cuando NO hay modal real) ────────────────
  const overlayEl = !isRealModal ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none' }}>
      {hasTarget && targetRect ? (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: sTop, background: 'rgba(2,6,23,0.85)', pointerEvents: 'all' }} />
          <div style={{ position: 'fixed', top: sBottom, left: 0, right: 0, bottom: 0, background: 'rgba(2,6,23,0.85)', pointerEvents: 'all' }} />
          <div style={{ position: 'fixed', top: sTop, left: 0, width: sLeft, height: sBottom - sTop, background: 'rgba(2,6,23,0.85)', pointerEvents: 'all' }} />
          <div style={{ position: 'fixed', top: sTop, left: sRight, right: 0, height: sBottom - sTop, background: 'rgba(2,6,23,0.85)', pointerEvents: 'all' }} />
          <div style={{
            position: 'fixed', top: sTop, left: sLeft,
            width: sRight - sLeft, height: sBottom - sTop,
            borderRadius: 14, border: '2px solid rgba(96,165,250,0.95)',
            boxShadow: '0 0 0 1px rgba(96,165,250,0.2), 0 0 32px rgba(59,130,246,0.4)',
            pointerEvents: 'none',
          }} />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(2px)', pointerEvents: 'all' }} />
      )}
    </div>
  ) : null;

  // ── PORTAL 2: Spotlight sobre modal real (z > 9999 modal) ───────────
  // Paneles semi-transparentes sin bloquear interacción + borde azul sobre el campo
  const modalSpotlightEl = isRealModal && hasTarget && targetRect ? (
    <>
      {/* Paneles oscuros no interactivos encima del modal */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: sTop, background: 'rgba(0,0,0,0.55)', zIndex: 10000, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: sBottom, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: sTop, left: 0, width: sLeft, height: sBottom - sTop, background: 'rgba(0,0,0,0.55)', zIndex: 10000, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: sTop, left: sRight, right: 0, height: sBottom - sTop, background: 'rgba(0,0,0,0.55)', zIndex: 10000, pointerEvents: 'none' }} />
      {/* Borde azul sobre el campo explicado */}
      <div style={{
        position: 'fixed',
        top: sTop, left: sLeft,
        width: sRight - sLeft, height: sBottom - sTop,
        borderRadius: 14,
        border: '3px solid #3b82f6',
        boxShadow: '0 0 0 3px rgba(59,130,246,0.25), 0 0 30px rgba(59,130,246,0.5)',
        zIndex: 10001,
        pointerEvents: 'none',
      }} />
    </>
  ) : null;

  // ── PORTAL 3: Tooltip (z máximo, siempre visible) ───────────────────
  const tooltipStyle = useBottom
    ? {
        position: 'fixed',
        bottom: tooltipBottom,
        left: Math.max(8, tooltipLeft),
        width: tooltipW,
        maxHeight: tooltipMaxH,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483647,
        background: 'white',
        borderRadius: 22,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.25), 0 32px 80px rgba(0,0,0,0.4)',
        padding: tPad,
        opacity: animOut ? 0 : 1,
        transform: animOut ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        pointerEvents: 'all',
        overflowY: 'hidden',
      }
    : {
        position: 'fixed',
        top: Math.max(8, tooltipTop),
        left: Math.max(8, tooltipLeft),
        width: tooltipW,
        maxHeight: tooltipMaxH,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483647,
        background: 'white',
        borderRadius: 22,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: tPad,
        opacity: animOut ? 0 : 1,
        transform: animOut ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        pointerEvents: 'all',
        overflowY: 'hidden',
      };

  const tooltipEl = (
    <div style={tooltipStyle}>
      {isRealModal && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '3px 10px', marginBottom: 10, fontSize: 10, fontWeight: 700, color: '#15803d' }}>
          ✅ Formulario real — puedes interactuar con él
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: currentStep.isFinal ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#eff6ff,#dbeafe)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          border: currentStep.isFinal ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
        }}>
          {currentStep.emoji}
        </div>
        <h3 style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', lineHeight: 1.3, flex: 1, margin: 0 }}>
          {currentStep.title}
        </h3>
      </div>

      {/* Zona scrollable: sólo el texto puede hacer scroll, el header y botones siempre visibles */}
      <div style={{ overflowY: 'auto', flexGrow: 1, marginBottom: 8 }}>
        <p style={{ color: '#475569', fontSize: compact ? 12 : 13, lineHeight: 1.6, margin: '0 0 6px', whiteSpace: 'pre-line' }}>
          {currentStep.description}
        </p>

        {/* Demo inline embed (ej. assign_card) — va DENTRO del tooltip */}
        {hasInlineDemo && currentStep.inlineDemo === 'assign_card' && <AssignCardDemo />}
      </div>

      <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: compact ? 8 : 14, marginTop: compact ? 6 : 14, flexShrink: 0 }}>
        {TOUR_STEPS.map((_, i) => (
          <div key={i} style={{
            height: 4, width: i === step ? 20 : 5, borderRadius: 2, flexShrink: 0,
            background: i === step ? '#3b82f6' : i < step ? '#93c5fd' : '#e2e8f0',
            transition: 'all 0.3s ease',
          }} />
        ))}
        <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
          {step + 1}/{TOUR_STEPS.length}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {step > 0 && !currentStep.isFinal && (
          <button onClick={goPrev} style={{ padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            ← Atrás
          </button>
        )}
        <button onClick={goNext} style={{
          flex: 1, padding: '11px 16px', borderRadius: 12,
          background: currentStep.isFinal ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
          color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
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
      {overlayEl  && createPortal(overlayEl,         document.body)}
      {modalSpotlightEl && createPortal(modalSpotlightEl, document.body)}
      {createPortal(tooltipEl, document.body)}
    </>
  );
}
