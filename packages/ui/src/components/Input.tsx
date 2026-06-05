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
        // QA BUG-024: disabled state must look obviously unavailable.
        // Browser-default opacity (~0.5) wasn't enough — the field stayed
        // white-with-black-text, and dealers thought it was still
        // editable (especially the Registration Number lock on edit).
        // Greyed background + lighter text + not-allowed cursor make
        // the locked state unmistakable. Cascade also flows from a
        // parent <fieldset disabled> (used on SOLD listings, BUG-022).
        'disabled:bg-surface-light disabled:text-gray-500 disabled:border-gray-200 disabled:cursor-not-allowed',
        invalid && 'border-danger ring-danger',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
