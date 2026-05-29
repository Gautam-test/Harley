import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';

const itemBase =
  'flex items-center justify-between gap-3 px-5 py-3 font-subhead uppercase tracking-subhead text-[12px] border-l-4 transition';
const itemInactive = 'border-transparent text-gray-700 hover:bg-gray-50 hover:text-text-on-light';
const itemActive = 'border-hd-orange bg-hd-orange/10 text-text-on-light';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `${itemBase} ${isActive ? itemActive : itemInactive}`;

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  badgeKey?: 'pendingListings' | 'newLeads';
  icon: React.ReactNode;
}

// QA latest: inline stroke icons to the left of each sidebar label.
// Kept inline (no icon-lib dependency) — heroicons-flavoured, 18×18,
// inherit currentColor so they pick up the active/inactive text colour.
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-[18px] h-[18px] shrink-0',
  'aria-hidden': true,
};
const DashboardIcon = () => (
  <svg {...iconProps}><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
);
const AddListingIcon = () => (
  <svg {...iconProps}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
);
const ListingsIcon = () => (
  <svg {...iconProps}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
);
const EnquiriesIcon = () => (
  <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);
const ProfileIcon = () => (
  <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
);

// Sidebar order matches Figma /Dealer/Halrey dealer_page-0007.jpg, minus the
// General Leads tab which was retired May 2026 (info-gate flow removed).
// Buyer + Seller Enquiries collapsed into a single Enquiries link per QA
// — the destination page (LeadsPage) carries All / Buyer / Seller tabs
// inside. The sidebar badge totals both kinds so the dealer still sees
// "5 new enquiries" at a glance without opening the page.
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', end: true, icon: <DashboardIcon /> },
  { to: '/listings/new', label: 'Add Listing', icon: <AddListingIcon /> },
  { to: '/listings', label: 'My Listings', end: true, badgeKey: 'pendingListings', icon: <ListingsIcon /> },
  { to: '/enquiries', label: 'Enquiries', badgeKey: 'newLeads', icon: <EnquiriesIcon /> },
  { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
];

function initials(name?: string | null) {
  if (!name) return 'HD';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'HD';
}

interface DealerListingRow { status: string }
interface DealerLeadRow { status: string }

