import type { HTMLAttributes } from 'react';
import { cn } from '../cn.js';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'cpo' | 'as-is' | 'status';
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({
  variant = 'cpo',
  tone = 'neutral',
  className,
  children,
  ...rest
}: BadgeProps) {
  const base =
    'inline-flex items-center text-xs font-subhead uppercase tracking-subhead px-2 py-1';
  if (variant === 'cpo') {
    return (
      <span className={cn(base, 'bg-hd-orange text-hd-black', className)} {...rest}>
        {children ?? 'H-D Certified'}
      </span>
    );
  }
  if (variant === 'as-is') {
    return (
      <span
        className={cn(base, 'bg-surface-light text-gray-700 border border-gray-300', className)}
        {...rest}
      >
        {children ?? 'As-Is'}
      </span>
    );
  }
  const toneStyles: Record<NonNullable<BadgeProps['tone']>, string> = {
    success: 'bg-success/15 text-success border border-success',
    warning: 'bg-warning/15 text-warning border border-warning',
    danger: 'bg-danger/15 text-danger border border-danger',
    info: 'bg-info/15 text-info border border-info',
    neutral: 'bg-surface-light text-gray-700 border border-gray-300',
  };
  return (
    <span className={cn(base, toneStyles[tone], className)} {...rest}>
      {children}
    </span>
  );
}
