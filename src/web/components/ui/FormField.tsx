import React, { forwardRef, useId } from 'react';

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}) => {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const childWithAria = React.cloneElement(children, {
    id,
    'aria-invalid': !!error,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
    required: required || children.props.required,
  });

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-semibold text-ink uppercase tracking-wider">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
        {hint && (
          <span id={hintId} className="text-xs text-ink-muted">
            {hint}
          </span>
        )}
      </div>

      {childWithAria}

      {error && (
        <p id={errorId} aria-live="polite" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, InputProps>(
  ({ hasError, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full min-h-[44px] px-3.5 py-2.5 bg-card border rounded-control text-ink placeholder:text-ink-muted/50 transition-colors duration-150 focus-ring ${
          hasError
            ? 'border-danger focus-visible:ring-danger'
            : 'border-border hover:border-ink-muted/40'
        } ${className}`}
        style={{ fontSize: '16px' }} // Guaranteed no iOS auto-zoom
        {...props}
      />
    );
  }
);
TextField.displayName = 'TextField';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ hasError, className = '', rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={`w-full px-3.5 py-2.5 bg-card border rounded-control text-ink placeholder:text-ink-muted/50 transition-colors duration-150 focus-ring ${
          hasError
            ? 'border-danger focus-visible:ring-danger'
            : 'border-border hover:border-ink-muted/40'
        } ${className}`}
        style={{ fontSize: '16px' }}
        {...props}
      />
    );
  }
);
TextArea.displayName = 'TextArea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ hasError, options, className = '', ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`w-full min-h-[44px] px-3.5 py-2.5 bg-card border rounded-control text-ink appearance-none transition-colors duration-150 focus-ring pr-10 ${
            hasError
              ? 'border-danger focus-visible:ring-danger'
              : 'border-border hover:border-ink-muted/40'
          } ${className}`}
          style={{ fontSize: '16px' }}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    );
  }
);
Select.displayName = 'Select';

export interface PhoneFieldProps extends InputProps {
  countryPrefix?: string;
}

export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(
  ({ countryPrefix = '+91', hasError, className = '', ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center gap-1 text-sm font-semibold text-ink-muted select-none pointer-events-none">
          <span>{countryPrefix}</span>
        </div>
        <input
          ref={ref}
          type="tel"
          className={`w-full min-h-[44px] pl-14 pr-3.5 py-2.5 bg-card border rounded-control text-ink placeholder:text-ink-muted/50 tabular-nums transition-colors duration-150 focus-ring ${
            hasError
              ? 'border-danger focus-visible:ring-danger'
              : 'border-border hover:border-ink-muted/40'
          } ${className}`}
          style={{ fontSize: '16px' }}
          placeholder="98765 43210"
          {...props}
        />
      </div>
    );
  }
);
PhoneField.displayName = 'PhoneField';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <label htmlFor={inputId} className={`flex items-start gap-3 cursor-pointer select-none ${className}`}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="mt-0.5 w-5 h-5 rounded border border-border text-accent focus-ring transition cursor-pointer"
          {...props}
        />
        <span className="text-sm text-ink font-medium leading-tight">{label}</span>
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled = false }) => {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-ring ${
          checked ? 'bg-accent' : 'bg-border'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-subtle ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-sm font-medium text-ink">{label}</span>}
    </label>
  );
};
