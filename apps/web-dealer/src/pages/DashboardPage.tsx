import { useQuery } from '@tanstack/react-query';
import { Card } from '@hd-cpo/ui';
import { api } from '../lib/api';

interface DealerListingRow {
  id: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

interface LeadRow {
  id: string;
  status: string;
  createdAt: string;
}

const STALE_DAYS = 60;

// PRD §6.2.2 — dealer dashboard tiles. PRD §6.2.8 — optional 60-day stale flag.
export function DashboardPage() {
  const { data: listings } = useQuery({
    queryKey: ['dealer-listings'],
    queryFn: () => api<DealerListingRow[]>('/dealer/listings'),
  });
  const { data: buyer } = useQuery({
    queryKey: ['dealer-leads-buyer'],
    queryFn: () => api<LeadRow[]>('/dealer/leads/buyer'),
  });
  const { data: tradeIn } = useQuery({
    queryKey: ['dealer-leads-tradein'],
    queryFn: () => api<LeadRow[]>('/dealer/leads/trade-in'),
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const staleThreshold = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

  const newCount = (rows?: LeadRow[]) =>
    rows?.filter((l) => new Date(l.createdAt).getTime() >= sevenDaysAgo).length ?? 0;

  // Listings created in the last 7 days, regardless of status — backs the
  // "New Listings" tile (renamed from "New Leads" per QA). Counts every
  // status so a dealer who immediately publishes still sees their fresh
  // bike in the count.
  const newListingsCount =
    listings?.filter((l) => new Date(l.createdAt).getTime() >= sevenDaysAgo).length ?? 0;

  const stats = {
    active: listings?.filter((l) => l.status === 'ACTIVE').length ?? 0,
    drafts: listings?.filter((l) => l.status === 'DRAFT').length ?? 0,
    sold: listings?.filter((l) => l.status === 'SOLD').length ?? 0,
    total: listings?.length ?? 0,
  };

  const staleListings =
    listings
      ?.filter(
        (l) =>
          l.status === 'ACTIVE' &&
          l.publishedAt &&
          new Date(l.publishedAt).getTime() < staleThreshold,
      )
      .map((l) => l.id) ?? [];

  // Tile labels now drop the "(7d)" suffix per QA — the time-window is
  // implicit from the dashboard's recency framing. "New Listings" replaces
  // the old "New Leads" tile (which was confusingly counting buyer + trade-
  // in leads under a single label that read like a listings metric).
  const tiles = [
    { label: 'Active Listings', value: stats.active },
    { label: 'New Listings', value: newListingsCount },
    { label: 'Trade-In', value: newCount(tradeIn) },
    { label: 'Listing Enquiries', value: newCount(buyer) },
  ];

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="font-headline text-3xl tracking-headline text-text-on-light">Dashboard</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {tiles.map((t) => (
          <Card key={t.label} className="bg-hd-white border-gray-200 p-6">
            <div className="text-xs font-subhead uppercase tracking-subhead text-gray-500">
              {t.label}
            </div>
            <div className="text-3xl font-headline text-text-on-light mt-2">{t.value}</div>
          </Card>
        ))}
      </div>

      <section className="mt-10 grid lg:grid-cols-2 gap-4">
        <Card className="bg-hd-white border-gray-200 p-6">
          <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
            Listings Snapshot
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Active" value={stats.active} />
            <Row label="Drafts" value={stats.drafts} />
            <Row label="Sold (lifetime)" value={stats.sold} />
            <Row label="Total" value={stats.total} />
          </dl>
        </Card>
        <Card
          className={`p-6 border ${staleListings.length > 0 ? 'bg-warning/10 border-warning' : 'bg-hd-white border-gray-200'}`}
        >
          <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
            Stale Listings ({STALE_DAYS}+ days)
          </h2>
          {staleListings.length === 0 ? (
            <p className="text-sm text-gray-600 mt-3">
              Nothing stale. Keep refreshing inventory.
            </p>
          ) : (
            <p className="text-sm text-text-on-light mt-3">
              <strong>{staleListings.length}</strong> listing(s) have been live for over {STALE_DAYS} days.
              Refresh imagery, update price, or mark sold.
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-headline text-text-on-light">{value}</dd>
    </div>
  );
}
