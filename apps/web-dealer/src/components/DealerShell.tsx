import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';

const itemBase =
  'flex items-center gap-3 px-4 py-3 font-subhead uppercase tracking-subhead text-[12px] border-l-4 transition';
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

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', end: true, icon: <DashboardIcon /> },
  { to: '/listings/new', label: 'Add Listing', icon: <AddListingIcon /> },
  { to: '/listings', label: 'My Listings', end: true, badgeKey: 'pendingListings', icon: <ListingsIcon /> },
  { to: '/enquiries', label: 'Enquiries', badgeKey: 'newLeads', icon: <EnquiriesIcon /> },
  { to: '/profile', label: 'Profile', icon: <ProfileIcon /> },
];

const SIDEBAR_KEY = 'hd-cpo:dealer-sidebar-collapsed';

function initials(name?: string | null) {
  if (!name) return 'HD';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'HD';
}

interface DealerListingRow { status: string }
interface DealerLeadRow { status: string }

// Chevron icon for the collapse toggle button
const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function DealerShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Collapsible sidebar — persisted across page reloads via localStorage.
  // Collapsed = icon-only mode (w-16). Expanded = full label+icon (w-60).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });

  const toggleSidebar = () => setSidebarCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

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
  const sellerLeadsQuery = useQuery({
    queryKey: ['dealer-leads', 'trade-in', 'sidebar'],
    queryFn: () => api<DealerLeadRow[]>('/dealer/leads/trade-in'),
    enabled,
    staleTime: 60_000,
  });

  const badges = {
    pendingListings: (listingsQuery.data ?? []).filter((l) => l.status === 'DRAFT').length,
    newLeads:
      (buyerLeadsQuery.data ?? []).filter((l) => l.status === 'NEW').length +
      (sellerLeadsQuery.data ?? []).filter((l) => l.status === 'NEW').length,
  } as const;

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

  const dealerName = user?.name ?? 'Harley-Davidson';

  // Collapsed sidebar: icon only + tooltip via title attr.
  // Expanded sidebar: icon + label + badge.
  const renderNavLinks = (collapsed: boolean) =>
    NAV.map((n) => {
      const badge = n.badgeKey ? badges[n.badgeKey] : 0;
      return (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          title={collapsed ? n.label : undefined}
          className={({ isActive }) =>
            `${itemBase} ${isActive ? itemActive : itemInactive} ${
              collapsed ? 'justify-center px-0' : 'justify-between'
            }`
          }
        >
          <span className={`inline-flex items-center min-w-0 ${collapsed ? '' : 'gap-3'}`}>
            {n.icon}
            {!collapsed && <span className="truncate">{n.label}</span>}
          </span>
          {!collapsed && badge > 0 ? (
            <span
              aria-label={`${badge} new`}
              className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-hd-orange text-hd-black text-[10px] font-subhead"
            >
              {badge}
            </span>
          ) : badge > 0 ? (
            // Collapsed: tiny dot badge so counts remain visible
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-hd-orange" aria-label={`${badge} new`} />
          ) : null}
        </NavLink>
      );
    });

  const sidebarW = sidebarCollapsed ? 'w-16' : 'w-60';

  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      {/* Fixed header — stays on screen when page content scrolls */}
      <header className="bg-hd-white border-b border-gray-200 fixed top-0 left-0 right-0 z-30 h-16">
        <div className="px-4 sm:px-6 h-full flex items-center justify-between gap-3 sm:gap-6">
          {/* Hamburger (mobile only) */}
          <button
            type="button"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center text-text-on-light hover:text-hd-orange transition shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden>
              {drawerOpen ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
              )}
            </svg>
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" aria-label="H-D Certified — Dashboard" className="shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}brand/hd-certified-wordmark.svg`}
                alt="H-D Certified™"
                className="h-8 w-auto"
                // Intrinsic aspect for the new brand-supplied SVG (158×24).
                // Keep height={32} to match h-8 so layout shift is avoided.
                width={211}
                height={32}
                decoding="async"
              />
            </Link>
            <span className="leading-tight border-l border-gray-200 pl-3 hidden sm:block">
              <span className="block font-subhead uppercase tracking-subhead text-[10px] text-hd-orange">
                Dealer Portal
              </span>
              <span className="block font-subhead font-bold tracking-subhead text-base uppercase text-text-on-light truncate">
                {dealerName}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-sm">
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

      {/* Body area — offset by header height (h-16 = 4rem) */}
      <div className="flex flex-1 pt-16">
        {/* Desktop collapsible sidebar — fixed so it stays visible while page scrolls */}
        <aside
          className={`hidden md:flex md:flex-col ${sidebarW} shrink-0 bg-hd-white border-r border-gray-200 fixed top-16 left-0 bottom-0 z-20 transition-[width] duration-200 overflow-hidden`}
        >
          {/* Collapse / expand toggle pinned at top of sidebar */}
          <div className={`flex items-center border-b border-gray-100 h-10 shrink-0 ${sidebarCollapsed ? 'justify-center' : 'justify-end pr-2'}`}>
            <button
              type="button"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="inline-flex h-7 w-7 items-center justify-center text-gray-400 hover:text-hd-orange hover:bg-gray-50 transition"
            >
              {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2 relative">
            {renderNavLinks(sidebarCollapsed)}
          </nav>

          {!sidebarCollapsed && (
            <div className="p-4 border-t border-gray-200 shrink-0">
              <button
                onClick={onSignOut}
                className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
              >
                Log Out
              </button>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="p-2 border-t border-gray-200 shrink-0 flex justify-center">
              <button
                onClick={onSignOut}
                title="Log Out"
                aria-label="Log Out"
                className="inline-flex h-9 w-9 items-center justify-center text-gray-500 hover:text-danger hover:bg-gray-50 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          )}
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu backdrop"
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 top-16 z-30 bg-hd-black/50 md:hidden"
            />
            <aside className="md:hidden fixed top-16 left-0 z-40 w-72 max-w-[85vw] h-[calc(100vh-4rem)] bg-hd-white border-r border-gray-200 shadow-2xl flex flex-col">
              <nav className="flex-1 overflow-y-auto py-4">{renderNavLinks(false)}</nav>
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

        {/* Main content — offset by sidebar width on desktop */}
        <main className={`flex-1 min-w-0 transition-[margin] duration-200 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
