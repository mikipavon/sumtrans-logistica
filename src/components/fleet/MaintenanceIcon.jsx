import React from 'react';

/**
 * MaintenanceIcon — Iconos específicos y distintivos para cada tipo de mantenimiento
 * Reemplaza los iconos genéricos de Wrench por iconos SVG personalizados con colores únicos.
 * 
 * Props:
 *   type: string — Tipo de mantenimiento (Aceite, Filtros, Frenos, Ruedas, Correa, Reparación, Revisión, Otro)
 *   size: number — Tamaño en px (default: 20)
 *   withBg: boolean — Si mostrar el fondo circular (default: false)
 *   bgSize: number — Tamaño del fondo en px (default: 36)
 */

const TYPES = {
  Aceite: {
    label: 'Cambio de Aceite',
    color: '#D97706',      // amber-600
    bgColor: '#FEF3C7',    // amber-100
    borderColor: '#FDE68A', // amber-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Oil drop */}
        <path d="M12 2C12 2 6 9 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12Z" fill="currentColor" opacity="0.15"/>
        <path d="M12 2C12 2 6 9 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/>
        {/* Wave inside drop */}
        <path d="M8 15c1.5 1 3.5 1 5 0s3.5-1 5 0" opacity="0.6" strokeWidth="1.5"/>
      </svg>
    ),
  },
  Filtros: {
    label: 'Filtros',
    color: '#2563EB',      // blue-600
    bgColor: '#DBEAFE',    // blue-100
    borderColor: '#BFDBFE', // blue-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Air filter / fan blades */}
        <circle cx="12" cy="12" r="10" opacity="0.1" fill="currentColor"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 9V2"/>
        <path d="M12 22v-7"/>
        <path d="M9 12H2"/>
        <path d="M22 12h-7"/>
        <path d="M9.8 9.8 5 5"/>
        <path d="M19 19l-4.8-4.8"/>
        <path d="M9.8 14.2 5 19"/>
        <path d="M19 5l-4.8 4.8"/>
      </svg>
    ),
  },
  'Filtro Aire': {
    label: 'Filtro de Aire',
    color: '#0EA5E9',      // sky-600
    bgColor: '#F0F9FF',    // sky-100
    borderColor: '#E0F2FE', // sky-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" opacity="0.1" fill="currentColor"/>
        <path d="M12 2v20M17 5H7M17 19H7M20 12H4M16 8H8M16 16H8"/>
      </svg>
    ),
  },
  'Filtro Gasoil': {
    label: 'Filtro de Gasoil',
    color: '#06B6D4',      // cyan-600
    bgColor: '#ECFEFF',    // cyan-100
    borderColor: '#CFFAFE', // cyan-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C12 2 6 9 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12Z" fill="currentColor" opacity="0.15"/>
        <path d="M12 2C12 2 6 9 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/>
        <path d="M6 14h12" strokeWidth="2"/>
      </svg>
    ),
  },
  'Filtro Aceite': {
    label: 'Filtro de Aceite',
    color: '#CA8A04',      // yellow-600
    bgColor: '#FEF9C3',    // yellow-100
    borderColor: '#FEF08A', // yellow-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="4" width="8" height="16" rx="1"/>
        <path d="M8 8h8M8 12h8M8 16h8"/>
        <path d="M10 2v2M14 2v2M10 20v2M14 20v2"/>
      </svg>
    ),
  },
  Frenos: {
    label: 'Frenos (General)',
    color: '#DC2626',      // red-600
    bgColor: '#FEE2E2',    // red-100
    borderColor: '#FECACA', // red-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6" strokeDasharray="3 2"/>
        <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.3"/>
        <path d="M2 12h3" strokeWidth="3"/>
      </svg>
    ),
  },
  'Zapata Frenos': {
    label: 'Zapata de Freno',
    color: '#EA580C',      // orange-600
    bgColor: '#FFF7ED',    // orange-50
    borderColor: '#FED7AA', // orange-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12a7 7 0 0 1 14 0" strokeWidth="3"/>
        <path d="M3 12h18"/>
      </svg>
    ),
  },
  'Pastillas Delanteras': {
    label: 'Pastillas Delanteras',
    color: '#F97316',      // orange-500
    bgColor: '#FFF7ED',    // orange-50
    borderColor: '#FED7AA', // orange-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v-2a8 8 0 0 1 16 0v2" strokeWidth="2"/>
        <path d="M3 12h5" strokeWidth="3"/>
        <path d="M16 12h5" strokeWidth="3"/>
      </svg>
    ),
  },
  'Pastillas Traseras': {
    label: 'Pastillas Traseras',
    color: '#F97316',      // orange-500
    bgColor: '#FFF7ED',    // orange-50
    borderColor: '#FED7AA', // orange-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v2a8 8 0 0 0 16 0v-2" strokeWidth="2"/>
        <path d="M3 12h5" strokeWidth="3"/>
        <path d="M16 12h5" strokeWidth="3"/>
      </svg>
    ),
  },
  'Discos Delanteros': {
    label: 'Discos Delanteros',
    color: '#475569',      // slate-600
    bgColor: '#F1F5F9',    // slate-100
    borderColor: '#E2E8F0', // slate-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Brake disc */}
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="6" strokeDasharray="2 2" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.3"/>
        {/* Front marker */}
        <path d="M6 5.5a9 9 0 0 1 12 0" strokeWidth="2.5" opacity="0.9"/>
      </svg>
    ),
  },
  'Discos Traseros': {
    label: 'Discos Traseros',
    color: '#64748B',      // slate-500
    bgColor: '#F8FAFC',    // slate-50
    borderColor: '#E2E8F0', // slate-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Brake disc */}
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="6" strokeDasharray="2 2" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.3"/>
        {/* Rear marker */}
        <path d="M6 18.5a9 9 0 0 0 12 0" strokeWidth="2.5" opacity="0.9"/>
      </svg>
    ),
  },
  Ruedas: {
    label: 'Neumáticos / Ruedas',
    color: '#374151',      // gray-700
    bgColor: '#F3F4F6',    // gray-100
    borderColor: '#E5E7EB', // gray-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Tire */}
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.08"/>
        <circle cx="12" cy="12" r="3"/>
        {/* Tire tread marks */}
        <path d="M12 2v3" strokeWidth="2.5"/>
        <path d="M12 19v3" strokeWidth="2.5"/>
        <path d="M2 12h3" strokeWidth="2.5"/>
        <path d="M19 12h3" strokeWidth="2.5"/>
        {/* Lug nuts */}
        <circle cx="12" cy="9" r="0.8" fill="currentColor"/>
        <circle cx="14.6" cy="10.5" r="0.8" fill="currentColor"/>
        <circle cx="14.6" cy="13.5" r="0.8" fill="currentColor"/>
        <circle cx="12" cy="15" r="0.8" fill="currentColor"/>
        <circle cx="9.4" cy="13.5" r="0.8" fill="currentColor"/>
        <circle cx="9.4" cy="10.5" r="0.8" fill="currentColor"/>
      </svg>
    ),
  },
  Correa: {
    label: 'Correa Distribución',
    color: '#6B7280',      // gray-500
    bgColor: '#F9FAFB',    // gray-50
    borderColor: '#E5E7EB', // gray-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Belt/chain links */}
        <circle cx="7" cy="7" r="4"/>
        <circle cx="17" cy="17" r="4"/>
        {/* Belt connecting them */}
        <path d="M4.5 10l6 6.5"/>
        <path d="M10 4.5l6.5 6"/>
        {/* Teeth marks */}
        <path d="M5 11l1-1" strokeWidth="1.5"/>
        <path d="M8 14l1-1" strokeWidth="1.5"/>
        <path d="M11 17l1-1" strokeWidth="1.5"/>
      </svg>
    ),
  },
  'Reparación': {
    label: 'Reparación / Avería',
    color: '#EA580C',      // orange-600
    bgColor: '#FFF7ED',    // orange-50
    borderColor: '#FED7AA', // orange-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Wrench */}
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  'Revisión': {
    label: 'Revisión General',
    color: '#059669',      // emerald-600
    bgColor: '#D1FAE5',    // emerald-100
    borderColor: '#A7F3D0', // emerald-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Clipboard with checkmark */}
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 14l2 2 4-4" strokeWidth="2.5"/>
      </svg>
    ),
  },
  Otro: {
    label: 'Otro',
    color: '#7C3AED',      // violet-600
    bgColor: '#EDE9FE',    // violet-100
    borderColor: '#DDD6FE', // violet-200
    icon: (size) => (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Gear/settings */}
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
};

export function getMaintenanceConfig(type) {
  return TYPES[type] || TYPES['Otro'];
}

export default function MaintenanceIcon({ type, size = 20, withBg = false, bgSize = 36 }) {
  const config = getMaintenanceConfig(type);

  const iconElement = (
    <span style={{ color: config.color, display: 'inline-flex' }}>
      {config.icon(size)}
    </span>
  );

  if (!withBg) return iconElement;

  return (
    <div
      style={{
        width: bgSize,
        height: bgSize,
        backgroundColor: config.bgColor,
        border: `1.5px solid ${config.borderColor}`,
        borderRadius: '10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {iconElement}
    </div>
  );
}

// Export the full config for use in type selectors
export { TYPES as MAINTENANCE_TYPE_CONFIG };
