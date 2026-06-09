import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const TOUR_STEPS = [
  {
    emoji: '🔔',
    title: 'Notificaciones y alertas al entregar',
    description: 'Este tutorial te muestra los avisos que aparecen al confirmar entregas. Los formularios son REALES — ningún dato se guardará. ¡Solo formación!',
    isIntro: true,
    demoMode: null,
  },
  {
    emoji: '✅',
    title: '1. Porte Pagado — sin cobrar',
    description: 'Cuando el porte ya está pagado por el remitente, no aparece ningún importe en la sección de cobros. Solo necesitas la firma y/o foto. No cobres nada.',
    isRealModal: true,
    demoMode: 'delivery_pagado',
  },
  {
    emoji: '⚠️',
    title: '2. Porte Pagado pero cliente de efectivo',
    description: 'Si el remitente paga en efectivo (no por factura), el cobro puede aparecer igualmente en pantalla. Comprueba siempre el importe marcado antes de confirmar.',
    isRealModal: true,
    demoMode: 'delivery_debido',
  },
  {
    emoji: '🔴',
    title: '3. Banner ROJO — Retorno',
    description: 'El banner rojo pulsante "ESTE ENVÍO TIENE RETORNO" significa que el cliente debe devolverte algo físico (caja, documentos, palé). Recógelo ANTES de marcharte.',
    isRealModal: true,
    demoMode: 'delivery_retorno',
  },
  {
    emoji: '🟢',
    title: '4. Banner VERDE — Firma de vuelta',
    description: 'El banner verde "RECOGER FIRMA DE VUELTA" significa que el cliente debe firmar el albarán de papel. Luego fotografíalo con la cámara como prueba.',
    isRealModal: true,
    demoMode: 'delivery_firma_vuelta',
  },
  {
    emoji: '🔴🟢',
    title: '5. Retorno Y firma de vuelta a la vez',
    description: 'Pueden aparecer los dos banners al mismo tiempo. Orden: 1️⃣ Recoge el retorno físico → 2️⃣ Firma en el albarán de papel → 3️⃣ Fotografíalo → 4️⃣ Confirma.',
    isRealModal: true,
    demoMode: 'delivery_retorno_firma',
  },
  {
    emoji: '💰',
    title: '6. Porte Debido + Reembolso (COD)',
    description: 'Si aparecen dos líneas — PORTE y REEMBOLSO — cobras los dos al destinatario. El total se suma solo. El reembolso lo entregas luego al remitente.',
    isRealModal: true,
    demoMode: 'delivery_porte_reembolso',
  },
  {
    emoji: '📱',
    title: '7. Aviso de la oficina',
    description: 'Al abrir la app, pueden saltarte avisos enviados desde la oficina: instrucciones del día, recordatorios especiales o alertas puntuales.',
    demoMode: null,
    inlineDemo: 'office_alert',
  },
  {
    emoji: '🔧',
    title: '8. Revisión semanal del vehículo',
    description: 'Cada lunes aparece automáticamente un checklist para revisar los niveles de la furgoneta antes de salir. Confírmalo siempre antes de empezar la ruta.',
    demoMode: null,
    inlineDemo: 'vehicle_check',
  },
  {
    emoji: '🎓',
    title: '¡Ya conoces todas las alertas!',
    description: 'Ahora sabes identificar cada tipo de aviso: cobros, retornos, firmas de vuelta y mensajes de oficina. Vuelve a este tutorial desde el botón 📚.',
    isFinal: true,
    demoMode: null,
  },
];

