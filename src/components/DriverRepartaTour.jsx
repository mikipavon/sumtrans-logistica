import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Pasos — isRealContext: true = sin overlay, tooltip ancla abajo, app visible
// targetId: spotlight sobre elemento real
const TOUR_STEPS = [
  {
    emoji: '🚚',
    title: 'Tutorial: Gestión del Reparto',
    description: 'Te explico todos los elementos de la pestaña Reparto usando la app real. Podrás ver cada botón y función tal como aparece en tu día a día.',
    isIntro: true,
    tab: 'route',
  },
  {
    emoji: '↕️',
    title: 'Mover albaranes arrastrando',
    description: 'Mantén pulsada cualquier tarjeta de la lista y arrástrala arriba o abajo para cambiar su posición en la ruta.\n\nCambia el orden según el tráfico o las urgencias del momento.',
    tab: 'route',
    targetId: 'tour-route-header',
    padding: 60,
  },
  {
    emoji: '✨',
    title: 'Optimizar Ruta (v4)',
    description: 'Este botón morado agrupa automáticamente las paradas por pueblos y calcula el orden más eficiente.\n\nDespués de pulsar, aparecerá el botón verde "Ver Mapa" para ver la ruta en Maps.',
    tab: 'route',
    targetId: 'tour-optimize-btn',
    padding: 10,
  },
  {
    emoji: '📍',
    title: 'Botón GPS — Navegar',
    description: 'El icono 📍 azul de cada tarjeta abre Google Maps directamente con la dirección del destinatario ya cargada.\n\nSi hay coordenadas GPS exactas, calcula la ruta. Si no, busca la dirección.',
    tab: 'route',
    targetId: 'tour-gps-btn',
    padding: 8,
    fallbackMsg: 'Necesitas al menos un albarán en Reparto para ver este botón.',
  },
  {
    emoji: '📞',
    title: 'Llamar al cliente',
    description: 'Si el destinatario tiene teléfono guardado, aparece el icono 📞 verde junto al GPS.\n\nAl pulsarlo llamas directamente sin salir de la app. Si no hay teléfono, el icono no aparece.',
    tab: 'route',
    targetId: 'tour-phone-btn',
    padding: 8,
    fallbackMsg: 'Este icono solo aparece si el albarán tiene teléfono del destinatario guardado.',
  },
  {
    emoji: '📄',
    title: 'Menú de documentos (⋯)',
    description: 'El icono de documento 📄 azul abre un menú con dos opciones:\n\n🖨️ IMPRIMIR TICKET — imprime el albarán en formato pequeño\n📤 ENVIAR WHATSAPP — manda un mensaje al cliente con los datos del envío',
    tab: 'route',
    targetId: 'tour-doc-btn',
    padding: 8,
    fallbackMsg: 'Necesitas al menos un albarán en Reparto para ver este botón.',
  },
  {
    emoji: '💶',
    title: 'Identificar cobros en las tarjetas',
    description: 'Si una tarjeta muestra la etiqueta verde 💰 "COBRAR: Porte: Xé + Reembolso: Xé" significa que debes cobrar al entregar.\n\n• Porte: X€ → lo cobra el repartidor y lo entrega en oficina\n• Reembolso: X€ → lo cobra y lo entrega al remitente con justificante',
    tab: 'route',
    targetId: 'tour-deliver-btn',
    padding: 12,
    fallbackMsg: 'Pulsa en cualquier tarjeta de reparto para ver si tiene cobros pendientes.',
  },
  {
    emoji: '⚠️',
    title: 'Registrar una incidencia',
    description: 'Si no puedes entregar, pulsa el botón rojo ⚠️ "Incidencia" en la tarjeta.\n\nSelecciona el motivo: Ausente, Dirección incorrecta, Rehúsa la entrega...\n\nEl albarán queda marcado en rojo y la oficina recibirá la notificación.',
    tab: 'route',
    targetId: 'tour-incident-btn',
    padding: 8,
    fallbackMsg: 'Necesitas al menos un albarán en Reparto para ver el botón de incidencia.',
  },
  {
    emoji: '📋',
    title: 'Ventana de incidencias',
    description: 'Al pulsar "Incidencia" se abre este formulario. Tienes tres formas de escribir el motivo:\n\n✏️ Escribir manualmente en el cuadro\n🎤 Dictar por voz pulsando el botón "Hablar"\n🔘 Usar los botones de acceso rápido (abajo)',
    tab: 'route',
    isIncidentModal: true,   // señal para abrir el modal real
    targetId: 'tour-incident-textarea',
    padding: 10,
  },
  {
    emoji: '🔘',
    title: 'Botones de acceso rápido',
    description: 'Los botones de la parte inferior del formulario insertan el motivo de un solo toque, sin tener que escribir:\n\n• Cliente ausente\n• Dirección incorrecta\n• Paquete dañado\n• Local cerrado\n• Rechazado\n• No dispone del reembolso',
    tab: 'route',
    isIncidentModal: true,   // mantener modal abierto
    targetId: 'tour-incident-shortcuts',
    padding: 6,
  },
  {
    emoji: '🎉',
    title: '¡Ya dominas el Reparto!',
    description: '✅ Arrastra para reordenar\n✨ Optimizador agrupa por pueblo\n📍 GPS abre Maps directamente\n📞 Llama si hay teléfono\n📄 WhatsApp o Ticket desde el menú\n💶 Etiqueta verde = cobrar al entregar\n⚠️ Incidencia → modal con atajos rápidos',
    isFinal: true,
    tab: 'route',
  },
];

