import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

// Mirrors the dealer-portal sidebar layout (apps/web-dealer/src/components/
// DealerShell.tsx) per QA #6: admin nav was previously a horizontal header
// menu, which gave inconsistent IA across the two operator portals. The
// shells now share the same skeleton — slim white header + left sticky
// sidebar + outlet content area — so a dealer principal who also wears the
// admin hat doesn't have to re-learn the navigation.

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
const DealersIcon = () => (
  <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
);
const ListingsIcon = () => (
  <svg {...iconProps}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
);
const EnquiriesIcon = () => (
  <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);
const ContentIcon = () => (
  <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>
);
const AuditIcon = () => (
  <svg {...iconProps}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
);
const ProfileIcon = () => (
  <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
);

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', end: true, icon: <DashboardIcon /> },
  { to: '/dealers', label: 'Dealers', icon: <DealersIcon /> },
  { to: '/listings', label: 'Listings', icon: <ListingsIcon /> },
  { to: '/enquiries', label: 'Enquiries', icon: <EnquiriesIcon /> },
  { to: '/content', label: 'Content', icon: <ContentIcon /> },
  { to: '/audit', label: 'Audit', icon: <AuditIcon /> },
  { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
];

function initials(name?: string | null) {
  if (!name) return 'AD';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'AD';
}

export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onSignOut = () => {
    clear();
    navigate('/login');
  };

  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setDrawerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawerOpen]);

  const adminName = user?.name ?? 'H-D Admin';

  // Single source of truth for the nav list — used by the desktop sidebar
  // AND the mobile slide-over so labels never drift between the two.
  const renderNavLinks = () =>
    NAV.map((n) => (
      <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
        {/* QA latest: icon to the LEFT of the label. */}
        <span className="inline-flex items-center gap-3 min-w-0">
          {n.icon}
          <span className="truncate">{n.label}</span>
        </span>
      </NavLink>
    ));

  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      <header className="bg-hd-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-4 sm:px-6 h-20 flex items-center justify-between gap-3 sm:gap-6">
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
            <Link to="/dashboard" aria-label="H-D Certified — Admin Dashboard" className="shrink-0">
              <img
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
                Admin Portal
              </span>
              <span className="block font-subhead font-bold tracking-subhead text-lg uppercase text-text-on-light truncate">
                Network Oversight
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-sm">
              {initials(user?.name)}
            </span>
            <span className="leading-tight text-right hidden sm:block">
              <span className="block font-subhead uppercase tracking-subhead text-xs text-text-on-light">
                {adminName}
              </span>
              <span className="block text-[11px] text-gray-500">Administrator</span>
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sticky sidebar — header is 80px tall, so we offset top-20
            (5rem) and clamp the height to the remaining viewport. Internal
            flex column lets the nav scroll while Sign Out stays pinned at
            the bottom. */}
        <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-hd-white border-r border-gray-200 sticky top-20 self-start h-[calc(100vh-5rem)]">
          <nav className="flex-1 overflow-y-auto py-4">{renderNavLinks()}</nav>
          <div className="p-4 border-t border-gray-200 shrink-0">
            <button
              onClick={onSignOut}
              className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
            >
              Sign Out
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
              <nav className="flex-1 overflow-y-auto py-4">{renderNavLinks()}</nav>
              <div className="p-4 border-t border-gray-200 shrink-0">
                <button
                  onClick={onSignOut}
                  className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
                >
                  Sign Out
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
