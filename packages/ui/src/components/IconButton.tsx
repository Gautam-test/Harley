import type { ReactNode } from 'react';
import { cn } from '../cn.js';

// Square 32×32 icon-only action button used in table action columns
// across the dealer + admin portals. Renders a visible tooltip on
// hover/focus via a CSS-only span so we don't ship JS for tooltips.
//
// Three render modes:
//   1. <button>           (default) — onClick handler
//   2. <a href=...>       (as="a")  — external links, opens in new tab
//   3. <a href=BASE+to>   (to=...)  — internal SPA navigation; href is
//                                     resolved with import.meta.env.BASE_URL
//                                     so the link stays inside the current
//                                     SPA (e.g. /dealer/, /admin/) — fixes
//                                     the "lands on buyer 404" bug where
//                                     raw <a href="/listings/:id/edit">
//                                     bypassed React Router's basename.
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
  to?: undefined;
  target?: undefined;
};

type AnchorProps = CommonProps & {
  as: 'a';
  href: string;
  /** Defaults to "_blank" + noreferrer for external preview links. */
  target?: string;
  onClick?: undefined;
  to?: undefined;
};

type InternalNavProps = CommonProps & {
  /** Internal SPA path (without basename). Will be prepended with
   *  import.meta.env.BASE_URL so it routes inside the current SPA.
   *  Use this for Edit / View / detail links within the dealer or
   *  admin portals — not for cross-SPA links. */
  to: string;
  as?: undefined;
  href?: undefined;
  target?: undefined;
  onClick?: undefined;
};

export type IconButtonProps = ButtonProps | AnchorProps | InternalNavProps;

const toneClasses: Record<IconButtonTone, string> = {
  default:
    'text-gray-500 hover:text-text-on-light hover:border-gray-400 hover:bg-gray-50',
  danger:
    'text-gray-500 hover:text-danger hover:border-danger/40 hover:bg-danger/5',
  primary:
    'text-gray-500 hover:text-hd-orange hover:border-hd-orange hover:bg-hd-orange/5',
};

/** Resolve an internal SPA path to a full href that respects the
 *  current Vite BASE_URL (e.g. /dealer/, /admin/). Collapses any
 *  duplicate slashes so the result is always a clean single-slash path. */
function resolveInternalHref(to: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '/');
  const path = to.replace(/^\/+/, '');
  return `${base}${path}`.replace(/\/+/g, '/');
}

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
  // Internal SPA navigation: auto-prepend BASE_URL so href stays inside
  // the current portal's React Router. target=_self so the SPA doesn't
  // do a full page reload.
  if ('to' in props && props.to !== undefined) {
    return (
      <a
        href={resolveInternalHref(props.to)}
        target="_self"
        aria-label={label}
        title={label}
        className={base}
      >
        {children}
        {tooltip}
      </a>
    );
  }
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
