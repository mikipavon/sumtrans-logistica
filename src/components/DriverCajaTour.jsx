import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTourAudio } from '../hooks/useTourAudio';

// ── Datos demo ────────────────────────────────────────────────────────────────
const DEMO_PORTES = [
  { client: 'Mercadona S.A.',     detail: 'Entrega · ALB-1042', amount: '€12.50',  color: '#16a34a' },
  { client: 'Leroy Merlín',       detail: 'Entrega · ALB-1039', amount: '€8.00',   color: '#16a34a' },
  { client: 'El Corte Inglés',    detail: 'Origen · ALB-1035',  amount: '€15.00',  color: '#2563eb' },
];
const DEMO_REEMBOLSOS = [
  { client: 'Frutería García',    detail: 'COD · ALB-1038',     amount: '€45.00',  id: 'ALB-1038' },
  { client: 'Clínica Dental Ruiz',detail: 'COD · ALB-1031',     amount: '€120.00', id: 'ALB-1031' },
];

const TOUR_STEPS = [
  {
    emoji: '🏦',
    title: '¿Qué es la pestaña Caja?',
    description: 'Al final del día, la pestaña "Cuenta" muestra todo lo que has recaudado: portes cobrados, reembolsos COD y facturas simplificadas. Desde aquí también generas los justificantes.',
    audio: 'Al final del día, la pestaña Cuenta muestra todo lo que has recaudado: portes cobrados, reembolsos y facturas simplificadas. Desde aquí también generas los justificantes para los remitentes.',
    audioId: 'caja_01_intro',
    isIntro: true,
    demoMode: null,
    inlineDemo: null,
  },
  {
    emoji: '💶',
    title: 'Totales del día',
    description: 'Arriba aparecen dos tarjetas:\n\n💜 Reembolsos — dinero COD cobrado al destinatario que debes entregar al remitente.\n🚚 Porte (Caja) — cobros de porte debido del día.\n\nEl cuadro negro grande es el TOTAL RECAUDADO.',
    audio: 'Arriba aparecen dos tarjetas: Reembolsos, que es el dinero del COD que debes entregar al remitente; y Porte de Caja, que son los cobros de porte del día. El cuadro negro grande es el total recaudado.',
    audioId: 'caja_02_totales',
    demoMode: null,
    inlineDemo: 'caja_totales',
  },
  {
    emoji: '📋',
    title: 'Detalle de portes cobrados',
    description: 'Debajo aparece cada porte cobrado con el nombre del cliente y el importe. Puedes pulsar en cualquier línea para ver el albarán completo.\n\nEl botón 🖨️ imprime el resumen de portes del día.',
    audio: 'Debajo aparece cada porte cobrado con el nombre del cliente y el importe. Puedes pulsar en cualquier línea para ver el albarán completo. El botón de imprimir genera el resumen de portes del día.',
    audioId: 'caja_03_portes',
    demoMode: null,
    inlineDemo: 'caja_portes',
  },
  {
    emoji: '💸',
    title: 'Detalle de reembolsos (COD)',
    description: 'En la sección "Detalle Reembolsos" aparece cada COD cobrado hoy. Cada línea tiene un botón 🖨️ individual para imprimir ese justificante.\n\n"Imprimir Todos" genera todos los justificantes de golpe en formato A6.',
    audio: 'En la sección de Detalle Reembolsos aparece cada cobro de tipo COD del día. Cada línea tiene un botón individual para imprimir ese justificante. El botón Imprimir Todos genera todos a la vez en formato A6.',
    audioId: 'caja_04_reembolsos',
    demoMode: null,
    inlineDemo: 'caja_reembolsos',
  },
  {
    emoji: '🧾',
    title: '¿Qué es un justificante de reembolso?',
    description: 'Es el documento que le das al REMITENTE cuando le entregas el dinero que cobró su cliente (COD). Incluye:\n\n• Nombre del remitente\n• ID del envío con QR\n• Importe total\n• Espacio para firma y sello',
    audio: 'El justificante de reembolso es el documento que le das al remitente cuando le entregas el dinero que cobró su cliente. Incluye el nombre del remitente, el identificador del envío con código QR, el importe total, y espacio para firma y sello.',
    audioId: 'caja_05_justificante',
    demoMode: null,
    inlineDemo: 'justificante_preview',
  },
  {
    emoji: '🖨️',
    title: 'Cómo generar los justificantes',
    description: '1️⃣ Ve a la pestaña Cuenta al final del día.\n2️⃣ En "Detalle Reembolsos" pulsa 🖨️ junto a cada reembolso para imprimirlo individualmente.\n3️⃣ O pulsa "Imprimir Todos" para sacar todos a la vez en formato A6 (4 por folio).\n4️⃣ Se abre una ventana de impresión — acepta y el justificante queda impreso.',
    audio: 'Para generar los justificantes: ve a la pestaña Cuenta al final del día, en Detalle Reembolsos pulsa el icono de imprimir junto a cada reembolso, o pulsa Imprimir Todos para sacar todos a la vez en formato A6, cuatro por folio.',
    audioId: 'caja_06_como_imprimir',
    demoMode: null,
    inlineDemo: 'caja_reembolsos',
  },
  {
    emoji: '📄',
    title: 'Cierre de Caja PDF',
    description: 'El botón "Mi Cierre (PDF)" genera un resumen completo del día con todos los cobros. Úsalo al final de tu jornada para entregar en la oficina o guardar como comprobante.',
    audio: 'El botón Mi Cierre en PDF genera un resumen completo del día con todos los cobros. Úsalo al final de tu jornada para entregar en la oficina o guardar como comprobante.',
    audioId: 'caja_07_cierre',
    demoMode: null,
    inlineDemo: 'caja_cierre',
  },
  {
    emoji: '🎉',
    title: '¡Ya dominas la Caja!',
    description: 'Al final de cada jornada:\n✅ Revisa los totales en Cuenta\n✅ Imprime los justificantes de reembolso para los remitentes\n✅ Genera el Cierre PDF y entrégalo en oficina',
    audio: '¡Ya dominas la Caja! Al final de cada jornada: revisa los totales en Cuenta, imprime los justificantes de reembolso para los remitentes, y genera el Cierre en PDF para entregarlo en la oficina.',
    audioId: 'caja_08_final',
    isFinal: true,
    demoMode: null,
    inlineDemo: null,
  },
];

