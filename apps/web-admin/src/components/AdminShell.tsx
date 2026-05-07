import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@hd-cpo/ui';
import { useAuthStore } from '../store/auth';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `font-subhead uppercase tracking-subhead text-sm transition ${
    isActive ? 'text-hd-orange' : 'text-text-primary hover:text-hd-orange'
  }`;

const drawerLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `block px-6 py-4 font-subhead uppercase tracking-subhead text-base border-l-4 transition ${
    isActive
      ? 'text-hd-orange border-hd-orange bg-hd-orange/10'
      : 'text-text-primary border-transparent hover:text-hd-orange hover:bg-surface-2/40'
  }`;

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/dealers', label: 'Dealers' },
  { to: '/listings', label: 'Listings' },
  { to: '/enquiries', label: 'Enquiries' },
  { to: '/content', label: 'Content' },
  { to: '/audit', label: 'Audit' },
  { to: '/profile', label: 'Profile' },
] as const;

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

  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      <header className="bg-hd-black text-hd-white border-b border-surface-2 sticky top-0 z-30">
        <div className="max-w-container mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-3 group min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}brand/hd-certified-wordmark-light.svg`}
              alt="H-D Certified™"
              className="h-7 w-auto shrink-0"
              width={150}
              height={28}
              decoding="async"
            />
            <span className="font-headline text-xl tracking-headline border-l border-surface-2 pl-3 hidden sm:inline">
              <span className="text-hd-orange">ADMIN</span>
            </span>
          </Link>

          {/* Desktop nav — collapses to hamburger below md. */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClasses}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-text-secondary hidden sm:inline">{user?.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              className="hidden sm:inline-flex"
            >
              Sign Out
            </Button>
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
        </div>
      </header>

      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 top-16 z-30 bg-hd-black/60 md:hidden"
          />
          <nav className="md:hidden fixed inset-x-0 top-16 z-40 bg-hd-black border-b border-surface-2 py-2 shadow-2xl">
            {NAV_LINKS.map((n) => (
              <NavLink key={n.to} to={n.to} className={drawerLinkClasses}>
                {n.label}
              </NavLink>
            ))}
            <div className="px-6 py-4 border-t border-surface-2 mt-2">
              <Button variant="ghost" size="sm" onClick={onSignOut} className="w-full">
                Sign Out
              </Button>
            </div>
          </nav>
        </>
      )}

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
