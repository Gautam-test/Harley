import type { HTMLAttributes } from 'react';
import { cn } from '../cn.js';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-hd-white border border-gray-200 rounded-card overflow-hidden',
        className,
      )}
      {...rest}
    />
  );
}
