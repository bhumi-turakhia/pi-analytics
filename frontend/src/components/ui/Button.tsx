import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 tracking-tight',
    md: 'text-xs px-3.5 py-2 gap-2 tracking-normal',
    lg: 'text-sm px-4 py-2.5 gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-black text-white hover:bg-neutral-800 active:bg-neutral-950 shadow-xs border border-black',
    secondary:
      'bg-neutral-100 text-black hover:bg-neutral-200 active:bg-neutral-300 border border-neutral-300',
    outline:
      'bg-white text-black hover:bg-black hover:text-white active:bg-neutral-900 border border-black shadow-xs transition-colors',
    ghost:
      'bg-transparent text-black hover:bg-neutral-100 hover:text-black',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 border border-rose-700',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
