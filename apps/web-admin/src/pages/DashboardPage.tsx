import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, IconButton } from '@hd-cpo/ui';
import { api } from '../lib/api';

// ─── Server payloads (subset) ────────────────────────────────────────────

interface Metrics {
  range: { from: string; to: string };
  dealers: { byStatus: Record<string, number> };
  listings: { active: number; total: number };
  leads: {
    tradeIn: number;
    buyerEnquiries: number;
    total: number;
    conversions: number;
    conversionPct: number;
  };
  topDealersByListings: { dealerId: string; name: string; count: number }[];
  topDealersByLeads: { dealerId: string; name: string; count: number }[];
}

interface AdminListingRow {
  id: string;
  vin: string;
  modelName: string;
  year: number;
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  primaryImage: string | null;
  publishedAt: string | null;
  createdAt: string;
  dealerId: string;
  dealerName: string;
}

interface DealerRow {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
}

interface AuditRow {
  id: string;
  createdAt: string;
  actorRole: string;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
}

interface AdminEnquiryRow {
  id: string;
  kind: 'buyer' | 'trade-in';
  name: string;
  status: string;
  bikeModel?: string;
  dealerId: string;
  dealerName: string;
  createdAt: string;
}

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 60;

const TERMINAL_BUYER = new Set(['CLOSED', 'SUCCESS', 'CONVERTED', 'DEAD', 'LOST']);
const SUCCESS_BUYER = new Set(['SUCCESS', 'CONVERTED']);

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ageDays(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

// Friendly humanisation of audit log action codes.
function humanAction(a: string): string {
  return a
    .toLowerCase()
    .split('_')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Page ────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { data: metrics7, isLoading: m7Loading } = useQuery({
    queryKey: ['admin-metrics', '7d'],
    queryFn: () => api<Metrics>(`/admin/metrics?range=7d`),
    refetchOnMount: 'always',
  });
  const { data: metricsPrev, isLoading: mpLoading } = useQuery({
    queryKey: ['admin-metrics-prev-7d'],
    queryFn: () => {
      const to = new Date(Date.now() - 7 * DAY).toISOString();
      const from = new Date(Date.now() - 14 * DAY).toISOString();
      return api<Metrics>(`/admin/metrics?range=custom&from=${from}&to=${to}`);
    },
    refetchOnMount: 'always',
  });
  const { data: metrics30 } = useQuery({
    queryKey: ['admin-metrics', '30d'],
    queryFn: () => api<Metrics>(`/admin/metrics?range=30d`),
    refetchOnMount: 'always',
  });
  const { data: listings, isLoading: lLoading } = useQuery({
    queryKey: ['admin-listings-all-dashboard'],
    queryFn: () => api<AdminListingRow[]>('/admin/listings'),
    refetchOnMount: 'always',
  });
  const { data: dealers, isLoading: dLoading } = useQuery({
    queryKey: ['admin-dealers-all-dashboard'],
    queryFn: () => api<DealerRow[]>('/admin/dealers'),
    refetchOnMount: 'always',
  });
  // BUG-054: Audit module retired from admin scope. The "Recent Admin
  // Actions" dashboard widget that consumed /admin/audit is removed
  // below; this stub keeps the variable bindings (aLoading + audit) in
  // place so the existing `loading` aggregate and conditional renders
  // don't need a wider refactor. Both values are constant and never
  // trigger a network call.
  const audit: AuditRow[] | undefined = undefined;
  const aLoading = false;
  const { data: enquiriesPayload } = useQuery({
    queryKey: ['admin-enquiries-all'],
    queryFn: () =>
      api<{ results: AdminEnquiryRow[]; total: number }>(
        '/admin/leads?kind=all',
      ),
    refetchOnMount: 'always',
  });
  const enquiries = enquiriesPayload?.results;

  const loading = m7Loading || mpLoading || lLoading || dLoading || aLoading;

  const m = useMemo(() => {
    const L = listings ?? [];
    const D = dealers ?? [];
    const E = enquiries ?? [];
    const now = Date.now();
    const month = now - 30 * DAY;

    // KPI 1 — Active dealers + monthly growth.
    const activeDealers = D.filter((d) => d.status === 'ACTIVE');
    const addedThisMonth = D.filter((d) => new Date(d.createdAt).getTime() >= month).length;

    // KPI 2 — Listings pending approval.
    const pending = L.filter((l) => l.status === 'DRAFT');
    const pendingSorted = [...pending].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const oldestPendingDays = pendingSorted[0] ? ageDays(pendingSorted[0].createdAt) : 0;

    // KPI 3 — Network enquiries (7d) + WoW delta.
    const net7 = metrics7?.leads.total ?? 0;
    const netPrev = metricsPrev?.leads.total ?? 0;

    // KPI 4 — Conversion rate.
    const convNow = metrics7?.leads.conversionPct ?? 0;
    const convPrev = metricsPrev?.leads.conversionPct ?? 0;

    // Pending approval queue (top 5 by age).
    const queue = pendingSorted.slice(0, 5);

    // Top dealers by activity this month — combine listings + enquiries.
    const activeListingsByDealer = new Map<string, number>();
    for (const l of L) {
      if (l.status === 'ACTIVE') {
        activeListingsByDealer.set(l.dealerId, (activeListingsByDealer.get(l.dealerId) ?? 0) + 1);
      }
    }
    const enquiriesByDealer = new Map<string, { total: number; success: number; closed: number }>();
    for (const e of E.filter((x) => new Date(x.createdAt).getTime() >= month)) {
      const prev = enquiriesByDealer.get(e.dealerId) ?? { total: 0, success: 0, closed: 0 };
      prev.total += 1;
      if (e.kind === 'buyer') {
        if (TERMINAL_BUYER.has(e.status)) prev.closed += 1;
        if (SUCCESS_BUYER.has(e.status)) prev.success += 1;
      }
      enquiriesByDealer.set(e.dealerId, prev);
    }
    const dealerLookup = new Map(D.map((d) => [d.id, d]));
    const dealerIds = new Set<string>([
      ...activeListingsByDealer.keys(),
      ...enquiriesByDealer.keys(),
    ]);
    const topDealers = [...dealerIds]
      .map((id) => {
        const dealer = dealerLookup.get(id);
        const stats = enquiriesByDealer.get(id) ?? { total: 0, success: 0, closed: 0 };
        return {
          id,
          name: dealer?.name ?? id,
          listings: activeListingsByDealer.get(id) ?? 0,
          enquiries: stats.total,
          conversionPct:
            stats.closed === 0 ? 0 : Math.round((stats.success / stats.closed) * 1000) / 10,
        };
      })
      .sort((a, b) => b.enquiries - a.enquiries)
      .slice(0, 5);

    // Network health — dealers with 0 listings, stale stock, or no recent enquiries.
    const listingsByDealer = new Map<string, AdminListingRow[]>();
    for (const l of L) {
      const arr = listingsByDealer.get(l.dealerId) ?? [];
      arr.push(l);
      listingsByDealer.set(l.dealerId, arr);
    }
    const recentEnquirerIds = new Set(
      E.filter((e) => new Date(e.createdAt).getTime() >= now - 14 * DAY).map((e) => e.dealerId),
    );

    const noListings = activeDealers.filter((d) => {
      const arr = listingsByDealer.get(d.id) ?? [];
      return arr.length === 0;
    });
    const staleStock = activeDealers.filter((d) => {
      const arr = listingsByDealer.get(d.id) ?? [];
      return arr.some(
        (l) => l.status === 'ACTIVE' && l.publishedAt && ageDays(l.publishedAt) >= STALE_DAYS,
      );
    });
    const noEnquiries14d = activeDealers.filter(
      (d) => !recentEnquirerIds.has(d.id) && (listingsByDealer.get(d.id) ?? []).length > 0,
    );

    // System notifications — basic anomaly detection from the data we already have.
    const notifications: { kind: 'warning' | 'danger' | 'info'; text: string }[] = [];
    const suspended = D.filter((d) => d.status === 'SUSPENDED');
    if (suspended.length > 0) {
      notifications.push({
        kind: 'warning',
        text: `${suspended.length} dealer${suspended.length === 1 ? '' : 's'} suspended — review status before they appear in queues again.`,
      });
    }
    if (pending.length > 10) {
      notifications.push({
        kind: 'warning',
        text: `Approval queue has ${pending.length} pending listings — backlog may delay dealer go-live.`,
      });
    }
    if (oldestPendingDays >= 3) {
      notifications.push({
        kind: 'danger',
        text: `Oldest pending listing has been in queue ${oldestPendingDays} days — SLA at risk.`,
      });
    }
    if (noListings.length > 0) {
      notifications.push({
        kind: 'info',
        text: `${noListings.length} active dealer${noListings.length === 1 ? ' has' : 's have'} no inventory live.`,
      });
    }

    return {
      activeDealers,
      addedThisMonth,
      pending,
      oldestPendingDays,
      net7,
      netPrev,
      convNow,
      convPrev,
      queue,
      topDealers,
      noListings,
      staleStock,
      noEnquiries14d,
      notifications,
    };
  }, [listings, dealers, enquiries, metrics7, metricsPrev]);

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header band — orange accent bar + tagline (purely visual). */}
      <div className="relative pl-4 sm:pl-5 mb-8">
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-1 bg-hd-orange"
        />
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
              Network Overview
            </h1>
            <p className="mt-1 text-xs font-subhead uppercase tracking-subhead text-gray-500">
              Marketplace health at a glance
            </p>
          </div>
          <p className="text-xs font-subhead uppercase tracking-subhead text-gray-500">
            Last 7 days · vs prior 7 days
          </p>
        </div>
      </div>

      {/* Row 1 — Network KPIs */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </>
        ) : (
          <>
            <Kpi
              label="Active Dealers"
              value={m.activeDealers.length}
              delta={delta(m.addedThisMonth, 0)}
              caption={`${m.addedThisMonth} added this month`}
              icon={<KpiIcon kind="dealers" />}
              accent="orange"
            />
            <Kpi
              label="Listings Pending Approval"
              value={m.pending.length}
              delta={{ arrow: '–', pct: 0, positive: false }}
              caption={
                m.pending.length === 0
                  ? 'Queue clear'
                  : `Oldest ${m.oldestPendingDays} day${m.oldestPendingDays === 1 ? '' : 's'}`
              }
              captionTone={m.oldestPendingDays >= 3 ? 'warning' : 'neutral'}
              icon={<KpiIcon kind="pending" />}
              accent="warning"
            />
            <Kpi
              label="Network Enquiries (7d)"
              value={m.net7}
              delta={delta(m.net7, m.netPrev)}
              caption={`vs ${m.netPrev} last week`}
              icon={<KpiIcon kind="enquiries" />}
              accent="info"
            />
            <Kpi
              label="Conversion Rate"
              value={`${m.convNow}%`}
              delta={delta(m.convNow, m.convPrev)}
              caption={`${metrics30?.leads.conversions ?? 0} conversions (30d)`}
              icon={<KpiIcon kind="conversion" />}
              accent="success"
            />
          </>
        )}
      </section>

      {/* Row 2 — Pending queue + Top dealers */}
      <section className="mt-8 grid lg:grid-cols-2 gap-4">
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100">
            {/* Match SectionTitle structure inline so the "View all" link sits
                flush with the orange tick + label and shares the divider. */}
            <div className="flex items-center gap-2">
              <span aria-hidden className="w-1 h-3 bg-hd-orange" />
              <h2 className="text-[11px] font-subhead uppercase tracking-subhead text-gray-600">
                Pending Approval Queue
              </h2>
            </div>
            <a
              href={`${import.meta.env.BASE_URL.replace(/\/+$/, '/')}listings?tab=DRAFT`.replace(/\/+/g, '/')}
              className="text-[11px] font-subhead uppercase tracking-subhead text-hd-orange hover:underline"
            >
              View all
            </a>
          </div>
          {loading ? (
            <SkeletonRows n={5} />
          ) : m.queue.length === 0 ? (
            <Empty>Approval queue is empty — nothing waiting on you.</Empty>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {m.queue.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-12 h-12 bg-surface-light border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {l.primaryImage ? (
                      <img src={l.primaryImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">No image</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-headline text-text-on-light truncate">
                      {l.year} {l.modelName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {l.dealerName} · {ageDays(l.createdAt)}d in queue
                    </p>
                  </div>
                  <IconButton label="Review listing" to={`/listings?tab=DRAFT&focus=${l.id}`}>
                    <ChevronIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>Top Dealers by Activity (this month)</SectionTitle>
          {loading ? (
            <SkeletonRows n={5} />
          ) : m.topDealers.length === 0 ? (
            <Empty>No dealer activity yet this month.</Empty>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-subhead uppercase tracking-subhead text-gray-500">
                    <th className="pb-2 font-subhead font-normal">Dealer</th>
                    <th className="pb-2 font-subhead font-normal text-right">Active</th>
                    <th className="pb-2 font-subhead font-normal text-right">Enquiries</th>
                    <th className="pb-2 font-subhead font-normal text-right">Conv%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {m.topDealers.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 text-text-on-light truncate max-w-[180px]">{d.name}</td>
                      <td className="py-2 text-right font-headline text-text-on-light">{d.listings}</td>
                      <td className="py-2 text-right font-headline text-text-on-light">{d.enquiries}</td>
                      <td className="py-2 text-right font-headline text-text-on-light">{d.conversionPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* BUG-054: Recent Admin Actions widget removed — Audit module
          retired from admin scope and the /admin/audit endpoint is
          now 410 Gone. */}

      {/* Row 4 — System Notifications */}
      <section className="mt-8">
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>System Notifications</SectionTitle>
          {loading ? (
            <SkeletonRows n={2} />
          ) : m.notifications.length === 0 ? (
            <Empty>All systems normal. No alerts.</Empty>
          ) : (
            <ul className="mt-4 space-y-2">
              {m.notifications.map((n, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-3 text-sm border-l-4 px-3 py-2 ${
                    n.kind === 'danger'
                      ? 'border-danger bg-danger/5 text-danger'
                      : n.kind === 'warning'
                      ? 'border-warning bg-warning/10 text-text-on-light'
                      : 'border-info bg-info/5 text-text-on-light'
                  }`}
                >
                  <span className="mt-0.5">
                    <AlertIcon />
                  </span>
                  <span className="flex-1">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  // Pure visual: orange tick + subhead label + hairline divider for
  // consistent editorial rhythm across every Card on the page.
  return (
    <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
      <span aria-hidden className="w-1 h-3 bg-hd-orange" />
      <h2 className="text-[11px] font-subhead uppercase tracking-subhead text-gray-600">
        {children}
      </h2>
    </div>
  );
}

interface Delta {
  arrow: '↑' | '↓' | '–';
  pct: number;
  positive: boolean;
}

function delta(current: number, previous: number): Delta {
  if (previous === 0 && current === 0) return { arrow: '–', pct: 0, positive: false };
  if (previous === 0) return { arrow: '↑', pct: 100, positive: true };
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change));
  if (rounded === 0) return { arrow: '–', pct: 0, positive: false };
  return { arrow: change > 0 ? '↑' : '↓', pct: rounded, positive: change > 0 };
}

function DeltaPill({ d }: { d: Delta }) {
  if (d.arrow === '–') {
    return <span className="text-xs font-subhead text-gray-500">–</span>;
  }
  return (
    <span className={`text-xs font-subhead ${d.positive ? 'text-success' : 'text-danger'}`}>
      {d.arrow} {d.pct}%
    </span>
  );
}

type Accent = 'orange' | 'info' | 'success' | 'warning';

const ACCENT_BAR: Record<Accent, string> = {
  orange: 'bg-hd-orange',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
};
const ACCENT_CHIP: Record<Accent, string> = {
  orange: 'bg-hd-orange/10 text-hd-orange',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning',
};

function Kpi({
  label,
  value,
  delta,
  caption,
  captionTone = 'neutral',
  icon,
  accent = 'orange',
}: {
  label: string;
  value: string | number;
  delta: Delta;
  caption: string;
  captionTone?: 'neutral' | 'warning';
  icon?: React.ReactNode;
  accent?: Accent;
}) {
  return (
    <Card className="relative bg-hd-white border-gray-200 p-5 pl-6 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${ACCENT_BAR[accent]}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-subhead uppercase tracking-subhead text-gray-500 leading-tight">
          {label}
        </div>
        {icon && (
          <span
            aria-hidden
            className={`inline-flex items-center justify-center w-8 h-8 ${ACCENT_CHIP[accent]}`}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-4xl font-headline text-text-on-light leading-none">{value}</span>
        <DeltaPill d={delta} />
      </div>
      <p
        className={`mt-2 text-xs ${captionTone === 'warning' ? 'text-warning' : 'text-gray-500'}`}
      >
        {caption}
      </p>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="bg-hd-white border-gray-200 p-5 shadow-sm">
      <div className="h-3 w-24 bg-gray-200 animate-pulse" />
      <div className="h-9 w-20 bg-gray-200 animate-pulse mt-3" />
      <div className="h-3 w-32 bg-gray-200 animate-pulse mt-3" />
    </Card>
  );
}

function KpiIcon({ kind }: { kind: 'dealers' | 'pending' | 'enquiries' | 'conversion' }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    className: 'w-4 h-4',
    'aria-hidden': true,
  } as const;
  if (kind === 'dealers')
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="3" />
        <circle cx="14" cy="8" r="2.4" />
        <path d="M2 17c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round" />
        <path d="M12.5 16c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" strokeLinecap="round" />
      </svg>
    );
  if (kind === 'pending')
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7" />
        <polyline points="10 5 10 10 13 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'enquiries')
    return (
      <svg {...common}>
        <path d="M17 12a2 2 0 0 1-2 2H7l-3 3V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <polyline points="3 14 8 9 12 13 17 6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="13 6 17 6 17 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-6 w-full bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 mt-4">{children}</p>;
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-4 h-4"
      aria-hidden
    >
      <polyline points="7 4 13 10 7 16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="w-4 h-4"
      aria-hidden
    >
      <path d="M10 2L1.5 17h17L10 2z" strokeLinejoin="round" />
      <line x1="10" y1="8" x2="10" y2="12" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
