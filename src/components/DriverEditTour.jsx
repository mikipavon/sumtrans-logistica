import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Pasos del tutorial de edición de albarán
// isDetailsModal: true → abrir el ShipmentDetailsModal real
const TOUR_STEPS = [
  {
    emoji: '✏️',
    title: 'Corregir un albarán',
    description: 'Te explico cómo modificar un albarán si te has equivocado en el remitente, destinatario, portes o artículos, usando directamente la app real.',
    isIntro: true,
  },
  {
    emoji: '👆',
    title: 'Paso 1: Pulsa en el albarán',
    description: 'Para editar un albarán, pulsa directamente sobre la tarjeta — en la zona del nombre o dirección, no en los botones de acción.\n\n⬆️ El albarán señalado arriba es un ejemplo. Pulsa sobre él para abrirlo.',
    tab: 'route',
    targetId: 'tour-first-card',
    padding: 6,
    fallbackMsg: 'Necesitas al menos un albarán en la pestaña Reparto. Cuando lo tengas, pulsa sobre la tarjeta para abrirlo.',
  },
  {
    emoji: '✏️',
    title: 'Paso 2: Botón de editar ✏️',
    description: 'En la cabecera del albarán abierto verás un icono ✏️ de lápiz en color azul.\n\nPúlsalo para activar el modo de edición. Todos los campos se vuelven editables.',
    isDetailsModal: true,
    targetId: 'tour-edit-btn',
    padding: 10,
    fallbackMsg: 'El icono ✏️ aparece cuando el albarán NO está en modo solo lectura.',
  },
  {
    emoji: '🏠',
    title: 'Paso 3: Cambiar el Remitente (Origen)',
    description: 'La sección azul "ORIGEN (REMITENTE)" tiene todos los datos del que envía:\n\n• Nombre del remitente\n• Dirección de recogida\n• Población y C.P.\n• Teléfono\n\nCambia el nombre y si está en tu lista de clientes, los demás campos se rellenan solos.',
    isDetailsModal: true,
    targetId: 'tour-edit-origin',
    padding: 12,
  },
  {
    emoji: '📦',
    title: 'Paso 4: Cambiar el Destinatario',
    description: 'La sección verde "DESTINO (ENTREGA)" tiene los datos de quien recibe:\n\n• Nombre del destinatario\n• Dirección de entrega\n• Población y C.P.\n• Teléfono y Contacto\n\nIgual que el remitente: si escribes un nombre de cliente conocido, se autocompleta.',
    isDetailsModal: true,
    targetId: 'tour-edit-destination',
    padding: 12,
  },
  {
    emoji: '💶',
    title: 'Paso 5: Cambiar portes y artículos',
    description: 'En la sección de importes puedes:\n\n📦 Añadir o quitar artículos del desplegable\n💶 Modificar el precio final del porte\n💰 Cambiar el importe del reembolso COD\n\nAl cambiar artículos, el importe total se recalcula automáticamente.',
    isDetailsModal: true,
    targetId: 'tour-edit-amounts',
    padding: 12,
  },
  {
    emoji: '💾',
    title: 'Paso 6: Guardar los cambios',
    description: 'Cuando hayas terminado de corregir, baja hasta el final del formulario y pulsa el botón azul "💾 Guardar Cambios".\n\nLos cambios se guardan en la nube al instante y el albarán queda actualizado para todos.',
    isDetailsModal: true,
    targetId: 'tour-edit-amounts',
    padding: 200,
    scrollToBottom: true,
  },
  {
    emoji: '🎉',
    title: '¡Albarán corregido!',
    description: 'Resumen para corregir errores:\n\n1️⃣ Pulsa la tarjeta del albarán\n2️⃣ Toca el ✏️ lápiz azul\n3️⃣ Edita Remitente / Destinatario / Portes / Artículos\n4️⃣ Pulsa 💾 Guardar Cambios\n\nLos cambios son instantáneos y se sincronizan con la oficina.',
    isFinal: true,
  },
];

