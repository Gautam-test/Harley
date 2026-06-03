import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, IconButton } from '@hd-cpo/ui';
import { api } from '../lib/api';

// ─── Types (subset of fields actually used; the API returns more) ────────
interface DealerListingRow {
  id: string;
  vin: string;
  slug: string;
  modelName: string;
  year: number;
  status: string;
  certificationStatus: 'CPO' | 'AS_IS';
  primaryImage: string | null;
  publishedAt: string | null;
  createdAt: string;
  adminFeedback: string | null;
}

interface LeadRow {
  id: string;
  name: string;
  status: string;
  bikeModel?: string;
  listingId?: string;
  createdAt: string;
}

const STALE_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

// Pipeline stages — orange-progressive shades.
const BUYER_STAGES: { code: string; label: string; shade: string }[] = [
  { code: 'NEW', label: 'New', shade: 'bg-hd-orange/30' },
  { code: 'CONTACTED', label: 'Contacted', shade: 'bg-hd-orange/50' },
  { code: 'ON_SITE_VISIT', label: 'Site Visit', shade: 'bg-hd-orange/70' },
  { code: 'LOAN_APPROVAL', label: 'Loan Approval', shade: 'bg-hd-orange/85' },
  { code: 'CLOSED', label: 'Booking Closed', shade: 'bg-hd-orange' },
  { code: 'SUCCESS', label: 'Delivered', shade: 'bg-success' },
];

const OPEN_BUYER_STATUSES = new Set(['NEW', 'CONTACTED', 'ON_SITE_VISIT', 'LOAN_APPROVAL']);
const OPEN_SELLER_STATUSES = new Set(['NEW', 'IN_TOUCH', 'INSPECTION', 'OFFER_MADE']);
const CLOSED_BUYER = new Set(['CLOSED', 'SUCCESS', 'CONVERTED', 'DEAD', 'LOST']);

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

