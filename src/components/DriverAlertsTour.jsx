import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTourAudio } from '../hooks/useTourAudio';

const TOUR_STEPS = [
  {
    emoji: '🔔',
    title: 'Notificaciones y alertas al entregar',
    description: 'Este tutorial te muestra los avisos que aparecen al confirmar entregas. Los formularios son REALES — ningún dato se guardará. ¡Solo formación!',
    audio: 'Bienvenido al tutorial de alertas. Voy a mostrarte todos los avisos especiales que pueden aparecer al confirmar una entrega. Los formularios que verás son reales, pero no se guardará ningún dato. Es solo formación.',
    isIntro: true,
    demoMode: null,
  },
  {
    emoji: '✅',
    title: '1. Porte Pagado — sin cobrar',
    description: 'Cuando el porte ya está pagado por el remitente, no aparece ningún importe en la sección de cobros. Solo necesitas la firma y/o foto. No cobres nada.',
    audio: 'Primer caso: el porte pagado. Cuando el remitente ya ha pagado los gastos de envío, no aparece ningún importe en la pantalla de cobros. Solo tienes que pedir la firma y hacer la foto. No cobres nada al destinatario.',
    isRealModal: true,
    demoMode: 'delivery_pagado',
  },
  {
    emoji: '⚠️',
    title: '2. Porte Pagado pero cliente de efectivo',
    description: 'Si el remitente paga en efectivo (no por factura), el cobro puede aparecer igualmente en pantalla. Comprueba siempre el importe marcado antes de confirmar.',
    audio: 'Ojo con este caso. Si el remitente es cliente de efectivo — es decir, no paga por factura — el importe puede aparecer en pantalla aunque el porte figure como pagado. Comprueba siempre el importe marcado antes de confirmar.',
    isRealModal: true,
    demoMode: 'delivery_debido',
  },
  {
    emoji: '🔴',
    title: '3. Banner ROJO — Retorno',
    description: 'El banner rojo pulsante "ESTE ENVÍO TIENE RETORNO" significa que el cliente debe devolverte algo físico (caja, documentos, palé). Recógelo ANTES de marcharte.',
    audio: 'Muy importante: el banner rojo que parpadea. Cuando ves este aviso, significa que el cliente tiene que devolverte algo físico: una caja, unos documentos, o un palé. Recógelo siempre antes de marcharte del cliente.',
    isRealModal: true,
    demoMode: 'delivery_retorno',
    inlineDemo: 'retorno_banner',
  },
  {
    emoji: '🟢',
    title: '4. Banner VERDE — Firma de vuelta',
    description: 'El banner verde "RECOGER FIRMA DE VUELTA" significa que el cliente debe firmar el albarán de papel. Luego fotografíalo con la cámara como prueba.',
    audio: 'Ahora el banner verde. Este aviso significa que el cliente tiene que firmar en el albarán de papel, no solo en la pantalla. Déjale que firme en el papel, después fotografiía ese albarán con la cámara como prueba.',
    isRealModal: true,
    demoMode: 'delivery_firma_vuelta',
  },
  {
    emoji: '🔴🟢',
    title: '5. Retorno Y firma de vuelta a la vez',
    description: 'Pueden aparecer los dos banners al mismo tiempo. Orden: 1️⃣ Recoge el retorno físico → 2️⃣ Firma en el albarán de papel → 3️⃣ Fotografiíaélo → 4️⃣ Confirma.',
    audio: 'Puede que aparezcan los dos avisos a la vez — el rojo y el verde juntos. En ese caso sigue este orden. Primero recoge el retorno físico. Segundo, que el cliente firme en el albarán de papel. Tercero, fotografialo. Y cuarto, confirma en la pantalla.',
    isRealModal: true,
    demoMode: 'delivery_retorno_firma',
    inlineDemo: 'retorno_firma_banner',
  },
  {
    emoji: '💰',
    title: '6. Porte Debido + Reembolso (COD)',
    description: 'Si aparecen dos líneas — PORTE y REEMBOLSO — cobras los dos al destinatario. El total se suma solo. El reembolso lo entregas luego al remitente.',
    audio: 'Cuando aparecen dos líneas de cobro: el porte y el reembolso. Cobras las dos cantidades al destinatario. El total lo calcula la aplicación automáticamente. El dinero del reembolso lo devolverás después al remitente en la oficina.',
    isRealModal: true,
    demoMode: 'delivery_porte_reembolso',
  },
  {
    emoji: '📱',
    title: '7. Aviso de la oficina',
    description: 'Al abrir la app pueden saltarte avisos enviados desde la oficina: instrucciones del día, recordatorios especiales o alertas puntuales.',
    audio: 'Al abrir la aplicación, a veces aparece un aviso enviado por la oficina. Pueden ser instrucciones del día, recordatorios especiales, o alertas puntuales. Léelo siempre antes de salir a ruta.',
    demoMode: null,
    inlineDemo: 'office_alert',
  },
  {
    emoji: '🔧',
    title: '8. Revisión semanal del vehículo',
    description: 'Cada lunes aparece automáticamente un checklist para revisar los niveles de la furgoneta antes de salir. Confírmalo siempre antes de empezar la ruta.',
    audio: 'Cada lunes, antes de salir a ruta, la aplicación te muestra automáticamente este checklist de revisión del vehículo. Hay que revisar el aceite, el refrigerante, los frenos, los neumáticos y las luces. Confírmalo siempre antes de arrancar.',
    demoMode: null,
    inlineDemo: 'vehicle_check',
  },
  {
    emoji: '🎓',
    title: '¡Ya conoces todas las alertas!',
    description: 'Ahora sabes identificar cada tipo de aviso: cobros, retornos, firmas de vuelta y mensajes de oficina. Vuelve a este tutorial desde el botón 📚.',
    audio: '¡Enhorabuena! Ya conoces todos los tipos de aviso: cobros, retornos, firmas de vuelta y mensajes de la oficina. Si en algún momento tienes dudas, puedes volver a este tutorial desde el botón de tutoriales.',
    isFinal: true,
    demoMode: null,
  },
];

