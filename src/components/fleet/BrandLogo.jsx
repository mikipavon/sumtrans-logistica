import React from 'react';
import { Truck } from 'lucide-react';

/**
 * BrandLogo — Muestra el escudo REAL de la marca del vehículo
 * Usa imágenes PNG reales descargadas en /logos/brands/
 * 
 * Props:
 *   model: string — El modelo del vehículo (e.g., "FIAT Ducato")
 *   size: number — Tamaño en px (default: 40)
 *   className: string — Clases CSS adicionales
 */

const BRAND_MAP = {
  fiat:       { name: 'FIAT',        file: 'fiat.png' },
  peugeot:    { name: 'PEUGEOT',     file: 'peugeot.png' },
  hyundai:    { name: 'HYUNDAI',     file: 'hyundai.png' },
  mercedes:   { name: 'MERCEDES',    file: 'mercedes.png' },
  renault:    { name: 'RENAULT',     file: 'renault.png' },
  volkswagen: { name: 'VOLKSWAGEN',  file: 'volkswagen.png' },
  iveco:      { name: 'IVECO',       file: 'iveco.png' },
  man:        { name: 'MAN',         file: 'man.png' },
  bmw:        { name: 'BMW',         file: 'bmw.png' },
  toyota:     { name: 'TOYOTA',      file: 'toyota.png' },
  ford:       { name: 'FORD',        file: 'ford.png' },
  citroen:    { name: 'CITROËN',     file: 'citroen.png' },
  nissan:     { name: 'NISSAN',      file: 'nissan.png' },
  volvo:      { name: 'VOLVO',       file: 'volvo.png' },
  daf:        { name: 'DAF',         file: 'daf.png' },
  scania:     { name: 'SCANIA',      file: 'scania.png' },
  opel:       { name: 'OPEL',        file: 'opel.png' },
};

function extractBrand(model) {
  if (!model) return null;
  const upper = model.toUpperCase();
  
  // Check exact brand matches (order matters for overlapping names)
  if (upper.includes('MERCEDES') || upper.includes('BENZ')) return 'mercedes';
  if (upper.includes('VOLKSWAGEN') || upper.includes('VW')) return 'volkswagen';
  if (upper.includes('CITROËN') || upper.includes('CITROEN')) return 'citroen';
  if (upper.includes('PEUGEOT')) return 'peugeot';
  if (upper.includes('HYUNDAI')) return 'hyundai';
  if (upper.includes('RENAULT')) return 'renault';
  if (upper.includes('TOYOTA')) return 'toyota';
  if (upper.includes('NISSAN')) return 'nissan';
  if (upper.includes('SCANIA')) return 'scania';
  if (upper.includes('IVECO')) return 'iveco';
  if (upper.includes('VOLVO')) return 'volvo';
  if (upper.includes('FORD')) return 'ford';
  if (upper.includes('OPEL')) return 'opel';
  if (upper.includes('FIAT')) return 'fiat';
  if (upper.includes('BMW')) return 'bmw';
  if (upper.includes('MAN')) return 'man';
  if (upper.includes('DAF')) return 'daf';
  
  return null;
}

export default function BrandLogo({ model, size = 40, className = '' }) {
  const brandKey = extractBrand(model);
  const brand = brandKey ? BRAND_MAP[brandKey] : null;

  if (brand) {
    return (
      <div 
        className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title={brand.name}
      >
        <img 
          src={`/logos/brands/${brand.file}`} 
          alt={brand.name}
          style={{ 
            width: size, 
            height: size, 
            objectFit: 'contain',
          }}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback: primera letra de la marca en un círculo gris
  const brandName = model ? model.split(' ')[0] : '?';
  const initial = brandName.charAt(0).toUpperCase();
  
  return (
    <div 
      className={`inline-flex items-center justify-center flex-shrink-0 rounded-full bg-slate-100 border border-slate-200 ${className}`}
      style={{ width: size, height: size }}
      title={brandName}
    >
      <span className="font-bold text-slate-500" style={{ fontSize: size * 0.4 }}>
        {initial}
      </span>
    </div>
  );
}

// Export helper for getting brand color (used for accent colors)
export function getBrandColor(model) {
  const brandKey = extractBrand(model);
  const colors = {
    fiat: '#8B1A1A',
    peugeot: '#1A237E',
    hyundai: '#002C5F',
    mercedes: '#333333',
    renault: '#FFCC00',
    volkswagen: '#001E50',
    iveco: '#003366',
    man: '#E40521',
    bmw: '#0066B1',
    toyota: '#EB0A1E',
    ford: '#003399',
    citroen: '#AC1926',
    nissan: '#C3002F',
    volvo: '#003057',
    daf: '#004B93',
    scania: '#041E42',
    opel: '#F7D410',
  };
  return brandKey ? colors[brandKey] : '#475569';
}

export { extractBrand };
