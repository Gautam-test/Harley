import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  badgeKey?: 'pendingListings' | 'newBuyerLeads' | 'newGeneralLeads';
}

// Sidebar order matches Figma /Dealer/Halrey dealer_page-0007.jpg.
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/listings/new', label: 'Add Listing' },
  { to: '/listings', label: 'My Listings', end: true, badgeKey: 'pendingListings' },
  { to: '/leads/general', label: 'General Leads', badgeKey: 'newGeneralLeads' },
  { to: '/leads/trade-in', label: 'Seller Enquiries' },
  { to: '/leads/buyer', label: 'Buyer Enquiries', badgeKey: 'newBuyerLeads' },
  { to: '/settings', label: 'Settings' },
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
  const { user, clear } = useAuthStore();

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
  const generalLeadsQuery = useQuery({
    queryKey: ['dealer-leads', 'general', 'sidebar'],
    queryFn: () => api<DealerLeadRow[]>('/dealer/leads/general'),
    enabled,
    staleTime: 60_000,
  });

  const badges = {
    pendingListings: (listingsQuery.data ?? []).filter((l) => l.status === 'DRAFT').length,
    newBuyerLeads: (buyerLeadsQuery.data ?? []).filter((l) => l.status === 'NEW').length,
    newGeneralLeads: (generalLeadsQuery.data ?? []).filter((l) => l.status === 'NEW').length,
  } as const;

  const onSignOut = () => {
    clear();
    navigate('/login');
  };

  const dealerName = user?.name ?? 'Harley-Davidson';

  return (
    <div className="min-h-screen bg-surface-light text-text-on-light flex flex-col">
      <header className="bg-hd-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-6 h-20 flex items-center justify-between gap-6">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            {/* Hand-authored SVG wordmark — dark variant for the white dealer header. */}
            <img
              src="/brand/hd-certified-wordmark.svg"
              alt="H-D Certified™"
              className="h-9 w-auto"
              width={193}
              height={36}
              decoding="async"
            />
            <span className="leading-tight border-l border-gray-200 pl-3">
              <span className="block font-subhead uppercase tracking-subhead text-[10px] text-hd-orange">
                Dealer Portal
              </span>
              <span className="block font-headline tracking-headline text-lg uppercase text-text-on-light group-hover:text-hd-orange transition">
                {dealerName}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-sm">
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
        {/* Sticky sidebar — header is 80px tall, so we offset top-20 (5rem)
            and clamp the height to the remaining viewport. Internal flex
            column lets the nav scroll while Log Out stays pinned at the
            bottom. */}
        <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-hd-white border-r border-gray-200 sticky top-20 self-start h-[calc(100vh-5rem)]">
          <nav className="flex-1 overflow-y-auto py-4">
            {NAV.map((n) => {
              const badge = n.badgeKey ? badges[n.badgeKey] : 0;
              return (
                <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                  <span>{n.label}</span>
                  {badge > 0 ? (
                    <span
                      aria-label={`${badge} new`}
                      className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-hd-orange text-hd-white text-[10px] font-subhead"
                    >
                      {badge}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>
          <div className="p-4 border-t border-gray-200 shrink-0">
            <button
              onClick={onSignOut}
              className="w-full border border-gray-300 px-4 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
            >
              Log Out
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
