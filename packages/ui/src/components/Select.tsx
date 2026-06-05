import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../cn.js';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full bg-hd-white border border-gray-300 text-text-on-light',
        'px-4 py-3 font-body focus:outline-none focus:ring-2 focus:ring-hd-orange focus:border-hd-orange',
        // QA BUG-024 (parity with Input): explicit greyed disabled state.
        // Native <select disabled> only dims slightly, which dealers
        // misread as "still editable". Cascades through <fieldset disabled>.
        'disabled:bg-surface-light disabled:text-gray-500 disabled:border-gray-200 disabled:cursor-not-allowed',
        invalid && 'border-danger ring-danger',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
