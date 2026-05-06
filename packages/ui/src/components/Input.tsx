import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn.js';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full bg-hd-white border border-gray-300 text-text-on-light placeholder:text-gray-400',
        'px-4 py-3 font-body focus:outline-none focus:ring-2 focus:ring-hd-orange focus:border-hd-orange',
        invalid && 'border-danger ring-danger',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
