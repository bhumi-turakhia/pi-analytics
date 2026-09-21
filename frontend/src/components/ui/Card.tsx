import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-white border border-stone-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] rounded-lg',
    subtle: 'bg-stone-50/60 border border-stone-200/70 rounded-lg',
    bordered: 'bg-white border border-stone-300 rounded-lg',
  };

  const paddingStyles = {
    none: '',
    sm: 'p-3.5',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      className={`${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
