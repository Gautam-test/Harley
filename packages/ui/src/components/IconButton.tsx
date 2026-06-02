import type { ReactNode } from 'react';
import { cn } from '../cn.js';

// Square 32×32 icon-only action button used in table action columns
// across the dealer + admin portals. Renders a visible tooltip on
// hover/focus via a CSS-only span so we don't ship JS for tooltips.
// Two render modes: <button> (default) or <a> when `href` is set.
export type IconButtonTone = 'default' | 'danger' | 'primary';

type CommonProps = {
  /** Tooltip label + aria-label. Required for accessibility. */
  label: string;
  children: ReactNode;
  tone?: IconButtonTone;
  disabled?: boolean;
  className?: string;
};

type ButtonProps = CommonProps & {
  as?: 'button';
  onClick?: () => void;
  href?: undefined;
  target?: undefined;
};

type AnchorProps = CommonProps & {
  as: 'a';
  href: string;
  /** Defaults to "_blank" + noreferrer for external preview links. */
  target?: string;
  onClick?: undefined;
};

export type IconButtonProps = ButtonProps | AnchorProps;

const toneClasses: Record<IconButtonTone, string> = {
  default:
    'text-gray-500 hover:text-text-on-light hover:border-gray-400 hover:bg-gray-50',
  danger:
    'text-gray-500 hover:text-danger hover:border-danger/40 hover:bg-danger/5',
  primary:
    'text-gray-500 hover:text-hd-orange hover:border-hd-orange hover:bg-hd-orange/5',
};

export function IconButton(props: IconButtonProps) {
  const { label, children, tone = 'default', disabled, className } = props;
  const base = cn(
    'group relative inline-flex items-center justify-center w-8 h-8 border border-gray-200 rounded transition disabled:opacity-40 disabled:cursor-not-allowed',
    toneClasses[tone],
    className,
  );
  const tooltip = (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-hd-black text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-2 py-1 rounded opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition z-10"
    >
      {label}
    </span>
  );
  if (props.as === 'a') {
    return (
      <a
        href={props.href}
        target={props.target ?? '_blank'}
        rel="noreferrer"
        aria-label={label}
        title={label}
        className={base}
      >
        {children}
        {tooltip}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={base}
    >
      {children}
      {tooltip}
    </button>
  );
}
