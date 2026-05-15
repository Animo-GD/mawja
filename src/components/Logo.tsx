'use client';

import React from 'react';
import { useLang } from '@/lib/LanguageContext';

export default function Logo({ size = 32, fontSize = '1.5rem', className = '' }: { size?: number, fontSize?: string, className?: string }) {
  const { lang } = useLang();

  return (
    <div className={`logo-container ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* Icon: Wave */}
      <div style={{ width: size, height: size, flexShrink: 0, position: 'relative' }}>
        <svg 
          viewBox="0 0 40 40" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id="mawja-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="10" fill="url(#mawja-grad)" />
          {/* Wave paths */}
          <path 
            d="M6 14 C10 10, 14 18, 20 14 C26 10, 30 18, 34 14"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6"
          />
          <path 
            d="M6 20 C10 16, 14 24, 20 20 C26 16, 30 24, 34 20"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85"
          />
          <path 
            d="M6 26 C10 22, 14 30, 20 26 C26 22, 30 30, 34 26"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"
          />
        </svg>
      </div>

      {/* Text Part: Mawja / موجه */}
      <div style={{ 
        fontSize: fontSize, 
        fontWeight: 800, 
        fontFamily: lang === 'ar' ? "'Cairo', 'Tajawal', sans-serif" : "'Inter', system-ui, sans-serif", 
        letterSpacing: lang === 'ar' ? '0' : '-0.03em',
        color: '#1e293b',
        lineHeight: 1,
        whiteSpace: 'nowrap'
      }}>
        {lang === 'ar' ? (
          <>موجـ<span style={{ color: '#4f46e5' }}>ـه</span></>
        ) : (
          <>Maw<span style={{ color: '#4f46e5' }}>ja</span></>
        )}
      </div>
    </div>
  );
}
