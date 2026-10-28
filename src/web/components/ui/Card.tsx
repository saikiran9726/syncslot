import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'flat' | 'interactive';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-card border border-border shadow-subtle',
    flat: 'bg-surface border border-border',
    interactive:
      'bg-card border border-border shadow-subtle hover:border-accent/40 transition-colors cursor-pointer',
  }[variant];

  return (
    <div className={`rounded-card p-5 ${variantStyles} ${className}`} {...props}>
      {children}
    </div>
  );
};

export interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  change,
  changeType = 'neutral',
  icon,
  subtitle,
  className = '',
}) => {
  const changeStyles = {
    positive: 'text-success bg-success-tint',
    negative: 'text-danger bg-danger-tint',
    neutral: 'text-ink-muted bg-surface',
  }[changeType];

  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
          {label}
        </span>
        {icon && <div className="text-ink-muted">{icon}</div>}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-ink tabular-nums">
          {value}
        </span>
        {change && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${changeStyles}`}>
            {change}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-ink-muted leading-relaxed">{subtitle}</p>}
    </Card>
  );
};