// ─── Page ────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { data: listings, isLoading: lLoading } = useQuery({
    queryKey: ['dealer-listings', 'all'],
    queryFn: () => api<DealerListingRow[]>('/dealer/listings'),
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const { data: buyer, isLoading: bLoading } = useQuery({
    queryKey: ['leads', 'buyer'],
    queryFn: () => api<LeadRow[]>('/dealer/leads/buyer'),
    refetchOnMount: 'always',
    staleTime: 0,
  });
  const { data: seller, isLoading: sLoading } = useQuery({
    queryKey: ['leads', 'trade-in'],
    queryFn: () => api<LeadRow[]>('/dealer/leads/trade-in'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const loading = lLoading || bLoading || sLoading;

  // ─── Aggregations ────────────────────────────────────────────────────
  const m = useMemo(() => {
    const L = listings ?? [];
    const B = buyer ?? [];
    const S = seller ?? [];
    const now = Date.now();
    const wk = now - 7 * DAY;
    const prevWk = now - 14 * DAY;
    const month = now - 30 * DAY;
    const day = now - 1 * DAY;
    const twoDay = now - 2 * DAY;

    const active = L.filter((l) => l.status === 'ACTIVE');
    const draftsReturned = L.filter((l) => l.status === 'DRAFT' && l.adminFeedback);
    const sold = L.filter((l) => l.status === 'SOLD');
    const newThisWeek = L.filter((l) => new Date(l.createdAt).getTime() >= wk);
    const newPrevWeek = L.filter(
      (l) => new Date(l.createdAt).getTime() >= prevWk && new Date(l.createdAt).getTime() < wk,
    );

    const openLeads = [
      ...B.filter((l) => OPEN_BUYER_STATUSES.has(l.status)),
      ...S.filter((l) => OPEN_SELLER_STATUSES.has(l.status)),
    ];
    const openLeadsLastWk = [
      ...B.filter(
        (l) =>
          OPEN_BUYER_STATUSES.has(l.status) &&
          new Date(l.createdAt).getTime() >= wk,
      ),
      ...S.filter(
        (l) =>
          OPEN_SELLER_STATUSES.has(l.status) &&
          new Date(l.createdAt).getTime() >= wk,
      ),
    ];
    const openLeadsPrevWk = [
      ...B.filter(
        (l) =>
          OPEN_BUYER_STATUSES.has(l.status) &&
          new Date(l.createdAt).getTime() >= prevWk &&
          new Date(l.createdAt).getTime() < wk,
      ),
      ...S.filter(
        (l) =>
          OPEN_SELLER_STATUSES.has(l.status) &&
          new Date(l.createdAt).getTime() >= prevWk &&
          new Date(l.createdAt).getTime() < wk,
      ),
    ];
    const awaiting24 = openLeads.filter(
      (l) => l.status === 'NEW' && new Date(l.createdAt).getTime() < day,
    );
    const unanswered48 = openLeads.filter(
      (l) => l.status === 'NEW' && new Date(l.createdAt).getTime() < twoDay,
    );

    const closedBuyer = B.filter((l) => CLOSED_BUYER.has(l.status));
    const success = B.filter((l) => l.status === 'SUCCESS' || l.status === 'CONVERTED');
    const conversionPct =
      closedBuyer.length === 0 ? 0 : Math.round((success.length / closedBuyer.length) * 1000) / 10;

    // Previous-week conversion baseline = leads closed in the previous 7d window.
    const closedPrevWk = B.filter(
      (l) =>
        CLOSED_BUYER.has(l.status) &&
        new Date(l.createdAt).getTime() >= prevWk &&
        new Date(l.createdAt).getTime() < wk,
    );
    const successPrevWk = closedPrevWk.filter(
      (l) => l.status === 'SUCCESS' || l.status === 'CONVERTED',
    );
    const conversionPrevPct =
      closedPrevWk.length === 0
        ? 0
        : Math.round((successPrevWk.length / closedPrevWk.length) * 1000) / 10;

    const deliveredThisMonth = success.filter(
      (l) => new Date(l.createdAt).getTime() >= month,
    ).length;

    // Stock health — average age of ACTIVE listings (publishedAt-based).
    const ages = active
      .map((l) => (l.publishedAt ? ageDays(l.publishedAt) : null))
      .filter((v): v is number => v !== null);
    const avgAge = ages.length === 0 ? 0 : Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
    const stale = active.filter(
      (l) => l.publishedAt && ageDays(l.publishedAt) >= STALE_DAYS,
    );
    const staleAvgPrev = avgAge; // no historical snapshot — fall back to neutral delta

    // Pipeline funnel counts.
    const funnel = BUYER_STAGES.map((s) => ({
      ...s,
      count: B.filter((l) => l.status === s.code).length,
    }));
    const deadCount = B.filter((l) => l.status === 'DEAD' || l.status === 'LOST').length;

    // Top 5 bikes by enquiry count this month (buyer enquiries with a listingId).
    const monthlyB = B.filter((l) => new Date(l.createdAt).getTime() >= month);
    const byListing = new Map<string, { count: number; bikeModel?: string; listingId: string }>();
    for (const l of monthlyB) {
      if (!l.listingId) continue;
      const prev = byListing.get(l.listingId);
      byListing.set(l.listingId, {
        count: (prev?.count ?? 0) + 1,
        bikeModel: l.bikeModel ?? prev?.bikeModel,
        listingId: l.listingId,
      });
    }
    const listingLookup = new Map(L.map((l) => [l.id, l]));
    const topBikes = [...byListing.values()]
      .map((b) => {
        const li = listingLookup.get(b.listingId);
        return {
          listingId: b.listingId,
          count: b.count,
          label: b.bikeModel ?? (li ? `${li.year} ${li.modelName}` : 'Listing'),
          image: li?.primaryImage ?? null,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Stock mix (lifetime).
    const cpoActive = active.filter((l) => l.certificationStatus === 'CPO').length;
    const asisActive = active.filter((l) => l.certificationStatus === 'AS_IS').length;
    const soldCount = sold.length;
    const mixTotal = cpoActive + asisActive + soldCount || 1;

    // Activity feed — merge enquiries + listing changes, sort desc, take 10.
    const feed: {
      id: string;
      icon: 'enquiry' | 'seller' | 'listing-new' | 'listing-returned';
      text: string;
      at: string;
    }[] = [];
    for (const l of B) {
      feed.push({
        id: `b-${l.id}`,
        icon: 'enquiry',
        text: `Buyer enquiry from ${l.name || 'unknown'} — ${l.bikeModel ?? 'listing'}`,
        at: l.createdAt,
      });
    }
    for (const l of S) {
      feed.push({
        id: `s-${l.id}`,
        icon: 'seller',
        text: `Trade-in enquiry from ${l.name || 'unknown'}${l.bikeModel ? ` — ${l.bikeModel}` : ''}`,
        at: l.createdAt,
      });
    }
    for (const li of L) {
      feed.push({
        id: `l-${li.id}`,
        icon: li.adminFeedback && li.status === 'DRAFT' ? 'listing-returned' : 'listing-new',
        text:
          li.status === 'ACTIVE'
            ? `Listing published — ${li.year} ${li.modelName}`
            : li.status === 'DRAFT' && li.adminFeedback
            ? `Draft returned by admin — ${li.year} ${li.modelName}`
            : `Listing created — ${li.year} ${li.modelName}`,
        at: li.status === 'ACTIVE' && li.publishedAt ? li.publishedAt : li.createdAt,
      });
    }
    feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      active,
      newThisWeek,
      newPrevWeek,
      draftsReturned,
      openLeads,
      openLeadsLastWk,
      openLeadsPrevWk,
      awaiting24,
      unanswered48,
      conversionPct,
      conversionPrevPct,
      deliveredThisMonth,
      avgAge,
      staleAvgPrev,
      stale,
      funnel,
      deadCount,
      topBikes,
      mix: { cpo: cpoActive, asis: asisActive, sold: soldCount, total: mixTotal },
      feed: feed.slice(0, 10),
    };
  }, [listings, buyer, seller]);

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header band — orange accent bar + tagline.
          Pure visual: same h1 text, same date label. */}
      <div className="relative pl-4 sm:pl-5">
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-1 bg-hd-orange"
        />
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
              Dashboard
            </h1>
            <p className="mt-1 text-xs font-subhead uppercase tracking-subhead text-gray-500">
              Your store at a glance
            </p>
          </div>
          <p className="text-xs font-subhead uppercase tracking-subhead text-gray-500">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Row 1 — Headline KPIs */}
      <section className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </>
        ) : (
          <>
            <Kpi
              label="Active Listings"
              value={m.active.length}
              delta={delta(m.newThisWeek.length, m.newPrevWeek.length)}
              caption={`${m.newThisWeek.length} newly listed this week`}
              icon={<KpiIcon kind="listings" />}
              accent="orange"
            />
            <Kpi
              label="Open Enquiries"
              value={m.openLeads.length}
              delta={delta(m.openLeadsLastWk.length, m.openLeadsPrevWk.length)}
              caption={`${m.awaiting24.length} awaiting response >24h`}
              captionTone={m.awaiting24.length > 0 ? 'warning' : 'neutral'}
              icon={<KpiIcon kind="enquiries" />}
              accent="info"
            />
            <Kpi
              label="Conversion Rate"
              value={`${m.conversionPct}%`}
              delta={delta(m.conversionPct, m.conversionPrevPct)}
              caption={`${m.deliveredThisMonth} delivered this month`}
              icon={<KpiIcon kind="conversion" />}
              accent="success"
            />
            <Kpi
              label="Stock Health"
              value={`${m.avgAge}d`}
              delta={delta(m.staleAvgPrev, m.avgAge)} /* lower-is-better */
              caption={`${m.stale.length} stale (${STALE_DAYS}+ days)`}
              captionTone={m.stale.length > 0 ? 'warning' : 'neutral'}
              icon={<KpiIcon kind="stock" />}
              accent="warning"
            />
          </>
        )}
      </section>

      {/* Row 2 — Pipeline + Top Bikes */}
      <section className="mt-8 grid lg:grid-cols-2 gap-4">
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>Buyer Pipeline Funnel</SectionTitle>
          {loading ? (
            <SkeletonRows n={6} />
          ) : (
            <div className="mt-4 space-y-2">
              {m.funnel.every((f) => f.count === 0) && m.deadCount === 0 ? (
                <Empty>No buyer leads in the pipeline yet.</Empty>
              ) : (
                <>
                  {(() => {
                    const max = Math.max(1, ...m.funnel.map((f) => f.count), m.deadCount);
                    return (
                      <>
                        {m.funnel.map((f) => (
                          <FunnelRow
                            key={f.code}
                            label={f.label}
                            count={f.count}
                            pct={(f.count / max) * 100}
                            barClass={f.shade}
                          />
                        ))}
                        <FunnelRow
                          label="Not Interested"
                          count={m.deadCount}
                          pct={(m.deadCount / max) * 100}
                          barClass="bg-danger/70"
                        />
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </Card>
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>Top 5 Bikes by Enquiries (this month)</SectionTitle>
          {loading ? (
            <SkeletonRows n={5} />
          ) : m.topBikes.length === 0 ? (
            <Empty>No enquiries logged this month yet.</Empty>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {m.topBikes.map((b) => (
                <li key={b.listingId} className="flex items-center gap-3 py-2.5">
                  <div className="w-12 h-12 bg-surface-light border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {b.image ? (
                      <img src={b.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400">No image</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-headline text-text-on-light truncate">{b.label}</p>
                    <p className="text-xs text-gray-500">{b.count} enquir{b.count === 1 ? 'y' : 'ies'}</p>
                  </div>
                  <IconButton label="View listing" to={`/listings/${b.listingId}/edit`}>
                    <ChevronIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Row 3 — Activity feed + stock mix */}
      <section className="mt-8 grid lg:grid-cols-2 gap-4">
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>Recent Activity</SectionTitle>
          {loading ? (
            <SkeletonRows n={6} />
          ) : m.feed.length === 0 ? (
            <Empty>Nothing has happened yet. Activity will appear here.</Empty>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {m.feed.map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-0.5 w-5 h-5 inline-flex items-center justify-center shrink-0 ${
                      e.icon === 'enquiry'
                        ? 'text-info'
                        : e.icon === 'seller'
                        ? 'text-hd-orange'
                        : e.icon === 'listing-returned'
                        ? 'text-danger'
                        : 'text-success'
                    }`}
                  >
                    <FeedIcon kind={e.icon} />
                  </span>
                  <span className="flex-1 text-text-on-light leading-snug">{e.text}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{relativeTime(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>Stock Mix</SectionTitle>
          {loading ? (
            <SkeletonRows n={3} />
          ) : m.mix.total === 0 ? (
            <Empty>No stock data yet. Add a listing to get started.</Empty>
          ) : (
            <>
              <div className="mt-5 flex h-3 w-full overflow-hidden border border-gray-200">
                <div
                  className="bg-hd-orange"
                  style={{ width: `${(m.mix.cpo / m.mix.total) * 100}%` }}
                />
                <div
                  className="bg-gray-400"
                  style={{ width: `${(m.mix.asis / m.mix.total) * 100}%` }}
                />
                <div
                  className="bg-success/70"
                  style={{ width: `${(m.mix.sold / m.mix.total) * 100}%` }}
                />
              </div>
              <dl className="mt-5 space-y-2 text-sm">
                <LegendRow swatch="bg-hd-orange" label="CPO (active)" value={m.mix.cpo} />
                <LegendRow swatch="bg-gray-400" label="As-Is (active)" value={m.mix.asis} />
                <LegendRow swatch="bg-success/70" label="Sold (lifetime)" value={m.mix.sold} />
              </dl>
            </>
          )}
        </Card>
      </section>

      {/* Row 4 — Pending action items */}
      <section className="mt-8">
        <Card className="bg-hd-white border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <SectionTitle>Needs Your Attention</SectionTitle>
          {loading ? (
            <SkeletonRows n={3} />
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {m.draftsReturned.length === 0 &&
              m.unanswered48.length === 0 &&
              m.stale.length === 0 ? (
                <Empty>All clear. Nothing needs your attention right now.</Empty>
              ) : (
                <>
                  {m.draftsReturned.map((d) => (
                    <ActionRow
                      key={`d-${d.id}`}
                      text={`Draft returned by admin — ${d.year} ${d.modelName}`}
                      to={`/listings/${d.id}/edit`}
                    />
                  ))}
                  {m.unanswered48.length > 0 && (
                    <ActionRow
                      text={`${m.unanswered48.length} enquir${m.unanswered48.length === 1 ? 'y' : 'ies'} unanswered for over 48 hours`}
                      to="/enquiries"
                    />
                  )}
                  {m.stale.map((s) => (
                    <ActionRow
                      key={`s-${s.id}`}
                      text={`Stale listing (${ageDays(s.publishedAt)}d live) — ${s.year} ${s.modelName}`}
                      to={`/listings/${s.id}/edit`}
                    />
                  ))}
                </>
              )}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

// ─── Building blocks ─────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  // Pure visual: a 2px orange tick + uppercase subhead label + hairline
  // divider keeps every Card's header consistent and gives the dashboard
  // a stronger editorial rhythm than the plain caption alone.
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
    <span
      className={`text-xs font-subhead ${d.positive ? 'text-success' : 'text-danger'}`}
    >
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
      {/* Left accent stripe — purely decorative; colour-codes the metric's
          tone at a glance (orange=stock, blue=enquiries, green=conv, amber=health) */}
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

function KpiIcon({ kind }: { kind: 'listings' | 'enquiries' | 'conversion' | 'stock' }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    className: 'w-4 h-4',
    'aria-hidden': true,
  } as const;
  if (kind === 'listings')
    return (
      <svg {...common}>
        <rect x="3" y="3" width="6" height="6" />
        <rect x="11" y="3" width="6" height="6" />
        <rect x="3" y="11" width="6" height="6" />
        <rect x="11" y="11" width="6" height="6" />
      </svg>
    );
  if (kind === 'enquiries')
    return (
      <svg {...common}>
        <path d="M17 12a2 2 0 0 1-2 2H7l-3 3V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'conversion')
    return (
      <svg {...common}>
        <polyline points="3 14 8 9 12 13 17 6" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="13 6 17 6 17 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="7" />
      <polyline points="10 5 10 10 13 12" strokeLinecap="round" strokeLinejoin="round" />
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

function FunnelRow({
  label,
  count,
  pct,
  barClass,
}: {
  label: string;
  count: number;
  pct: number;
  barClass: string;
}) {
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="font-headline text-text-on-light">{count}</span>
      </div>
      <div className="h-2 w-full bg-gray-100">
        <div
          className={`h-full ${barClass} transition-all`}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function LegendRow({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-gray-700">
        <span className={`inline-block w-3 h-3 ${swatch}`} />
        {label}
      </span>
      <span className="font-headline text-text-on-light">{value}</span>
    </div>
  );
}

function ActionRow({ text, to }: { text: string; to: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-2 h-2 bg-hd-orange shrink-0 rounded-full" />
      <span className="flex-1 text-sm text-text-on-light">{text}</span>
      <IconButton label="Open" to={to}>
        <ChevronIcon />
      </IconButton>
    </li>
  );
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

function FeedIcon({ kind }: { kind: 'enquiry' | 'seller' | 'listing-new' | 'listing-returned' }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    className: 'w-4 h-4',
    'aria-hidden': true,
  } as const;
  if (kind === 'enquiry')
    return (
      <svg {...common}>
        <path d="M17 12a2 2 0 0 1-2 2H7l-3 3V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'seller')
    return (
      <svg {...common}>
        <path d="M3 13l5-9 5 7 4-3v9H3z" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'listing-returned')
    return (
      <svg {...common}>
        <path d="M4 10h12M8 6l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
