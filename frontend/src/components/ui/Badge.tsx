import React from 'react';

export interface BadgeProps {
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'outline' | 'navy' | 'black';
  size?: 'xs' | 'sm' | 'md';
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  children,
  dot = false,
  className = '',
}) => {
  const sizeStyles = {
    xs: 'text-[10px] px-1.5 py-0.5 font-semibold tracking-tight',
    sm: 'text-xs px-2 py-0.5 font-semibold',
    md: 'text-xs px-2.5 py-1 font-semibold',
  };

  const variantStyles = {
    neutral: 'bg-neutral-100 text-black border border-neutral-300',
    black: 'bg-black text-white border border-black',
    success: 'bg-emerald-50 text-emerald-950 border border-emerald-300',
    warning: 'bg-amber-50 text-amber-950 border border-amber-300',
    error: 'bg-rose-50 text-rose-950 border border-rose-300',
    info: 'bg-sky-50 text-sky-950 border border-sky-300',
    navy: 'bg-black text-white border border-black',
    outline: 'bg-white text-black border border-neutral-300',
  };

  const dotColors = {
    neutral: 'bg-black',
    black: 'bg-emerald-400',
    success: 'bg-emerald-600',
    warning: 'bg-amber-600',
    error: 'bg-rose-600',
    info: 'bg-sky-600',
    navy: 'bg-emerald-400',
    outline: 'bg-black',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  );
};