// Demos inline solo para alertas simples (no son modales de entrega)
function InlineDemo({ type }) {
  if (type === 'office_alert') return (
    <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 50px rgba(0,0,0,0.45)', margin: '0 12px' }}>
      <div style={{ background: '#1e293b', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>📢</span>
        <span style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>Aviso Importante</span>
      </div>
      <div style={{ padding: '16px 16px 12px' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>📦 Instrucciones para hoy</p>
        <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: 14 }}>
          Recuerda pasar a recoger el pallet de Leroy Merlín antes de las 11:00h. Está en la plataforma de Córdoba norte, puerta C.
        </p>
        <button style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', fontWeight: 800, fontSize: 13, border: 'none', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
          ✅ Entendido
        </button>
      </div>
    </div>
  );

  if (type === 'vehicle_check') return (
    <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 50px rgba(0,0,0,0.45)', margin: '0 12px' }}>
      <div style={{ background: '#1e293b', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🔧</span>
        <span style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>Revisión Semanal del Vehículo</span>
      </div>
      <div style={{ padding: '12px 16px' }}>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>¡Buenos días! Es lunes. Antes de salir a ruta, confirma:</p>
        {['🛢️ Aceite del motor', '🌡️ Líquido refrigerante', '🛑 Líquido de frenos', '🔵 Presión de neumáticos', '💡 Luces e intermitentes'].map((item, i) => (
          <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#16a34a', fontSize: 10, fontWeight: 900 }}>✓</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{item}</span>
          </div>
        ))}
        <button style={{ width: '100%', padding: '12px', borderRadius: 12, marginTop: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', fontWeight: 800, fontSize: 12, border: 'none', boxShadow: '0 4px 14px rgba(22,163,74,0.3)' }}>
          ✅ Confirmo que he revisado los niveles
        </button>
      </div>
    </div>
  );

  return null;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function DriverAlertsTour({ isVisible, onComplete, onSkip, onDemoModeChange }) {
  const [step, setStep] = useState(0);
  const [animOut, setAnimOut] = useState(false);

  const currentStep = TOUR_STEPS[step];
  const isRealModal  = !!currentStep.isRealModal;
  const hasInlineDemo = !!currentStep.inlineDemo;

  useEffect(() => {
    if (!isVisible) { onDemoModeChange?.(null); return; }
    setStep(0);
  }, [isVisible, onDemoModeChange]);

  useEffect(() => {
    if (!isVisible) return;
    onDemoModeChange?.(currentStep.demoMode || null);
  }, [step, isVisible, currentStep, onDemoModeChange]);

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
  const tooltipW = Math.min(330, vw - 32);
  const tooltipLeft = Math.max(16, vw / 2 - tooltipW / 2);

  // isRealModal sin targetId → anclar ABAJO para no tapar el modal de entrega
  const useBottom = isRealModal;
  const tooltipTop  = hasInlineDemo ? 12 : vh / 2 - 180;
  const demoTop     = tooltipTop + 196;

  // ── OVERLAY (solo sin modal real) ────────────────────────────────────
  const overlayEl = !isRealModal ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(2px)', pointerEvents: 'all' }} />
      {hasInlineDemo && (
        <div style={{ position: 'fixed', top: demoTop, left: 0, right: 0, zIndex: 9998, pointerEvents: 'none' }}>
          <InlineDemo type={currentStep.inlineDemo} />
        </div>
      )}
    </div>
  ) : null;

  // ── TOOLTIP (portal independiente con z-index máximo) ────────────────
  const tooltipStyle = useBottom
    ? {
        position: 'fixed',
        bottom: 16,
        left: tooltipLeft,
        width: tooltipW,
        zIndex: 2147483647,
        background: 'white',
        borderRadius: 22,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.25), 0 32px 80px rgba(0,0,0,0.4)',
        padding: '18px 20px 14px',
        opacity: animOut ? 0 : 1,
        transform: animOut ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        pointerEvents: 'all',
      }
    : {
        position: 'fixed',
        top: Math.max(8, tooltipTop),
        left: tooltipLeft,
        width: tooltipW,
        zIndex: 2147483647,
        background: 'white',
        borderRadius: 22,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: '18px 20px 14px',
        opacity: animOut ? 0 : 1,
        transform: animOut ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        pointerEvents: 'all',
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
          background: currentStep.isFinal
            ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)'
            : 'linear-gradient(135deg,#fff7ed,#fed7aa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          border: currentStep.isFinal ? '1px solid #bbf7d0' : '1px solid #fde68a',
        }}>
          {currentStep.emoji}
        </div>
        <h3 style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', lineHeight: 1.3, flex: 1, margin: 0 }}>
          {currentStep.title}
        </h3>
      </div>

      <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.65, margin: '0 0 14px', whiteSpace: 'pre-line' }}>
        {currentStep.description}
      </p>

      <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 14 }}>
        {TOUR_STEPS.map((_, i) => (
          <div key={i} style={{
            height: 4, width: i === step ? 20 : 5, borderRadius: 2, flexShrink: 0,
            background: i === step ? '#f59e0b' : i < step ? '#fcd34d' : '#e2e8f0',
            transition: 'all 0.3s ease',
          }} />
        ))}
        <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
          {step + 1}/{TOUR_STEPS.length}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {step > 0 && !currentStep.isFinal && (
          <button onClick={goPrev} style={{ padding: '10px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            ← Atrás
          </button>
        )}
        <button onClick={goNext} style={{
          flex: 1, padding: '11px 16px', borderRadius: 12,
          background: currentStep.isFinal
            ? 'linear-gradient(135deg,#16a34a,#15803d)'
            : 'linear-gradient(135deg,#f59e0b,#d97706)',
          color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
          boxShadow: currentStep.isFinal ? '0 4px 14px rgba(22,163,74,0.35)' : '0 4px 14px rgba(245,158,11,0.35)',
        }}>
          {currentStep.isIntro ? '¡Empezamos! →' : currentStep.isFinal ? '¡Perfecto! 🎉' : 'Siguiente →'}
        </button>
      </div>

      {!currentStep.isFinal && (
        <button onClick={onSkip} style={{ width: '100%', marginTop: 10, padding: '6px', background: 'none', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
          Saltar tutorial
        </button>
      )}
    </div>
  );

  return (
    <>
      {overlayEl && createPortal(overlayEl, document.body)}
      {createPortal(tooltipEl, document.body)}
    </>
  );
}
