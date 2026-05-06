import { Link, NavLink } from 'react-router-dom';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `font-subhead uppercase tracking-subhead text-sm transition pb-1 border-b-2 ${
    isActive
      ? 'text-hd-orange border-hd-orange'
      : 'text-text-primary border-transparent hover:text-hd-orange'
  }`;

export function SiteHeader() {
  return (
    <header className="bg-hd-black border-b border-surface-2 sticky top-0 z-40">
      <div className="max-w-container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" aria-label="H-D Certified — home">
          {/* Bar-and-shield emblem placeholder — text mark used until the licensed
              brand asset (`HARLEY-DAVIDSON / MOTOR / CYCLES` shield) is supplied. */}
          <span
            className="inline-flex h-10 w-10 items-center justify-center bg-hd-orange/10 border border-hd-orange/40 text-hd-orange font-headline tracking-headline leading-none"
            aria-hidden
          >
            H-D
          </span>
          <span className="leading-tight border-l border-surface-2 pl-3 hidden sm:block">
            {/* Header.png eyebrow — Figma reads "CERTIFIED PRE-OWNED MARKETPLACE"
                in two stacked subhead lines. */}
            <span className="block font-subhead uppercase tracking-subhead text-[10px] text-hd-orange">
              Certified Pre-Owned
            </span>
            <span className="block font-subhead uppercase tracking-subhead text-[11px] text-hd-white">
              Marketplace
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-6 lg:gap-8">
          <NavLink to="/" className={navLinkClasses} end>
            Home
          </NavLink>
          <NavLink to="/search" className={navLinkClasses}>
            Search Stock
          </NavLink>
          <NavLink to="/sell-bike" className={navLinkClasses}>
            Sell Your Bike
          </NavLink>
          <NavLink to="/track" className={navLinkClasses}>
            Track Enquiry
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