export default function DriverEditTour({ isVisible, onComplete, onSkip, onChangeTab, onOpenDetailsModal, onCloseDetailsModal }) {
  const [step, setStep]       = useState(0);
  const [animOut, setAnimOut] = useState(false);
  const [targetRect, setTargetRect] = useState(null);

  // Refs para callbacks (evitar re-disparos por referencias inline)
  const openRef  = useRef(onOpenDetailsModal);
  const closeRef = useRef(onCloseDetailsModal);
  useEffect(() => { openRef.current  = onOpenDetailsModal; },  [onOpenDetailsModal]);
  useEffect(() => { closeRef.current = onCloseDetailsModal; }, [onCloseDetailsModal]);

  const currentStep = TOUR_STEPS[step];
  const hasTarget   = !!currentStep.targetId;

  // Cambiar pestaña
  useEffect(() => {
    if (!isVisible) return;
    if (currentStep.tab && onChangeTab) onChangeTab(currentStep.tab);
  }, [step, isVisible, currentStep, onChangeTab]);

  // Abrir/cerrar modal de detalles
  useEffect(() => {
    if (!isVisible) return;
    if (currentStep.isDetailsModal) {
      openRef.current?.();
    } else {
      closeRef.current?.();
    }
  }, [step, isVisible, currentStep]);

  // Reset y limpieza
  useEffect(() => {
    if (!isVisible) {
      closeRef.current?.();
      return;
    }
    setStep(0);
  }, [isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Medir el elemento target
  useEffect(() => {
    if (!isVisible || !currentStep.targetId) { setTargetRect(null); return; }
    const measure = () => {
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        if (currentStep.scrollToBottom) {
          el.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => setTargetRect(el.getBoundingClientRect()), 450);
      } else {
        setTargetRect(null);
      }
    };
    const t = setTimeout(measure, 400);
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

  let sTop = 0, sLeft = 0, sRight = vw, sBottom = vh;
  if (targetRect && hasTarget) {
    sTop    = Math.max(0, targetRect.top    - pad);
    sLeft   = Math.max(0, targetRect.left   - pad);
    sRight  = Math.min(vw, targetRect.right + pad);
    sBottom = Math.min(vh, targetRect.bottom + pad);
  }

  const tooltipW    = Math.min(330, vw - 32);
  const tooltipLeft = Math.max(16, vw / 2 - tooltipW / 2);

  let tooltipTop = null, tooltipBottom = null;

  if (hasTarget && targetRect) {
    const spaceBelow = vh - sBottom;
    const spaceAbove = sTop;
    if (spaceBelow >= 190 || spaceBelow >= spaceAbove) {
      tooltipTop = Math.min(vh - 220, sBottom + 14);
    } else {
      tooltipTop = Math.max(8, sTop - 14 - 230);
    }
  } else if (currentStep.isIntro || currentStep.isFinal) {
    tooltipTop = vh / 2 - 160;
  } else {
    tooltipBottom = 16;
  }

  const showFallback = hasTarget && !targetRect && currentStep.fallbackMsg;

  // Spotlight solo si hay target encontrado
  const overlayEl = hasTarget && targetRect ? (
    <>
      <div style={{ position:'fixed', top:0, left:0, right:0, height:sTop, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:sBottom, left:0, right:0, bottom:0, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:sTop, left:0, width:sLeft, height:sBottom-sTop, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{ position:'fixed', top:sTop, left:sRight, right:0, height:sBottom-sTop, background:'rgba(2,6,23,0.82)', zIndex:10000, pointerEvents:'none' }} />
      <div style={{
        position:'fixed', top:sTop, left:sLeft, width:sRight-sLeft, height:sBottom-sTop,
        borderRadius:14, border:'3px solid #3b82f6',
        boxShadow:'0 0 0 3px rgba(59,130,246,0.25), 0 0 30px rgba(59,130,246,0.5)',
        zIndex:10001, pointerEvents:'none',
      }} />
    </>
  ) : null;

  const simpleOverlay = (currentStep.isIntro || currentStep.isFinal) ? (
    <div style={{ position:'fixed', inset:0, zIndex:9990, background:'rgba(2,6,23,0.88)', backdropFilter:'blur(3px)', pointerEvents:'all' }} />
  ) : null;

  const accentColor = '#3b82f6';

  const tooltipEl = (
    <div style={{
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
    }}>
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

      {/* Progreso */}
      <div style={{ display:'flex', gap:3, alignItems:'center', margin:'12px 0' }}>
        {TOUR_STEPS.map((_, i) => (
          <div key={i} style={{
            height:4, width: i === step ? 20 : 5, borderRadius:2, flexShrink:0,
            background: i === step ? accentColor : i < step ? '#93c5fd' : '#e2e8f0',
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
          background: currentStep.isFinal ? 'linear-gradient(135deg,#16a34a,#15803d)' : `linear-gradient(135deg,${accentColor},#2563eb)`,
          color:'white', fontWeight:700, fontSize:13, border:'none', cursor:'pointer',
          boxShadow: currentStep.isFinal ? '0 4px 14px rgba(22,163,74,0.35)' : '0 4px 14px rgba(59,130,246,0.3)',
        }}>
          {currentStep.isIntro ? '¡Empezamos! →' : currentStep.isFinal ? '¡Entendido! 🎉' : 'Siguiente →'}
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
