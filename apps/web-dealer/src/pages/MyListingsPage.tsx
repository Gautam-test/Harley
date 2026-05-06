import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from '@hd-cpo/ui';
import { api } from '../lib/api';

interface DealerListingRow {
  id: string;
  vin: string;
  slug: string;
  modelName: string;
  year: number;
  price: number;
  kmsDriven: number;
  certificationStatus: 'CPO' | 'AS_IS';
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  primaryImage: string | null;
  adminFeedback: string | null;
  publishedAt: string | null;
  createdAt: string;
}

// Figma /Dealer/Halrey dealer_page-0003.jpg uses dealer-friendly labels for the
// listing state machine. The DB enum stays unchanged; only the UI relabels.
type TabId = 'ALL' | 'DRAFT' | 'ACTIVE' | 'DEACTIVATED' | 'SOLD' | 'REMOVED';
const TABS: { id: TabId; label: string; statusFilter: DealerListingRow['status'] | '' }[] = [
  { id: 'ALL', label: 'All', statusFilter: '' },
  { id: 'DRAFT', label: 'Pending', statusFilter: 'DRAFT' },
  { id: 'ACTIVE', label: 'Live', statusFilter: 'ACTIVE' },
  { id: 'DEACTIVATED', label: 'Off', statusFilter: 'DEACTIVATED' },
  { id: 'SOLD', label: 'Sold', statusFilter: 'SOLD' },
  { id: 'REMOVED', label: 'Removed', statusFilter: 'REMOVED' },
];

const STATUS_TO_LABEL: Record<DealerListingRow['status'], string> = {
  DRAFT: 'Pending Approval',
  ACTIVE: 'Live',
  DEACTIVATED: 'Off',
  SOLD: 'Sold',
  REMOVED: 'Removed',
};

