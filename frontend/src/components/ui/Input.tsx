import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, leftIcon, rightElement, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-black mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-neutral-500 pointer-events-none shrink-0">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full text-xs text-black bg-white border rounded-md transition-colors placeholder:text-neutral-400 py-2 ${
              leftIcon ? 'pl-9' : 'pl-3'
            } ${rightElement ? 'pr-9' : 'pr-3'} ${
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                : 'border-neutral-300 focus:border-black focus:ring-1 focus:ring-black'
            } disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 text-neutral-500">{rightElement}</div>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-neutral-600">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helperText, error, children, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-black mb-1.5"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`w-full text-xs text-black font-medium bg-white border rounded-md transition-colors py-2 px-3 ${
            error
              ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
              : 'border-neutral-300 focus:border-black focus:ring-1 focus:ring-black'
          } disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed ${className}`}
          {...props}
        >
          {children}
        </select>
        {error ? (
          <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-neutral-600">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