// ── Demos ─────────────────────────────────────────────────────────────────────
function CajaTotalesDemo() {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '12px 14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>€</div>
          <p style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 2px' }}>Reembolsos</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>€165.00</p>
        </div>
        <div style={{ background: 'white', borderRadius: 12, padding: '12px 14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 18, marginBottom: 2 }}>🚚</div>
          <p style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 2px' }}>Porte (Caja)</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>€35.50</p>
        </div>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ color: '#94a3b8', fontSize: 11, margin: '0 0 2px' }}>Total Recaudado Hoy</p>
          <p style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: 0 }}>€200.50</p>
        </div>
        <div style={{ background: '#1e293b', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>💼</div>
      </div>
    </div>
  );
}

function CajaPortesDemo() {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cobros de Porte</span>
        </div>
        <button style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 8px', fontSize: 10, color: '#15803d', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          🖨️ Imprimir
        </button>
      </div>
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        {DEMO_PORTES.map((item, i) => (
          <div key={i} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < DEMO_PORTES.length - 1 ? '1px solid #f8fafc' : 'none' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', margin: 0 }}>{item.client}</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>{item.detail}</p>
            </div>
            <span style={{ fontWeight: 800, fontSize: 13, color: item.color, fontFamily: 'monospace' }}>{item.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CajaReembolsosDemo({ showPrintFeedback = false }) {
  const [printed, setPrinted] = useState(null);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Detalle Reembolsos</span>
        </div>
        <button style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '4px 8px', fontSize: 10, color: '#4338ca', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          🖨️ Imprimir Todos ({DEMO_REEMBOLSOS.length})
        </button>
      </div>
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        {DEMO_REEMBOLSOS.map((item, i) => (
          <div key={i} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: i < DEMO_REEMBOLSOS.length - 1 ? '1px solid #f8fafc' : 'none' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', margin: 0 }}>{item.client}</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>{item.detail}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#6366f1', fontFamily: 'monospace' }}>{item.amount}</span>
              <button
                onClick={() => setPrinted(item.id)}
                style={{
                  background: printed === item.id ? '#f0fdf4' : '#eef2ff',
                  border: `1px solid ${printed === item.id ? '#bbf7d0' : '#c7d2fe'}`,
                  borderRadius: 8, padding: '6px 8px', cursor: 'pointer',
                  color: printed === item.id ? '#15803d' : '#4338ca', fontSize: 14,
                }}
                title="Imprimir Justificante"
              >
                {printed === item.id ? '✅' : '🖨️'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {printed && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 10, fontSize: 11, color: '#15803d', fontWeight: 700, border: '1px solid #bbf7d0' }}>
          ✅ Se abre la ventana de impresión del justificante {printed}
        </div>
      )}
    </div>
  );
}

function JustificantePreview() {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        background: 'white', border: '1.5px dashed #cbd5e1', borderRadius: 12,
        padding: '14px 16px', maxWidth: 260, margin: '0 auto',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      }}>
        <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: 8, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ fontWeight: 900, fontSize: 13, color: '#0f172a', margin: 0 }}>SUMTRANS LOGISTICA</p>
          <p style={{ fontSize: 10, color: '#64748b', margin: '2px 0 0' }}>Justificante de Reembolso</p>
        </div>
        {[
          ['Fecha:', '09/06/2026'],
          ['ID Envío:', 'ALB-1038'],
          ['Cliente:', 'Frutería García'],
          ['Recibe:', '_______________'],
          ['Concepto:', 'Reembolso COD'],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 5 }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>{label}</span>
            <span style={{ color: '#0f172a' }}>{val}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: 8, paddingTop: 8, textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#0f172a' }}>
          TOTAL: €45.00
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
          <div style={{ borderTop: '1px solid #0f172a', paddingTop: 4, fontSize: 8, color: '#64748b', flex: 1, marginRight: 12, textAlign: 'center' }}>
            Firma y Sello Cliente
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            ▦
          </div>
        </div>
        <p style={{ fontSize: 7, color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>
          Justifica la entrega del importe recaudado al remitente.
        </p>
      </div>
    </div>
  );
}

function CajaCierreDemo() {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
        overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
      }}>
        <div style={{ background: '#0f172a', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: '#94a3b8', fontSize: 9, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cierre de Caja Diario</p>
            <p style={{ color: 'white', fontWeight: 800, fontSize: 13, margin: 0 }}>Miguel Pavón — 09/06/2026</p>
          </div>
          <span style={{ fontSize: 22 }}>📄</span>
        </div>
        <div style={{ padding: '12px 16px' }}>
          {[
            ['Portes cobrados', '€35.50', '#10b981'],
            ['Reembolsos COD', '€165.00', '#6366f1'],
            ['Total del día', '€200.50', '#0f172a'],
          ].map(([label, val, color], i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0',
              borderBottom: i < 2 ? '1px solid #f1f5f9' : '2px solid #e2e8f0',
              fontWeight: i === 2 ? 900 : 600,
            }}>
              <span style={{ fontSize: 12, color: '#475569' }}>{label}</span>
              <span style={{ fontSize: 14, color, fontFamily: 'monospace' }}>{val}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 16px', background: '#f8fafc' }}>
          <button style={{
            width: '100%', padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 800,
            background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            📄 Descargar Mi Cierre (PDF)
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAPA DE DEMOS ─────────────────────────────────────────────────────────────
function InlineDemo({ type }) {
  if (type === 'caja_totales')      return <CajaTotalesDemo />;
  if (type === 'caja_portes')       return <CajaPortesDemo />;
  if (type === 'caja_reembolsos')   return <CajaReembolsosDemo />;
  if (type === 'justificante_preview') return <JustificantePreview />;
  if (type === 'caja_cierre')       return <CajaCierreDemo />;
  return null;
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
export default function DriverCajaTour({ isVisible, onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [animOut, setAnimOut] = useState(false);
  const { speak, stop, isMuted, toggleMute } = useTourAudio();

  const currentStep = TOUR_STEPS[step];
  const hasInlineDemo = !!currentStep.inlineDemo;

  useEffect(() => {
    if (!isVisible) { stop(); return; }
    setStep(0);
  }, [isVisible, stop]);

  // Narrar cada paso
  useEffect(() => {
    if (!isVisible) return;
    const { audio, audioId } = currentStep;
    if (audio || audioId) {
      const t = setTimeout(() => speak(audio, audioId), 400);
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

  // Siempre overlay oscuro + tooltip arriba para aprovechar toda la pantalla (especialmente iPhone)
  const tooltipTop = 16;

  const overlayEl = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(3px)', pointerEvents: 'all' }} />
  );

  const tooltipEl = (
    <div style={{
      position: 'fixed',
      top: Math.max(12, tooltipTop),
      left: tooltipLeft,
      width: tooltipW,
      zIndex: 2147483647,
      background: 'white',
      borderRadius: 22,
      boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      padding: '18px 20px 14px',
      opacity: animOut ? 0 : 1,
      transform: animOut ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
      transition: 'opacity 0.18s ease, transform 0.18s ease',
      pointerEvents: 'all',
      maxHeight: vh - 32,
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: currentStep.isFinal
            ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)'
            : 'linear-gradient(135deg,#fafafa,#f1f5f9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          border: currentStep.isFinal ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
        }}>
          {currentStep.emoji}
        </div>
        <h3 style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', lineHeight: 1.3, flex: 1, margin: 0 }}>
          {currentStep.title}
        </h3>
      </div>

      <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.65, margin: '0 0 4px', whiteSpace: 'pre-line' }}>
        {currentStep.description}
      </p>

      {/* Demo inline */}
      {hasInlineDemo && <InlineDemo type={currentStep.inlineDemo} />}

      {/* Progress */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', margin: '14px 0' }}>
        {TOUR_STEPS.map((_, i) => (
          <div key={i} style={{
            height: 4, width: i === step ? 20 : 5, borderRadius: 2, flexShrink: 0,
            background: i === step ? '#10b981' : i < step ? '#6ee7b7' : '#e2e8f0',
            transition: 'all 0.3s ease',
          }} />
        ))}
        <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
          {step + 1}/{TOUR_STEPS.length}
        </span>
      </div>

      {/* Buttons */}
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
            : 'linear-gradient(135deg,#10b981,#059669)',
          color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
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
              background: isMuted ? '#f1f5f9' : '#f0fdf4',
              color: isMuted ? '#94a3b8' : '#16a34a',
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
      {createPortal(overlayEl, document.body)}
      {createPortal(tooltipEl, document.body)}
    </>
  );
}
