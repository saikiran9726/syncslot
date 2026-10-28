import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
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
      loading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const isSpinnerActive = isLoading || loading;
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-control transition-colors duration-150 focus-ring min-h-[44px] cursor-pointer select-none active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5 min-h-[36px]',
      md: 'px-4 py-2 text-sm font-semibold gap-2 min-h-[44px]',
      lg: 'px-6 py-3 text-base font-semibold gap-2.5 min-h-[50px]',
    }[size];

    const variantStyles = {
      primary: 'bg-accent text-white hover:bg-accent-hover shadow-subtle',
      secondary:
        'bg-card text-ink border border-border hover:bg-surface hover:text-ink shadow-subtle',
      outline:
        'bg-transparent text-ink border border-border hover:bg-surface hover:border-ink-muted/50',
      ghost: 'bg-transparent text-ink hover:bg-accent-tint/60 hover:text-accent',
      danger: 'bg-danger text-white hover:bg-danger/90 shadow-subtle',
    }[variant];

    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        disabled={disabled || isSpinnerActive}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${widthStyles} ${className}`}
        {...props}
      >
        {isSpinnerActive ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
            <span className="sr-only">Loading...</span>
            {children}
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  'aria-label': string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', className = '', ...props }, ref) => {
    const sizeStyles = {
      sm: 'w-9 h-9 min-w-[44px] min-h-[44px]',
      md: 'w-11 h-11 min-w-[44px] min-h-[44px]',
      lg: 'w-13 h-13 min-w-[48px] min-h-[48px]',
    }[size];

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={`p-0 ${sizeStyles} ${className}`}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = 'IconButton';