export default function DriverRepartaTour({ isVisible, onComplete, onSkip, onChangeTab, onOpenIncidentModal, onCloseIncidentModal }) {
  const [step, setStep]         = useState(0);
  const [animOut, setAnimOut]   = useState(false);
  const [targetRect, setTargetRect] = useState(null);

  // Guardar callbacks en refs para que nunca causen re-disparos innecesarios
  const openModalRef  = useRef(onOpenIncidentModal);
  const closeModalRef = useRef(onCloseIncidentModal);
  useEffect(() => { openModalRef.current  = onOpenIncidentModal; },  [onOpenIncidentModal]);
  useEffect(() => { closeModalRef.current = onCloseIncidentModal; }, [onCloseIncidentModal]);

  const currentStep = TOUR_STEPS[step];
  const hasTarget   = !!currentStep.targetId;

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

  // Reset al abrir / cerrar modal al cerrar tour
  // Solo depende de isVisible para no dispararse con re-renders del padre
  useEffect(() => {
    if (!isVisible) {
      closeModalRef.current?.();
      return;
    }
    setStep(0);
  }, [isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const tooltipW = Math.min(330, vw - 32);
  const tooltipLeft = Math.max(16, vw / 2 - tooltipW / 2);

  // Si hay target y elemento visible → anclar tooltip arriba o abajo del spotlight
  // Si no hay target o no se encontró → anclar siempre abajo (app visible debajo)
  let tooltipTop = null, tooltipBottom = null;

  if (hasTarget && targetRect) {
    const spaceBelow = vh - sBottom;
    const spaceAbove = sTop;
    if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
      tooltipTop = Math.min(vh - 200, sBottom + 14);
    } else {
      tooltipTop = Math.max(8, sTop - 14 - 240);
    }
  } else if (currentStep.isIntro || currentStep.isFinal) {
    tooltipTop = vh / 2 - 160;
  } else {
    tooltipBottom = 16; // sin target → barra inferior
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
        <button onClick={onSkip} style={{ width:'100%', marginTop:10, padding:'6px', background:'none', border:'none', color:'#94a3b8', fontSize:12, cursor:'pointer', fontWeight:500 }}>
          Saltar tutorial
        </button>
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
