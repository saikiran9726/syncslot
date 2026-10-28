import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-control transition-colors duration-150 focus-ring min-h-[44px] cursor-pointer select-none active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5',
      md: 'px-4 py-2 text-sm font-semibold gap-2',
      lg: 'px-6 py-3 text-base font-semibold gap-2.5',
    }[size];

    const variantStyles = {
      primary: 'bg-accent text-white hover:bg-accent-hover shadow-subtle',
      secondary:
        'bg-card text-ink border border-border hover:bg-surface hover:text-ink shadow-subtle',
      ghost: 'bg-transparent text-ink hover:bg-accent-tint/60 hover:text-accent',
      danger: 'bg-danger text-white hover:bg-danger/90 shadow-subtle',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon: React.ReactNode;
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', className = '', ...props }, ref) => {
    const sizeStyles = {
      sm: 'w-8 h-8 p-1.5 min-w-[36px] min-h-[36px]',
      md: 'w-11 h-11 p-2.5 min-w-[44px] min-h-[44px]',
      lg: 'w-12 h-12 p-3 min-w-[48px] min-h-[48px]',
    }[size];

    const variantStyles = {
      primary: 'bg-accent text-white hover:bg-accent-hover',
      secondary: 'bg-card text-ink border border-border hover:bg-surface',
      ghost: 'bg-transparent text-ink hover:bg-surface hover:text-accent',
      danger: 'bg-transparent text-danger hover:bg-danger-tint',
    }[variant];

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-control transition-colors duration-150 focus-ring cursor-pointer ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
