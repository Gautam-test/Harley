import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSellBikeStore } from '../store/sellBike';

// Top-nav link weight: H-D 2026 guidelines reserve 1903 Bold (700) for
// page headlines and primary CTAs. Nav items + the drawer rows use 1903
// Regular (400) — overriding the .font-subhead utility's bundled 700 with
// `font-normal` so the header doesn't read as visually heavier than the
// page headline below it (QA bug — "Header font weight too heavy"). The
// uppercase + tracking-subhead treatment carries the brand voice without
// the bold cut.
const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `font-subhead font-normal uppercase tracking-subhead text-sm transition pb-1 border-b-2 ${
    isActive
      ? 'text-hd-orange border-hd-orange'
      : 'text-text-primary border-transparent hover:text-hd-orange'
  }`;

const navButtonClasses =
  'font-subhead font-normal uppercase tracking-subhead text-sm transition pb-1 border-b-2 border-transparent text-text-primary hover:text-hd-orange';

// Same NavLink active classes but adapted for the mobile drawer (no
// underline; full-width row instead).
const drawerLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `block px-6 py-4 font-subhead font-normal uppercase tracking-subhead text-base border-l-4 transition ${
    isActive
      ? 'text-hd-orange border-hd-orange bg-hd-orange/10'
      : 'text-text-primary border-transparent hover:text-hd-orange hover:bg-surface-2/40'
  }`;

export function SiteHeader() {
  const openSellBike = useSellBikeStore((s) => s.openSellBike);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Auto-close the drawer whenever the route changes (so a tap on "Search
  // Stock" closes the drawer along with navigating). Also close when the
  // viewport widens past `md` so a phone → tablet rotate doesn't leave a
  // stale-open drawer behind the desktop nav.
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setDrawerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawerOpen]);

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

        {/* Desktop nav — visible at md and above. Below md it collapses into
            the hamburger drawer below. */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
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

        {/* Hamburger trigger — only visible below md. Three stacked lines
            morph to an X when the drawer is open. */}
        <button
          type="button"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
          className="md:hidden inline-flex h-10 w-10 items-center justify-center text-text-primary hover:text-hd-orange transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-6 h-6"
            aria-hidden
          >
            {drawerOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer — slides down below the header on tap. Backdrop
          covers the page so a tap outside dismisses. Hidden above md so it
          can never appear alongside the desktop nav. */}
      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 top-16 z-30 bg-hd-black/60 md:hidden"
          />
          <nav className="md:hidden fixed inset-x-0 top-16 z-40 bg-hd-black border-b border-surface-2 py-2 shadow-2xl">
            <NavLink to="/" className={drawerLinkClasses} end>
              Home
            </NavLink>
            <NavLink to="/search" className={drawerLinkClasses}>
              Search Stock
            </NavLink>
            <button
              type="button"
              onClick={() => {
                openSellBike();
                setDrawerOpen(false);
              }}
              className="block w-full text-left px-6 py-4 font-subhead font-normal uppercase tracking-subhead text-base border-l-4 border-transparent text-text-primary hover:text-hd-orange hover:bg-surface-2/40 transition"
            >
              Sell Your Bike
            </button>
            <NavLink to="/track" className={drawerLinkClasses}>
              Track Enquiry
            </NavLink>
          </nav>
        </>
      )}
    </header>
  );
}