// ── Réplica pixel-perfect del panel de notificaciones real ───────────────────
const DEMO_NOTIFS = [
  {
    id: 1,
    iconEmoji: '📦',
    iconBg: { bg: '#eff6ff', color: '#2563eb' },
    title: '2 envíos de cliente web sin asignar',
    detail: 'SUM-1041, SUM-1042',
    time: 'Ahora',
    urgency: 'high',   // borde azul
    unread: true,
  },
  {
    id: 2,
    iconEmoji: '🚛',
    iconBg: { bg: '#fffbeb', color: '#d97706' },
    title: '5 envíos pendientes de asignar conductor',
    detail: 'SUM-1038, SUM-1039, SUM-1040...',
    time: 'Pendiente',
    urgency: 'medium', // borde ámbar
    unread: true,
  },
  {
    id: 3,
    iconEmoji: '⚠️',
    iconBg: { bg: '#fef2f2', color: '#dc2626' },
    title: '1 incidencia abierta',
    detail: 'SUM-1035',
    time: 'Urgente',
    urgency: 'critical', // borde rojo
    unread: false,
  },
  {
    id: 4,
    iconEmoji: '€',
    iconBg: { bg: '#f0fdf4', color: '#16a34a' },
    title: '3 cobros pendientes de liquidar',
    detail: 'Total acumulado: €247.50',
    time: 'Revisar',
    urgency: 'medium',
    unread: false,
  },
];

function urgencyBorderColor(u) {
  if (u === 'critical') return '#f87171';
  if (u === 'high')     return '#60a5fa';
  if (u === 'medium')   return '#fbbf24';
  return '#cbd5e1';
}

