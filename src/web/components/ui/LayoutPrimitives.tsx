import React, { useState } from 'react';

// --- PAGE HEADER ---

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/80 ${className}`}>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-ink-muted mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};

// --- ACCESSIBLE TABS ---

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className = '' }) => {
  return (
    <div className={`flex items-center border-b border-border overflow-x-auto no-scrollbar ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors duration-150 whitespace-nowrap focus-ring ${
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-border'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-accent-tint text-accent' : 'bg-surface text-ink-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// --- RESPONSIVE TABLE COLLAPSIBLE TO CARDS BELOW 640PX ---

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyTitle?: string;
  emptyReason?: string;
  className?: string;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyTitle = 'No Records Found',
  emptyReason = 'There are no entries to display yet.',
  className = '',
}: TableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-center py-10 bg-card rounded-card border border-border">
        <p className="font-semibold text-ink text-sm">{emptyTitle}</p>
        <p className="text-xs text-ink-muted mt-1">{emptyReason}</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop Table View (>= 640px) */}
      <div className="hidden sm:block overflow-x-auto rounded-card border border-border bg-card shadow-subtle">
        <table className="w-full text-left text-sm text-ink">
          <thead className="bg-surface border-b border-border text-xs font-semibold uppercase text-ink-muted tracking-wider">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-5 py-3.5">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((item) => (
              <tr key={keyExtractor(item)} className="hover:bg-surface/50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-4">
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List (< 640px) */}
      <div className="block sm:hidden flex flex-col gap-3">
        {data.map((item) => (
          <div
            key={keyExtractor(item)}
            className="p-4 bg-card rounded-control border border-border shadow-subtle flex flex-col gap-2.5"
          >
            {columns.map((col) => (
              <div key={col.key} className="flex items-start justify-between text-xs">
                <span className="font-semibold text-ink-muted uppercase">{col.header}</span>
                <span className="text-right text-ink font-medium">
                  {col.render ? col.render(item) : item[col.key]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- AVATAR (INITIALS) ---

export const Avatar: React.FC<{ name: string; size?: 'sm' | 'md' | 'lg' }> = ({
  name,
  size = 'md',
}) => {
  const sizeStyles = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  const getInitials = (n: string) => {
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (n.slice(0, 2) || 'SS').toUpperCase();
  };

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full bg-accent-tint text-accent font-bold select-none shrink-0 ${sizeStyles}`}
    >
      {getInitials(name)}
    </div>
  );
};
