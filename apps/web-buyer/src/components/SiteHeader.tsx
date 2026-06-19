import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom';
import { useSellBikeStore } from '../store/sellBike';

// QA latest: nav text strictly text-hd-white (#FFFFFF), font-weight
// 400 (Regular) in 1903 Sans wide, 14px. Active link gets the orange
// underline; text stays white. Earlier 500-weight + tracking-subhead
// caps treatment dropped — per Figma the nav reads as light corporate
// type, not as bold subheads.
const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `font-subhead font-normal uppercase tracking-subhead text-[14px] transition pb-1 border-b-2 text-hd-white ${
    isActive
      ? 'border-hd-orange'
      : 'border-transparent hover:border-hd-orange/60'
  }`;

const navButtonClasses =
  'font-subhead font-normal uppercase tracking-subhead text-[14px] transition pb-1 border-b-2 border-transparent text-hd-white hover:border-hd-orange/60';

// Mobile drawer — same white-text / orange-underline-equivalent treatment
// using a left orange border for the active row instead of a bottom one.
const drawerLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `block px-6 py-4 font-subhead font-medium uppercase tracking-subhead text-base border-l-4 transition text-hd-white ${
    isActive
      ? 'border-hd-orange bg-hd-orange/10'
      : 'border-transparent hover:bg-surface-2/40'
  }`;

export function SiteHeader() {
  const openSellBike = useSellBikeStore((s) => s.openSellBike);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Listing-detail pages live at /listings/:slug (NOT under /search/), so
  // NavLink's default isActive check loses the "Search Stock" highlight
  // when a buyer drills into a listing from the search results (QA #3).
  // Treat /listings/* as a sub-page of Search Stock so the active state
  // persists through View Details. Using useMatch keeps this declarative
  // (no manual className munging in JSX).
  const onListingDetail = Boolean(useMatch('/listings/:slug'));
  const searchActive = ({ isActive }: { isActive: boolean }) =>
    navLinkClasses({ isActive: isActive || onListingDetail });
  const searchActiveDrawer = ({ isActive }: { isActive: boolean }) =>
    drawerLinkClasses({ isActive: isActive || onListingDetail });

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
      {/* Brand Guidelines p.43-54: Bar & Shield is the primary brand mark
          and must be present. Minimum digital size 65px. H-D Certified
          program wordmark displayed alongside at a legible size. Header
          height increased to h-[72px] to accommodate compliant logo sizes. */}
      <div className="max-w-container mx-auto px-6 h-[72px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" aria-label="H-D Certified — home">
          {/* Bar & Shield mark — 96×72 viewBox, rendered at h-[44px] */}
          <img
            src="/brand/hd-bar-shield.svg"
            alt="Harley-Davidson"
            className="h-[44px] w-auto shrink-0"
            width={59}
            height={44}
            decoding="async"
          />
          {/* H-D Certified program wordmark — 295×21 viewBox, at h-[28px]
              gives a rendered width of ~393px which fits within the container */}
          <img
            src="/brand/hd-certified-wordmark-light.svg"
            alt="H-D Certified"
            className="h-[28px] w-auto"
            width={373}
            height={28}
            decoding="async"
          />
        </Link>

        {/* Desktop nav — visible at md and above. Below md it collapses into
            the hamburger drawer below. */}
        <nav className="hidden lg:flex items-center gap-6 lg:gap-8">
          <NavLink to="/" className={navLinkClasses} end>
            Home
          </NavLink>
          <NavLink to="/search" className={searchActive}>
            Search Stock
          </NavLink>
          {/* Sell Your Motorcycle opens a modal globally rather than navigating to a
              standalone route — Figma /Customer/Frame 28.png shows it as a
              popup. The /sell-motorcycle route is the deep-link; /sell-bike redirects to it. */}
          <button
            type="button"
            onClick={openSellBike}
            className={navButtonClasses}
          >
            Sell Your Motorcycle
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
          className="lg:hidden inline-flex h-10 w-10 items-center justify-center text-hd-white hover:text-hd-white/80 transition"
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
            className="fixed inset-0 top-[72px] z-30 bg-hd-black/60 lg:hidden"
          />
          <nav className="lg:hidden fixed inset-x-0 top-[72px] z-40 bg-hd-black border-b border-surface-2 py-2 shadow-2xl">
            <NavLink to="/" className={drawerLinkClasses} end>
              Home
            </NavLink>
            <NavLink to="/search" className={searchActiveDrawer}>
              Search Stock
            </NavLink>
            <button
              type="button"
              onClick={() => {
                openSellBike();
                setDrawerOpen(false);
              }}
              className="block w-full text-left px-6 py-4 font-subhead font-medium uppercase tracking-subhead text-base border-l-4 border-transparent text-hd-white hover:bg-surface-2/40 transition"
            >
              Sell Your Motorcycle
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