function NotifPanelDemo() {
  const [read, setRead] = useState([3, 4]);
  const unreadCount = DEMO_NOTIFS.filter(n => !read.includes(n.id)).length;

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', background: 'white', margin: '4px 0' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>Centro de Alertas</span>
          {unreadCount > 0 && (
            <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>
              {unreadCount} nueva{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => setRead(DEMO_NOTIFS.map(n => n.id))}
            style={{ fontSize: 10, color: '#2563eb', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✓✓ Marcar leídas
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {DEMO_NOTIFS.map(notif => {
          const isUnread = !read.includes(notif.id);
          return (
            <div
              key={notif.id}
              onClick={() => setRead(r => [...r, notif.id])}
              style={{
                padding: '10px 14px',
                borderLeft: `4px solid ${urgencyBorderColor(notif.urgency)}`,
                background: isUnread ? '#f0f7ff' : 'white',
                borderBottom: '1px solid #f8fafc',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                transition: 'background 0.15s',
              }}
            >
              {/* Icono */}
              <div style={{
                width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                background: notif.iconBg.bg, color: notif.iconBg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>
                {notif.iconEmoji}
              </div>
              {/* Texto */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: isUnread ? 800 : 600, color: isUnread ? '#0f172a' : '#64748b', lineHeight: 1.35, margin: 0 }}>
                  {notif.title}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {notif.detail}
                </p>
                <span style={{
                  fontSize: 9, fontWeight: 800, display: 'block', marginTop: 2,
                  color: notif.urgency === 'critical' ? '#ef4444' : notif.urgency === 'high' ? '#3b82f6' : '#f59e0b',
                }}>
                  {notif.time}
                </span>
              </div>
              {/* Punto azul */}
              {isUnread && (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 4 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
        <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>Toca cada alerta para ir a la sección correspondiente</p>
      </div>
    </div>
  );
}

// Demos inline solo para alertas simples (no son modales de entrega)
function InlineDemo({ type }) {
  if (type === 'retorno_banner') return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', margin: '4px 0' }}>
      {/* Cabecera mini modal */}
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 12, color: '#334155' }}>Confirmar Entrega</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>MERCADONA S.A.</span>
      </div>
      {/* Zona de cobros con banner */}
      <div style={{ background: '#fff1f2', padding: '10px 12px' }}>
        {/* ── BANNER ROJO PULSANTE ── */}
        <style>{`@keyframes pulse-red { 0%,100%{opacity:1} 50%{opacity:.7} }`}</style>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#dc2626', color: 'white',
          padding: '10px 14px', borderRadius: 12,
          boxShadow: '0 4px 14px rgba(220,38,38,0.35)',
          animation: 'pulse-red 1.5s ease-in-out infinite',
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔄</span>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.8, margin: 0 }}>Aviso Especial</p>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>ESTE ENVÍO TIENE RETORNO</p>
          </div>
          <span style={{ fontSize: 18 }}>⚠️</span>
        </div>
        <p style={{ fontSize: 10, color: '#9f1239', fontWeight: 600, margin: 0, textAlign: 'center' }}>
          👆 Este banner aparece en ROJO y PARPADEA para que no lo ignores
        </p>
      </div>
      {/* Pie explicativo */}
      <div style={{ padding: '8px 14px', background: '#fff7f7', borderTop: '1px solid #fecdd3' }}>
        <p style={{ fontSize: 10, color: '#be123c', margin: 0, fontWeight: 600 }}>
          ⚠️ Recoge el retorno físico ANTES de marcharte del cliente
        </p>
      </div>
    </div>
  );

  if (type === 'retorno_firma_banner') return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', margin: '4px 0' }}>
      <div style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 12, color: '#334155' }}>Confirmar Entrega</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>LEROY MERLÍN S.L.</span>
      </div>
      <div style={{ background: '#fff1f2', padding: '10px 12px' }}>
        <style>{`@keyframes pulse-red2 { 0%,100%{opacity:1} 50%{opacity:.7} }`}</style>
        {/* Banner rojo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#dc2626', color: 'white',
          padding: '10px 14px', borderRadius: 12,
          boxShadow: '0 4px 14px rgba(220,38,38,0.35)',
          animation: 'pulse-red2 1.5s ease-in-out infinite',
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔄</span>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.8, margin: 0 }}>Aviso Especial</p>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>ESTE ENVÍO TIENE RETORNO</p>
          </div>
          <span style={{ fontSize: 18 }}>⚠️</span>
        </div>
        {/* Banner verde */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#16a34a', color: 'white',
          padding: '10px 14px', borderRadius: 12,
          boxShadow: '0 4px 14px rgba(22,163,74,0.3)',
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.8, margin: 0 }}>Documentación</p>
            <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>RECOGER FIRMA DE VUELTA</p>
          </div>
          <span style={{ fontSize: 18 }}>✅</span>
        </div>
        <p style={{ fontSize: 10, color: '#9f1239', fontWeight: 600, margin: 0, textAlign: 'center' }}>
          👆 Ambos banners aparecen a la vez — atiende los dos
        </p>
      </div>
    </div>
  );

  if (type === 'notif_panel') return <NotifPanelDemo />;

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
  const { speak, stop, isMuted, toggleMute } = useTourAudio();

  const currentStep = TOUR_STEPS[step];
  const isRealModal  = !!currentStep.isRealModal;
  const hasInlineDemo = !!currentStep.inlineDemo;

  useEffect(() => {
    if (!isVisible) { onDemoModeChange?.(null); stop(); return; }
    setStep(0);
  }, [isVisible, onDemoModeChange, stop]);

  useEffect(() => {
    if (!isVisible) return;
    onDemoModeChange?.(currentStep.demoMode || null);
  }, [step, isVisible, currentStep, onDemoModeChange]);

  // Narrar cada paso
  useEffect(() => {
    if (!isVisible) return;
    const audioText = currentStep.audio;
    if (audioText) {
      const t = setTimeout(() => speak(audioText), 400);
      return () => clearTimeout(t);
    }
  }, [step, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const tooltipW = Math.min(360, vw - 24);
  const tooltipLeft = Math.max(12, vw / 2 - tooltipW / 2);

  // isRealModal sin targetId → anclar ABAJO para no tapar el modal de entrega
  const useBottom = isRealModal;
  // Siempre posicionar arriba para aprovechar toda la pantalla (especialmente iPhone)
  const tooltipTop  = 16;

  // ── OVERLAY (solo sin modal real) ────────────────────────────────────
  const overlayEl = !isRealModal ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, pointerEvents: 'none' }}>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(2px)', pointerEvents: 'all' }} />
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
        maxHeight: vh - 32,
        zIndex: 2147483647,
        background: 'white',
        borderRadius: 22,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: '18px 20px 14px',
        opacity: animOut ? 0 : 1,
        transform: animOut ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        pointerEvents: 'all',
        overflowY: 'auto',
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

      <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.65, margin: '0 0 10px', whiteSpace: 'pre-line' }}>
        {currentStep.description}
      </p>

      {/* Demo visual dentro del tooltip */}
      {hasInlineDemo && (
        <div style={{ marginBottom: 10 }}>
          <InlineDemo type={currentStep.inlineDemo} />
        </div>
      )}

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <button
            onClick={toggleMute}
            title={isMuted ? 'Activar voz' : 'Silenciar voz'}
            style={{
              padding: '5px 10px', borderRadius: 10,
              border: '1.5px solid #e2e8f0',
              background: isMuted ? '#f1f5f9' : '#fff7ed',
              color: isMuted ? '#94a3b8' : '#d97706',
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
      {overlayEl && createPortal(overlayEl, document.body)}
      {createPortal(tooltipEl, document.body)}
    </>
  );
}
