import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@hd-cpo/ui';
import { useAuthStore } from '../store/auth';

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `font-subhead uppercase tracking-subhead text-sm transition ${
    isActive ? 'text-hd-orange' : 'text-text-primary hover:text-hd-orange'
  }`;

export function AdminShell() {
  const navigate = useNavigate();
  const { user, clear } = useAuthStore();
  const onSignOut = () => {
    clear();
    navigate('/login');
  };
  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      <header className="bg-hd-black text-hd-white border-b border-surface-2 sticky top-0 z-30">
        <div className="max-w-container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            {/* Hand-authored SVG wordmark — light variant for the dark admin header. */}
            <img
              src="/brand/hd-certified-wordmark-light.svg"
              alt="H-D Certified™"
              className="h-7 w-auto"
              width={150}
              height={28}
              decoding="async"
            />
            <span className="font-headline text-xl tracking-headline border-l border-surface-2 pl-3 hidden sm:inline">
              <span className="text-hd-orange">ADMIN</span>
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <NavLink to="/dashboard" className={linkClasses}>Dashboard</NavLink>
            <NavLink to="/dealers" className={linkClasses}>Dealers</NavLink>
            <NavLink to="/listings" className={linkClasses}>Listings</NavLink>
            <NavLink to="/enquiries" className={linkClasses}>Enquiries</NavLink>
            <NavLink to="/content" className={linkClasses}>Content</NavLink>
            <NavLink to="/audit" className={linkClasses}>Audit</NavLink>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-text-secondary">{user?.name}</span>
            <Button variant="ghost" size="sm" onClick={onSignOut}>Sign Out</Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
