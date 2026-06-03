import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

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

const SIDEBAR_KEY = 'hd-cpo:admin-sidebar-collapsed';

function initials(name?: string | null) {
  if (!name) return 'AD';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'AD';
}

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

export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clear } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });

  const toggleSidebar = () => setSidebarCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

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

  const renderNavLinks = (collapsed: boolean) =>
    NAV.map((n) => (
      <NavLink
        key={n.to}
        to={n.to}
        end={n.end}
        title={collapsed ? n.label : undefined}
        className={({ isActive }) =>
          `${itemBase} ${isActive ? itemActive : itemInactive} ${
            collapsed ? 'justify-center px-0' : ''
          }`
        }
      >
        <span className={`inline-flex items-center min-w-0 ${collapsed ? '' : 'gap-3'}`}>
          {n.icon}
          {!collapsed && <span className="truncate">{n.label}</span>}
        </span>
      </NavLink>
    ));

  const sidebarW = sidebarCollapsed ? 'w-16' : 'w-60';

  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      {/* Fixed header */}
      <header className="bg-hd-white border-b border-gray-200 fixed top-0 left-0 right-0 z-30 h-16">
        <div className="px-4 sm:px-6 h-full flex items-center justify-between gap-3 sm:gap-6">
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
            <Link to="/dashboard" aria-label="H-D Certified — Admin Dashboard" className="shrink-0">
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
                Admin Portal
              </span>
              <span className="block font-subhead font-bold tracking-subhead text-base uppercase text-text-on-light truncate">
                Network Oversight
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-sm">
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

      <div className="flex flex-1 pt-16">
        {/* Desktop collapsible fixed sidebar */}
        <aside
          className={`hidden md:flex md:flex-col ${sidebarW} shrink-0 bg-hd-white border-r border-gray-200 fixed top-16 left-0 bottom-0 z-20 transition-[width] duration-200 overflow-hidden`}
        >
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

          <nav className="flex-1 overflow-y-auto py-2">
            {renderNavLinks(sidebarCollapsed)}
          </nav>

          {!sidebarCollapsed && (
            <div className="p-4 border-t border-gray-200 shrink-0">
              <button
                onClick={onSignOut}
                className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
              >
                Sign Out
              </button>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="p-2 border-t border-gray-200 shrink-0 flex justify-center">
              <button
                onClick={onSignOut}
                title="Sign Out"
                aria-label="Sign Out"
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
                  Sign Out
                </button>
              </div>
            </aside>
          </>
        )}

        <main className={`flex-1 min-w-0 transition-[margin] duration-200 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