export function MyListingsPage() {
  const [tab, setTab] = useState<TabId>('ALL');
  const qc = useQueryClient();

  // Always fetch the full set so we can compute per-tab counts; the table
  // itself filters client-side. With dealer inventories typically <50 listings
  // this is fine and keeps the badges always-fresh without an extra round-trip.
  const { data: all, isLoading } = useQuery({
    queryKey: ['dealer-listings', 'all'],
    queryFn: () => api<DealerListingRow[]>('/dealer/listings'),
  });

  const counts = (all ?? []).reduce<Record<DealerListingRow['status'], number>>(
    (acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    },
    { DRAFT: 0, ACTIVE: 0, SOLD: 0, REMOVED: 0, DEACTIVATED: 0 },
  );

  const filtered = (all ?? []).filter((l) => {
    const wanted = TABS.find((t) => t.id === tab)?.statusFilter;
    return wanted ? l.status === wanted : true;
  });

  const markSold = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}/mark-sold`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });
  const turnOff = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}/turn-off`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });
  const turnOn = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}/turn-on`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });

  const returnedDrafts = (all ?? []).filter((l) => l.status === 'DRAFT' && l.adminFeedback);

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
          My <span className="text-hd-orange">Listings</span>
        </h1>
        <Link to="/listings/new">
          <Button>+ Add Listing</Button>
        </Link>
      </div>

      {/* Admin feedback banner — surfaces drafts the admin returned for fixes */}
      {returnedDrafts.length > 0 && (
        <div className="mb-6 bg-danger/10 border border-danger/40 rounded-card p-4 space-y-3">
          <p className="font-subhead uppercase tracking-subhead text-sm text-danger">
            {returnedDrafts.length} listing{returnedDrafts.length === 1 ? '' : 's'} need
            {returnedDrafts.length === 1 ? 's' : ''} your attention
          </p>
          {returnedDrafts.map((l) => (
            <div key={l.id} className="text-sm bg-hd-white border border-danger/30 rounded p-3">
              <p className="font-subhead text-text-on-light">
                {l.year} {l.modelName} ·{' '}
                <span className="font-mono text-xs text-gray-600">{l.vin}</span>
              </p>
              <p className="text-gray-700 mt-1">
                <span className="font-subhead uppercase tracking-subhead text-[11px] text-danger">
                  Admin feedback:
                </span>{' '}
                {l.adminFeedback}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar — Figma terminology with badge counts */}
      <nav className="flex items-end gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => {
          const count =
            t.id === 'ALL'
              ? (all ?? []).length
              : counts[t.statusFilter as DealerListingRow['status']] ?? 0;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-subhead uppercase tracking-subhead border-b-2 -mb-px transition flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'border-hd-orange text-text-on-light'
                  : 'border-transparent text-gray-500 hover:text-text-on-light'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={`text-[10px] font-subhead px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                    isActive ? 'bg-hd-orange text-hd-black' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 8 cols → 4. Listing column carries the thumbnail + model + a meta
          line that folds in ID, year, km, and last-7 of VIN. Price column
          stacks rupee + CPO/As-Is badge. Status column stacks the status
          badge + the listed date. Actions stack vertically so the column
          stays narrow and the available actions remain glanceable. */}
      <div className="bg-hd-white border border-gray-200 rounded-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80 text-text-on-light">
            <tr>
              <Th>Listing</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th className="text-right pr-4">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="text-center text-gray-500 py-8">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-gray-500 py-12">
                  {tab === 'ALL' ? (
                    <>
                      No listings yet.{' '}
                      <Link to="/listings/new" className="text-hd-orange hover:underline">
                        Add your first listing
                      </Link>
                      .
                    </>
                  ) : (
                    <>No listings in this tab.</>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((l, idx) => (
              <tr
                key={l.id}
                className={`hover:bg-hd-orange/5 transition-colors ${
                  idx % 2 === 1 ? 'bg-gray-50/40' : ''
                }`}
              >
                <Td>
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                      {l.primaryImage && (
                        <img
                          src={l.primaryImage}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-subhead uppercase tracking-subhead text-[13px] text-text-on-light leading-tight">
                        {l.modelName}
                      </div>
                      <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
                        {l.year} · {l.kmsDriven.toLocaleString('en-IN')} km
                      </div>
                      <div className="font-mono text-[10px] text-gray-400 leading-tight mt-1">
                        HD-{l.id.slice(-6).toUpperCase()} · VIN&hellip;{l.vin.slice(-7)}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="font-subhead text-text-on-light whitespace-nowrap">
                    ₹{l.price.toLocaleString('en-IN')}
                  </div>
                  <div className="mt-1">
                    {l.certificationStatus === 'CPO' ? (
                      <Badge variant="cpo">CPO</Badge>
                    ) : (
                      <Badge variant="as-is">As-Is</Badge>
                    )}
                  </div>
                </Td>
                <Td>
                  <StatusBadge status={l.status} />
                  <div className="text-[10px] text-gray-500 mt-1.5 whitespace-nowrap">
                    {l.publishedAt
                      ? new Date(l.publishedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit',
                        })
                      : new Date(l.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit',
                        })}
                  </div>
                </Td>
                <Td className="text-right pr-4">
                  <div className="inline-flex flex-col items-stretch gap-1.5 min-w-[120px]">
                    {l.status === 'DRAFT' && !l.adminFeedback && (
                      <span
                        className="inline-flex items-center justify-end gap-1 text-[11px] font-subhead uppercase tracking-subhead text-warning"
                        title="An H-D admin will review and publish this listing."
                      >
                        <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />
                        Awaiting review
                      </span>
                    )}
                    {l.status === 'DRAFT' && l.adminFeedback && (
                      <Link
                        to="/listings/new"
                        className="text-right text-[11px] font-subhead uppercase tracking-subhead text-danger hover:underline"
                      >
                        Re-submit
                      </Link>
                    )}
                    {(l.status === 'ACTIVE' || l.status === 'DEACTIVATED') && (
                      <a
                        href={`http://localhost:5180/listings/${l.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-center text-[11px] font-subhead uppercase tracking-subhead text-gray-700 hover:text-hd-orange border border-gray-300 hover:border-hd-orange px-2 py-1.5 rounded transition"
                      >
                        Preview
                      </a>
                    )}
                    {l.status === 'ACTIVE' && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => markSold.mutate(l.id)}
                        >
                          Mark Sold
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => turnOff.mutate(l.id)}
                          disabled={turnOff.isPending}
                        >
                          Turn Off
                        </Button>
                      </>
                    )}
                    {l.status === 'DEACTIVATED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => turnOn.mutate(l.id)}
                        disabled={turnOn.isPending}
                      >
                        Turn On
                      </Button>
                    )}
                    {l.status !== 'REMOVED' && l.status !== 'SOLD' && (
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(l.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[10px] font-subhead uppercase tracking-subhead text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-top ${className}`}>{children}</td>;
}

function StatusBadge({ status }: { status: DealerListingRow['status'] }) {
  const tone =
    status === 'ACTIVE'
      ? 'success'
      : status === 'DRAFT'
      ? 'info'
      : status === 'SOLD'
      ? 'warning'
      : status === 'DEACTIVATED'
      ? 'warning'
      : 'danger';
  return (
    <Badge variant="status" tone={tone}>
      {STATUS_TO_LABEL[status]}
    </Badge>
  );
}
