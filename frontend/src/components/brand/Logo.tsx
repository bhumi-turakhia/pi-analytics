import React from 'react';
import logoImg from '../../assets/logo.png';
import logoSymbolImg from '../../assets/logo-symbol.png';
import logoIconImg from '../../assets/logo-icon.png';

export interface PiByThreeLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
  onClick?: () => void;
  variant?: 'light' | 'dark' | 'transparent';
}

/**
 * Pi by 3 Official Brand Logo Component
 * Renders the official brand logo everywhere with crisp aspect ratio and high fidelity
 */
export const PiByThreeLogo: React.FC<PiByThreeLogoProps> = ({
  size = 'md',
  showTagline = true,
  className = '',
  onClick,
  variant = 'transparent',
}) => {
  // Height sizing
  const heights = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
    xl: 'h-18',
  };

  const imageSrc = showTagline ? logoImg : logoSymbolImg;

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${
        variant === 'dark' ? 'bg-white/95 p-1.5 rounded-lg shadow-xs' : ''
      } ${className}`}
      title="π by 3 — Transforming Enterprises for Future"
    >
      <img
        src={imageSrc}
        alt="π by 3 - Transforming Enterprises for Future"
        className={`${heights[size]} w-auto object-contain shrink-0`}
        draggable={false}
      />
    </div>
  );
};

/**
 * Compact Emblem Icon for small navigation bars or avatar slots
 */
export const PiByThreeIcon: React.FC<{
  size?: number;
  className?: string;
  onClick?: () => void;
}> = ({ size = 28, className = '', onClick }) => {
  return (
    <div
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center shrink-0 select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      title="π by 3"
    >
      <img
        src={logoIconImg}
        alt="π by 3"
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  );
};

export default PiByThreeLogo;

