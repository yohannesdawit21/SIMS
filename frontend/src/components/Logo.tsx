import React from 'react';

interface LogoProps {
  collapsed?: boolean;
  size?: number;
  /** 'sidebar' = dark background, 'light' = light background (login page) */
  variant?: 'sidebar' | 'light';
}

/**
 * Aletta Chuko TVET College logo.
 * Responsive — shows icon only when collapsed, full logo when expanded.
 */
export function Logo({ collapsed = false, size = 38, variant = 'sidebar' }: LogoProps) {
  const isDark = variant === 'sidebar';
  const primaryText = isDark ? '#ffffff' : '#001529';
  const subText = isDark ? 'rgba(255,255,255,0.55)' : '#595959';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* ── SVG Icon ── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Outer shield shape */}
        <path
          d="M28 2 L52 12 L52 32 C52 44 28 54 28 54 C28 54 4 44 4 32 L4 12 Z"
          fill="#1677ff"
        />
        <path
          d="M28 7 L47 15.5 L47 32 C47 41 28 49.5 28 49.5 C28 49.5 9 41 9 32 L9 15.5 Z"
          fill="#003a8c"
        />

        {/* Mortarboard cap */}
        <polygon points="28,14 40,19 28,24 16,19" fill="#faad14" />
        <rect x="37.5" y="19" width="2" height="9" rx="1" fill="#faad14" />
        <ellipse cx="38.5" cy="28" rx="2.5" ry="1.5" fill="#ffd666" />

        {/* Open book */}
        <rect x="17" y="27" width="10" height="8" rx="1.5" fill="white" opacity="0.9" />
        <rect x="29" y="27" width="10" height="8" rx="1.5" fill="white" opacity="0.9" />
        <line x1="27" y1="27" x2="27" y2="35" stroke="#1677ff" strokeWidth="1" />
        <line x1="29" y1="27" x2="29" y2="35" stroke="#1677ff" strokeWidth="1" />
        <line x1="19" y1="30" x2="25" y2="30" stroke="#91caff" strokeWidth="0.8" />
        <line x1="19" y1="32" x2="25" y2="32" stroke="#91caff" strokeWidth="0.8" />
        <line x1="31" y1="30" x2="37" y2="30" stroke="#91caff" strokeWidth="0.8" />
        <line x1="31" y1="32" x2="37" y2="32" stroke="#91caff" strokeWidth="0.8" />

        {/* Gear bottom-center */}
        <circle cx="28" cy="41" r="4" fill="none" stroke="#faad14" strokeWidth="1.5" />
        <circle cx="28" cy="41" r="1.5" fill="#faad14" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 28 + Math.cos(rad) * 4.5;
          const y1 = 41 + Math.sin(rad) * 4.5;
          const x2 = 28 + Math.cos(rad) * 5.8;
          const y2 = 41 + Math.sin(rad) * 5.8;
          return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#faad14" strokeWidth="1.5" strokeLinecap="round" />;
        })}
      </svg>

      {/* ── Text — hidden when collapsed ── */}
      {!collapsed && (
        <div
          style={{
            lineHeight: 1.25,
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: primaryText,
              letterSpacing: 0.3,
              fontFamily: 'system-ui, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Aletta Chuko
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 11,
              color: isDark ? '#69b1ff' : '#1677ff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            TVET College
          </div>
          <div
            style={{
              fontSize: 9,
              color: subText,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            SIMS
          </div>
        </div>
      )}
    </div>
  );
}
