import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTourAudio } from '../hooks/useTourAudio';

// ─── PASOS DEL TOUR ──────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    targetId: 'driver-header',
    tab: null,
    emoji: '👋',
    title: '¡Bienvenido a tu panel!',
    description: 'Esta es tu pantalla de trabajo. Aquí ves tu nombre, el estado del GPS y los botones para ajustar el tamaño de la letra según te sea más cómodo.',
    audio: '¡Bienvenido! Esta es tu pantalla principal de trabajo. Aquí arriba ves tu nombre, el estado del GPS, y los botones para agrandar o reducir la letra según te sea más cómodo. Vamos a ver juntos cada sección.',
    audioId: 'guided_01_bienvenida',
    padding: 12,
  },
  {
    targetId: 'driver-tab-route',
    tab: 'route',
    emoji: '📦',
    title: 'Pestaña: Reparto',
    description: 'Aquí tienes todos los envíos que debes entregar hoy, ordenados por tu ruta. ¡Esta es tu pestaña más importante!',
    audio: 'Esta es la pestaña de Reparto — la más importante. Aquí tienes todos los envíos que debes entregar hoy, ordenados por tu ruta. Al empezar el día, empieza siempre por aquí.',
    audioId: 'guided_02_reparto',
    padding: 8,
  },
  {
    targetId: 'driver-tab-assign',
    tab: 'assign',
    emoji: '➕',
    title: 'Pestaña: Asignar',
    description: 'Si hay un paquete en tu furgoneta que no ves en tu reparto, búscalo aquí y asígnate la entrega tú mismo.',
    audio: 'La pestaña Asignar. Si cargas un paquete en la furgoneta y no aparece en tu reparto, entra aquí, búscalo por el número de albarán y asígnatelo tú mismo. Así queda registrado.',
    audioId: 'guided_03_asignar',
    padding: 8,
  },
  {
    targetId: 'driver-tab-delivered',
    tab: 'delivered',
    emoji: '✅',
    title: 'Pestaña: Entregas',
    description: 'Los envíos que ya has completado hoy aparecen aquí. Puedes consultar el historial completo de tu jornada.',
    audio: 'Aquí en Entregas aparecen todos los envíos que ya has completado hoy. Si necesitas revisar algo — una firma, una foto, un dato — lo encuentras en esta pestaña.',
    audioId: 'guided_04_entregas',
    padding: 8,
  },
  {
    targetId: 'driver-tab-collections',
    tab: 'collections',
    emoji: '💰',
    title: 'Pestaña: Cobros Pendientes',
    description: 'Envíos donde debes cobrar dinero en mano al cliente. Registra cada cobro para que la contabilidad cuadre al final del día.',
    audio: 'Cobros Pendientes. Aquí están los envíos donde tienes que cobrar dinero en efectivo al cliente. Muy importante: registra cada cobro en la aplicación para que la contabilidad cuadre al final del día.',
    audioId: 'guided_05_cobros',
    padding: 8,
  },
  {
    targetId: 'driver-tab-account',
    tab: 'account',
    emoji: '📊',
    title: 'Pestaña: Tu Cuenta',
    description: 'El resumen económico de tu jornada: portes cobrados, reembolsos y el total de efectivo que llevas encima.',
    audio: 'Tu Cuenta es el resumen económico de tu jornada. Aquí ves cuánto has cobrado en portes, los reembolsos, y el total de efectivo que llevas encima. Lo usarás al hacer la liquidación con la oficina.',
    audioId: 'guided_06_cuenta',
    padding: 8,
  },
  {
    targetId: '_demo_card',
    tab: 'route',
    emoji: '🗂️',
    title: 'Una Parada de Reparto',
    description: 'Cada tarjeta es un envío. Ves el número de parada, el nombre del cliente, la dirección, y si hay dinero que cobrar (marcado en verde).',
    audio: 'Mira esta tarjeta de ejemplo. Cada parada es un envío. Ves el número de parada, el nombre del cliente, la dirección, y si hay una cantidad en verde, significa que tienes que cobrar dinero al entregar.',
    audioId: 'guided_07_tarjeta',
    padding: 14,
    showDemoCard: true,
    demoTarget: 'card',
  },
  {
    targetId: '_demo_confirm',
    tab: 'route',
    emoji: '✅',
    title: 'Botón: Confirmar Entrega',
    description: 'Cuando entregues el paquete, pulsa este botón verde. La app te pedirá la firma del cliente y una foto del paquete como justificante.',
    audio: 'Cuando entregues un paquete, pulsa este botón verde que dice Confirmar Entrega. La aplicación te pedirá que el cliente firme con el dedo, y que hagas una foto del paquete. Eso queda guardado como justificante.',
    audioId: 'guided_08_confirmar',
    padding: 8,
    showDemoCard: true,
    demoTarget: 'confirm',
  },
  {
    targetId: '_demo_incident',
    tab: 'route',
    emoji: '⚠️',
    title: 'Botón: Reportar Incidencia',
    description: 'Si no puedes entregar (nadie en casa, dirección incorrecta, paquete dañado...), pulsa aquí y escribe el motivo para avisar a la oficina.',
    audio: 'Si no puedes entregar — porque no hay nadie en casa, la dirección es incorrecta, o el paquete viene dañado — pulsa el botón de Incidencia. Escribe el motivo y la oficina recibirá el aviso automáticamente.',
    audioId: 'guided_09_incidencia',
    padding: 8,
    showDemoCard: true,
    demoTarget: 'incident',
  },
  {
    targetId: null,
    tab: 'route',
    emoji: '🟡',
    title: '¡Ya conoces la app!',
    description: 'Recuerda: estás en Modo Prueba. Todo lo que hagas aquí es una simulación — puedes practicar sin miedo. Cuando te sientas listo, la oficina desactivará el modo prueba. ¡A por ello!',
    audio: '¡Perfecto! Ya conoces las partes principales de la aplicación. Recuerda que estás en Modo Prueba, así que todo lo que hagas aquí es una simulación — practica sin miedo. Cuando te sientas listo, díselo a la oficina y desactivarán el modo prueba. ¡Ánimo!',
    audioId: 'guided_10_final',
    isFinal: true,
  },
];

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function DriverGuidedTour({ isVisible, onComplete, onSkip, onChangeTab }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [animOut, setAnimOut] = useState(false);
  const { speak, stop, isMuted, toggleMute } = useTourAudio();

  const demoCardRef    = useRef(null);
  const demoConfirmRef = useRef(null);
  const demoIncidentRef = useRef(null);

  const currentStep = TOUR_STEPS[step];
  const isDemo = !!currentStep.showDemoCard;

  // ── Medir el elemento objetivo en cada cambio de paso ──────────────────────
  useEffect(() => {
    if (!isVisible) return;

    // Cambiar tab si el paso lo requiere
    if (currentStep.tab && onChangeTab) {
      onChangeTab(currentStep.tab);
    }

    const measure = () => {
      let el = null;
      const { demoTarget, targetId } = currentStep;

      if (demoTarget === 'card')     el = demoCardRef.current;
      else if (demoTarget === 'confirm')  el = demoConfirmRef.current;
      else if (demoTarget === 'incident') el = demoIncidentRef.current;
      else if (targetId)             el = document.getElementById(targetId);

      setTargetRect(el ? el.getBoundingClientRect() : null);
    };

    // Delay para dejar que React renderice el tab/contenido nuevo
    const timer = setTimeout(measure, 220);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [step, isVisible, currentStep, onChangeTab]);

  // Reset step when tour becomes visible again
  useEffect(() => {
    if (isVisible) setStep(0);
    else stop();
  }, [isVisible, stop]);

  // Narrar cada paso al avanzar
  useEffect(() => {
    if (!isVisible) return;
    const { audio, audioId } = currentStep;
    if (audio || audioId) {
      const t = setTimeout(() => speak(audio, audioId), 400);
      return () => clearTimeout(t);
    }
  }, [step, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navegación ──────────────────────────────────────────────────────────────
  const goNext = () => {
    if (step >= TOUR_STEPS.length - 1) { onComplete(); return; }
    setAnimOut(true);
    setTimeout(() => { setStep(s => s + 1); setAnimOut(false); }, 190);
  };

  const goPrev = () => {
    if (step === 0) return;
    setAnimOut(true);
    setTimeout(() => { setStep(s => s - 1); setAnimOut(false); }, 190);
  };

  if (!isVisible) return null;

  // ── Cálculos de posición ────────────────────────────────────────────────────
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = currentStep.padding || 8;

  // Coordenadas del spotlight (para elementos reales del DOM)
  let sTop = 0, sLeft = 0, sRight = vw, sBottom = vh;
  const useRealSpotlight = targetRect && !isDemo && !currentStep.isFinal;
  if (useRealSpotlight) {
    sTop    = Math.max(0, targetRect.top - pad);
    sLeft   = Math.max(0, targetRect.left - pad);
    sRight  = Math.min(vw, targetRect.right + pad);
    sBottom = Math.min(vh, targetRect.bottom + pad);
  }

  // Posición del tooltip
  const tooltipW = Math.min(360, vw - 24);
  let tooltipTop, tooltipLeft;

  if (currentStep.isFinal || (!targetRect && !isDemo)) {
    // Posicionar arriba para aprovechar pantalla (especialmente iPhone)
    tooltipTop  = 16;
    tooltipLeft = vw / 2 - tooltipW / 2;
  } else if (isDemo && targetRect) {
    // La demo card está abajo → tooltip encima
    tooltipTop  = Math.max(16, targetRect.top - 250);
    tooltipLeft = Math.max(16, Math.min(vw - tooltipW - 16, vw / 2 - tooltipW / 2));
  } else if (targetRect) {
    // Calcular si hay más espacio arriba o abajo
    const spaceBelow = vh - sBottom;
    const spaceAbove = sTop;
    if (spaceBelow >= 210 || spaceBelow >= spaceAbove) {
      tooltipTop = sBottom + 14;
    } else {
      tooltipTop = Math.max(8, sTop - 14 - 240);
    }
    tooltipTop  = Math.max(8, Math.min(vh - 260, tooltipTop));
    tooltipLeft = Math.max(16, Math.min(vw - tooltipW - 16, (sLeft + sRight) / 2 - tooltipW / 2));
  } else {
    tooltipTop  = 16;
    tooltipLeft = vw / 2 - tooltipW / 2;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const content = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'all' }}>

      {/* ── OVERLAY (técnica de 4 rectángulos para crear el "agujero") ── */}
      {useRealSpotlight ? (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: sTop, background: 'rgba(2,6,23,0.87)' }} />
          <div style={{ position: 'fixed', top: sBottom, left: 0, right: 0, bottom: 0, background: 'rgba(2,6,23,0.87)' }} />
          <div style={{ position: 'fixed', top: sTop, left: 0, width: sLeft, height: sBottom - sTop, background: 'rgba(2,6,23,0.87)' }} />
          <div style={{ position: 'fixed', top: sTop, left: sRight, right: 0, height: sBottom - sTop, background: 'rgba(2,6,23,0.87)' }} />
          {/* Anillo azul alrededor del spotlight */}
          <div style={{
            position: 'fixed',
            top: sTop, left: sLeft,
            width: sRight - sLeft, height: sBottom - sTop,
            borderRadius: 14,
            border: '2px solid rgba(96,165,250,0.95)',
            boxShadow: '0 0 0 1px rgba(96,165,250,0.25), 0 0 36px rgba(59,130,246,0.4)',
            pointerEvents: 'none',
            zIndex: 9991,
          }} />
        </>
      ) : (
        // Overlay completo (demo card o pantalla final)
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(2,6,23,0.88)',
          backdropFilter: 'blur(2px)',
        }} />
      )}

      {/* ── TARJETA DE EJEMPLO (pasos 7, 8, 9) ── */}
      {isDemo && (
        <>
          {/* Anillo spotlight alrededor del elemento demo activo */}
          {targetRect && (
            <div style={{
              position: 'fixed',
              top:  targetRect.top  - pad,
              left: targetRect.left - pad,
              width:  targetRect.width  + pad * 2,
              height: targetRect.height + pad * 2,
              borderRadius: currentStep.demoTarget === 'card' ? 20 : 14,
              border: '2.5px solid rgba(96,165,250,0.95)',
              boxShadow: '0 0 0 1px rgba(96,165,250,0.25), 0 0 36px rgba(59,130,246,0.5)',
              pointerEvents: 'none',
              zIndex: 9999,
              transition: 'all 0.3s ease',
            }} />
          )}

          {/* Envío ficticio de ejemplo */}
          <div
            ref={demoCardRef}
            style={{
              position: 'fixed',
              bottom: 16,
              left: 12,
              right: 12,
              zIndex: 9998,
              background: 'white',
              borderRadius: 18,
              boxShadow: '0 24px 72px rgba(0,0,0,0.65)',
              padding: '16px 16px 14px',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Etiqueta "Ejemplo" */}
            <div style={{
              position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg,#3b82f6,#6366f1)',
              color: 'white', fontSize: 10, fontWeight: 700,
              padding: '3px 12px', borderRadius: 20,
              boxShadow: '0 2px 8px rgba(59,130,246,0.4)',
              letterSpacing: '0.05em',
            }}>
              EJEMPLO FICTICIO
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {/* Drag handle */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: '#94a3b8', background: '#f8fafc', borderRadius: 8,
                padding: '8px 10px', fontSize: 18, userSelect: 'none', cursor: 'default',
              }}>⠿</div>

              <div style={{ flex: 1 }}>
                {/* Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb' }}>PARADA #1</span>
                  <span style={{ fontSize: 9, fontWeight: 700, background: '#eff6ff', color: '#2563eb', borderRadius: 4, padding: '2px 6px', border: '1px solid #dbeafe' }}>ENTREGA</span>
                </div>

                {/* Nombre cliente */}
                <h4 style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 5, lineHeight: 1.2 }}>
                  Manuel García López
                </h4>

                {/* Dirección */}
                <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>📍 C/ Mayor de Guadalquivir, 23</p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>14001 Córdoba</p>

                {/* Cobro */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: '#f0fdf4', color: '#15803d',
                    borderRadius: 20, padding: '4px 10px',
                    border: '1px solid #bbf7d0',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    boxShadow: '0 0 0 4px rgba(16,185,129,0.05)',
                  }}>
                    💰 COBRAR: Porte: 12.50€
                  </span>
                </div>

                {/* Botones de acción */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    ref={demoIncidentRef}
                    style={{
                      flex: '0 0 25%',
                      background: '#fef2f2', color: '#dc2626',
                      borderRadius: 12, padding: '10px 0',
                      fontWeight: 700, fontSize: 10,
                      border: '1px solid #fecaca',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                      cursor: 'default',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    ⚠️ Incidencia
                  </button>
                  <button
                    ref={demoConfirmRef}
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: 'white',
                      borderRadius: 12, padding: '10px 0',
                      fontWeight: 700, fontSize: 12,
                      border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      cursor: 'default',
                      boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    ✅ CONFIRMAR ENTREGA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── TOOLTIP CARD ── */}
      <div
        style={{
          position: 'fixed',
          top: Math.max(8, tooltipTop),
          left: tooltipLeft,
          width: tooltipW,
          zIndex: 10000,
          background: 'white',
          borderRadius: 22,
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
          padding: '20px 20px 16px',
          opacity: animOut ? 0 : 1,
          transform: animOut ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        {/* Cabecera: emoji + título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 15,
            background: currentStep.isFinal
              ? 'linear-gradient(135deg, #fef9c3, #fde68a)'
              : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, flexShrink: 0,
            border: currentStep.isFinal ? '1px solid #fde047' : '1px solid #bfdbfe',
          }}>
            {currentStep.emoji}
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', lineHeight: 1.3, flex: 1 }}>
            {currentStep.title}
          </h3>
        </div>

        {/* Descripción */}
        <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.65, marginBottom: 16 }}>
          {currentStep.description}
        </p>

        {/* Barra de progreso con puntos */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 16 }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                width: i === step ? 22 : 6,
                borderRadius: 2,
                background: i === step ? '#3b82f6' : i < step ? '#93c5fd' : '#e2e8f0',
                transition: 'all 0.3s ease',
                flexShrink: 0,
              }}
            />
          ))}
          <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
            {step + 1}/{TOUR_STEPS.length}
          </span>
        </div>

        {/* Botones de navegación */}
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && !currentStep.isFinal && (
            <button
              onClick={goPrev}
              style={{
                padding: '10px 14px', borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: 'white', color: '#64748b',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              ← Atrás
            </button>
          )}
          <button
            onClick={goNext}
            style={{
              flex: 1, padding: '11px 16px', borderRadius: 12,
              background: currentStep.isFinal
                ? 'linear-gradient(135deg, #16a34a, #15803d)'
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: 'white', fontWeight: 700, fontSize: 13,
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              boxShadow: currentStep.isFinal
                ? '0 4px 14px rgba(22,163,74,0.35)'
                : '0 4px 14px rgba(59,130,246,0.35)',
            }}
          >
            {currentStep.isFinal ? '¡Entendido! 🚀' : 'Siguiente →'}
          </button>
        </div>

        {/* Fila inferior: botón silencio + saltar */}
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

          {!currentStep.isFinal && (
            <button
              onClick={onSkip}
              style={{
                padding: '6px 8px',
                background: 'none', border: 'none',
                color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 500,
              }}
            >
              Saltar tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
