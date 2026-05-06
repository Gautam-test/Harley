import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../cn.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Default light-theme variants. The buyer site is light; dealer + admin shells
// have light bodies but dark headers — pages can override className when used
// inside a dark surface (e.g. login screens).
const variantStyles: Record<Variant, string> = {
  primary: 'bg-hd-orange text-hd-black hover:brightness-110',
  secondary: 'border border-hd-black text-hd-black hover:bg-hd-black hover:text-hd-white',
  ghost: 'text-hd-black hover:bg-surface-light',
  destructive: 'bg-danger text-hd-white hover:brightness-110',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(
        'font-subhead uppercase tracking-subhead transition disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    />
  ),
);
Button.displayName = 'Button';
