import { Link, NavLink } from 'react-router-dom';
import { useSellBikeStore } from '../store/sellBike';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `font-subhead uppercase tracking-subhead text-sm transition pb-1 border-b-2 ${
    isActive
      ? 'text-hd-orange border-hd-orange'
      : 'text-text-primary border-transparent hover:text-hd-orange'
  }`;

const navButtonClasses =
  'font-subhead uppercase tracking-subhead text-sm transition pb-1 border-b-2 border-transparent text-text-primary hover:text-hd-orange';

export function SiteHeader() {
  const openSellBike = useSellBikeStore((s) => s.openSellBike);
  return (
    <header className="bg-hd-black border-b border-surface-2 sticky top-0 z-40">
      <div className="max-w-container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center group" aria-label="H-D Certified — home">
          {/* H-D Certified™ wordmark — hand-authored SVG (light variant for
              the dark header). The eyebrow text was removed at brand request;
              the wordmark is the only header lockup. */}
          <img
            src="/brand/hd-certified-wordmark-light.svg"
            alt="H-D Certified™"
            className="h-8 w-auto"
            width={172}
            height={32}
            decoding="async"
          />
        </Link>
        <nav className="flex items-center gap-6 lg:gap-8">
          <NavLink to="/" className={navLinkClasses} end>
            Home
          </NavLink>
          <NavLink to="/search" className={navLinkClasses}>
            Search Stock
          </NavLink>
          {/* Sell Your Bike opens a modal globally rather than navigating to a
              standalone route — Figma /Customer/Frame 28.png shows it as a
              popup. The /sell-bike route is preserved as a deep-link fallback. */}
          <button
            type="button"
            onClick={openSellBike}
            className={navButtonClasses}
          >
            Sell Your Bike
          </button>
          <NavLink to="/track" className={navLinkClasses}>
            Track Enquiry
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