export function DealerShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar badge counts. The dealer is auth-gated, so all 3 calls require a
  // valid token; render zero badges when unauthenticated.
  const enabled = Boolean(user);
  const listingsQuery = useQuery({
    queryKey: ['dealer-listings', 'sidebar'],
    queryFn: () => api<DealerListingRow[]>('/dealer/listings'),
    enabled,
    staleTime: 60_000,
  });
  const buyerLeadsQuery = useQuery({
    queryKey: ['dealer-leads', 'buyer', 'sidebar'],
    queryFn: () => api<DealerLeadRow[]>('/dealer/leads/buyer'),
    enabled,
    staleTime: 60_000,
  });
  // Seller-side counterpart so the Seller Enquiries item gets the same
  // unread-count chip Buyer Enquiries already had (QA blocker — dealers
  // were missing fresh trade-in leads because nothing flagged the tab).
  const sellerLeadsQuery = useQuery({
    queryKey: ['dealer-leads', 'trade-in', 'sidebar'],
    queryFn: () => api<DealerLeadRow[]>('/dealer/leads/trade-in'),
    enabled,
    staleTime: 60_000,
  });

  const badges = {
    pendingListings: (listingsQuery.data ?? []).filter((l) => l.status === 'DRAFT').length,
    // Unified count across both kinds — drives the single Enquiries
    // sidebar item that replaced the separate Buyer / Seller entries.
    newLeads:
      (buyerLeadsQuery.data ?? []).filter((l) => l.status === 'NEW').length +
      (sellerLeadsQuery.data ?? []).filter((l) => l.status === 'NEW').length,
  } as const;

  const onSignOut = () => {
    clear();
    navigate('/login');
  };

  // Auto-close the drawer on route changes + when growing past the md
  // breakpoint (otherwise a phone-rotate would leave a stale drawer
  // visible behind the desktop sidebar).
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setDrawerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawerOpen]);

  const dealerName = user?.name ?? 'Harley-Davidson';

  // Single source of truth for the nav list — used by the desktop sidebar
  // AND the mobile slide-over so labels + badge counts never drift.
  const renderNavLinks = (className: typeof navClass) =>
    NAV.map((n) => {
      const badge = n.badgeKey ? badges[n.badgeKey] : 0;
      return (
        <NavLink key={n.to} to={n.to} end={n.end} className={className}>
          {/* QA latest: icon to the LEFT of the label. The icon + label
              group together on the left; the badge stays pinned right
              via the wrapper's justify-between. */}
          <span className="inline-flex items-center gap-3 min-w-0">
            {n.icon}
            <span className="truncate">{n.label}</span>
          </span>
          {badge > 0 ? (
            <span
              aria-label={`${badge} new`}
              className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-hd-orange text-hd-black text-[10px] font-subhead"
            >
              {badge}
            </span>
          ) : null}
        </NavLink>
      );
    });

  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      <header className="bg-hd-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-4 sm:px-6 h-20 flex items-center justify-between gap-3 sm:gap-6">
          {/* Hamburger — only visible below md. Sits to the LEFT of the
              wordmark so it's the natural first-tap on phones. */}
          <button
            type="button"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center text-text-on-light hover:text-hd-orange transition shrink-0"
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
          <div className="flex items-center gap-3 min-w-0">
            {/* Only the wordmark is the clickable home-link target. The
                dealer name sits beside it as plain caption text — earlier
                builds wrapped both in a single <Link>, so hovering anywhere
                in the lockup turned "Capital Harley-Davidson Gurgaon"
                orange and showed a hand cursor over the dealer name (QA:
                "incorrect orange + unnecessary hand icon"). */}
            <Link to="/dashboard" aria-label="H-D Certified — Dashboard" className="shrink-0">
              <img
                // Vite base for the dealer SPA is "/dealer/", so an absolute
                // "/brand/..." path 404s in production (the buyer SPA owns
                // root). Prefix every static asset URL with import.meta.env
                // .BASE_URL so dev (`/dealer/`) and prod (`/dealer/`) both
                // resolve to the right public/brand path.
                src={`${import.meta.env.BASE_URL}brand/hd-certified-wordmark.svg`}
                alt="H-D Certified™"
                className="h-9 w-auto"
                width={193}
                height={36}
                decoding="async"
              />
            </Link>
            <span className="leading-tight border-l border-gray-200 pl-3 hidden sm:block">
              <span className="block font-subhead uppercase tracking-subhead text-[10px] text-hd-orange">
                Dealer Portal
              </span>
              <span className="block font-subhead font-bold tracking-subhead text-lg uppercase text-text-on-light truncate">
                {dealerName}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-sm">
              {initials(user?.name)}
            </span>
            <span className="leading-tight text-right hidden sm:block">
              <span className="block font-subhead uppercase tracking-subhead text-xs text-text-on-light">
                {user?.name ?? '—'}
              </span>
              <span className="block text-[11px] text-gray-500">Dealer Principal</span>
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sticky sidebar — header is 80px tall, so we offset top-20
            (5rem) and clamp the height to the remaining viewport. Internal
            flex column lets the nav scroll while Log Out stays pinned at the
            bottom. */}
        <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-hd-white border-r border-gray-200 sticky top-20 self-start h-[calc(100vh-5rem)]">
          <nav className="flex-1 overflow-y-auto py-4">{renderNavLinks(navClass)}</nav>
          <div className="p-4 border-t border-gray-200 shrink-0">
            <button
              onClick={onSignOut}
              className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
            >
              Log Out
            </button>
          </div>
        </aside>

        {/* Mobile drawer — slides in from the left when the hamburger is
            open. Backdrop covers the rest of the page and dismisses on tap.
            Hidden above md. */}
        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu backdrop"
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 top-20 z-30 bg-hd-black/50 md:hidden"
            />
            <aside className="md:hidden fixed top-20 left-0 z-40 w-72 max-w-[85vw] h-[calc(100vh-5rem)] bg-hd-white border-r border-gray-200 shadow-2xl flex flex-col">
              <nav className="flex-1 overflow-y-auto py-4">{renderNavLinks(navClass)}</nav>
              <div className="p-4 border-t border-gray-200 shrink-0">
                <button
                  onClick={onSignOut}
                  className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
                >
                  Log Out
                </button>
              </div>
            </aside>
          </>
        )}

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
