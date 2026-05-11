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

// "Preview" opens the buyer-facing listing detail page. URL resolution:
//
//   1. If VITE_BUYER_URL is set at build time (env var), use it. This is
//      the recommended path for staging / preview deploys where the
//      dealer SPA isn't co-hosted with the buyer at root.
//   2. On localhost, default to http://localhost:5180 (the buyer dev
//      port). This keeps `pnpm dev` working out of the box.
//   3. On the production domain (harleydavidson.ciadmin.in) the buyer is
//      at root, so a relative `/listings/<slug>` is correct and opens
//      the buyer SPA via Apache's catch-all proxy rule.
//   4. Anywhere else (preview deploys with no env override) we still
//      fall back to a relative URL but log a warning — at least the
//      missing `VITE_BUYER_URL` is visible in the dev console.
function buyerListingHref(slug: string): string {
  const override = import.meta.env.VITE_BUYER_URL as string | undefined;
  if (override) return `${override.replace(/\/$/, '')}/listings/${slug}`;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://localhost:5180/listings/${slug}`;
    }
    if (host === 'harleydavidson.ciadmin.in') {
      // Production domain — buyer SPA at root, relative URL works.
      return `/listings/${slug}`;
    }
    // Unknown host → likely a preview / staging deploy without env
    // override. Surface to dev console so the missing config is at least
    // visible; preview links may 404 until VITE_BUYER_URL is set.
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(
        `[buyerListingHref] No VITE_BUYER_URL set on non-prod host "${host}" — Preview links may 404. Set VITE_BUYER_URL=https://buyer.example.com on this deploy.`,
      );
    }
  }
  return `/listings/${slug}`;
}

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

  // Admin-feedback-needs-attention banner: surfaces both DRAFT-returned
  // rows AND REMOVED-by-admin rows so the dealer can see *why* the admin
  // returned/removed each listing. Earlier this filter was DRAFT-only,
  // which meant a dealer whose listing was Removed by admin saw an empty
  // "Removed" tab with no reason copy (QA Bug 16 — cross-role data
  // visibility error).
  const flaggedListings = (all ?? []).filter(
    (l) => l.adminFeedback && (l.status === 'DRAFT' || l.status === 'REMOVED'),
  );
  const returnedDrafts = flaggedListings.filter((l) => l.status === 'DRAFT');
  const removedWithReason = flaggedListings.filter((l) => l.status === 'REMOVED');

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
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
            <div
              key={l.id}
              className="text-sm bg-hd-white border border-danger/30 rounded p-3 flex flex-wrap gap-3 items-start justify-between"
            >
              <div className="min-w-0 flex-1">
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
              {/* Direct CTA so the dealer doesn't have to scroll down to the
                  table row's tiny Re-submit link. Uses the new edit route
                  which hydrates the wizard from the existing draft. */}
              <Link
                to={`/listings/${l.id}/edit`}
                className="shrink-0 self-center bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 rounded-card hover:brightness-110 transition"
              >
                Resume Edit →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Admin-removed banner — when the admin removes a listing the
          adminFeedback column carries the removal reason. Surface those
          rows in their own banner so the dealer learns why the bike was
          taken down (was previously hidden — QA Bug 16). */}
      {removedWithReason.length > 0 && (
        <div className="mb-6 bg-warning/10 border border-warning/40 rounded-card p-4 space-y-3">
          <p className="font-subhead uppercase tracking-subhead text-sm text-warning">
            {removedWithReason.length} listing{removedWithReason.length === 1 ? '' : 's'}{' '}
            removed by admin
          </p>
          {removedWithReason.map((l) => (
            <div
              key={l.id}
              className="text-sm bg-hd-white border border-warning/30 rounded p-3"
            >
              <p className="font-subhead text-text-on-light">
                {l.year} {l.modelName} ·{' '}
                <span className="font-mono text-xs text-gray-600">{l.vin}</span>
              </p>
              <p className="text-gray-700 mt-1">
                <span className="font-subhead uppercase tracking-subhead text-[11px] text-warning">
                  Removal reason:
                </span>{' '}
                {l.adminFeedback}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar — Figma terminology with badge counts. scrollbar-hide
          suppresses the always-visible horizontal track that QA flagged
          as a stray "scrollbar icon" sitting under the tab labels. The
          nav can still scroll on narrow viewports via touch / wheel. */}
      <nav className="flex items-end gap-1 mb-4 border-b border-gray-200 overflow-x-auto scrollbar-hide">
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
                      {/* Inline removal reason on REMOVED rows so the
                          dealer sees admin's note even when scrolling
                          straight to the Removed tab without seeing the
                          banner above (QA Bug 16). */}
                      {l.status === 'REMOVED' && l.adminFeedback && (
                        <div className="mt-1.5 text-[10px] text-warning leading-tight max-w-[260px]">
                          <span className="font-subhead uppercase tracking-subhead">
                            Reason:
                          </span>{' '}
                          {l.adminFeedback}
                        </div>
                      )}
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
                  {/* Icon-only actions — labels surface on hover via the
                      tooltip span. Reduces visual weight when several
                      actions are valid for the row at once. */}
                  <div className="inline-flex items-center justify-end gap-1">
                    {l.status === 'DRAFT' && !l.adminFeedback && (
                      <>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-subhead uppercase tracking-subhead text-warning"
                          title="An H-D admin will review and publish this listing."
                        >
                          <span className="w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />
                          Awaiting review
                        </span>
                        {/* Edit link is always available on a DRAFT — the
                            dealer might spot a typo before admin review or
                            want to swap a photo. The wizard hydrates from
                            the saved draft (no localStorage redux). */}
                        <Link
                          to={`/listings/${l.id}/edit`}
                          className="inline-flex items-center text-[10px] font-subhead uppercase tracking-subhead text-hd-orange hover:underline ml-2"
                        >
                          Edit
                        </Link>
                      </>
                    )}
                    {l.status === 'DRAFT' && l.adminFeedback && (
                      <Link
                        to={`/listings/${l.id}/edit`}
                        className="inline-flex items-center text-[10px] font-subhead uppercase tracking-subhead text-danger hover:underline"
                      >
                        Re-submit
                      </Link>
                    )}
                    {(l.status === 'ACTIVE' || l.status === 'DEACTIVATED') && (
                      <IconAction
                        as="a"
                        label="Preview"
                        href={buyerListingHref(l.slug)}
                      >
                        <EyeIcon />
                      </IconAction>
                    )}
                    {l.status === 'ACTIVE' && (
                      <>
                        {/* Mark Sold + Turn Off both move stock out of the
                            active state — a clumsy thumb on a 32px icon
                            shouldn't be able to delist a live bike. The
                            confirms include the model + last-5 of VIN so
                            the dealer knows *exactly* which row they're
                            about to mutate. Same pattern as admin Publish. */}
                        <IconAction
                          label="Mark Sold"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Mark "${l.year} ${l.modelName}" (VIN…${l.vin.slice(-5)}) as SOLD? This removes it from buyer search.`,
                              )
                            ) {
                              markSold.mutate(l.id);
                            }
                          }}
                        >
                          <SoldIcon />
                        </IconAction>
                        <IconAction
                          label="Turn Off"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Turn off "${l.year} ${l.modelName}" (VIN…${l.vin.slice(-5)})? Buyers will stop seeing it until you turn it back on.`,
                              )
                            ) {
                              turnOff.mutate(l.id);
                            }
                          }}
                          disabled={turnOff.isPending}
                        >
                          <PowerIcon />
                        </IconAction>
                      </>
                    )}
                    {l.status === 'DEACTIVATED' && (
                      <IconAction
                        label="Turn On"
                        onClick={() => turnOn.mutate(l.id)}
                        disabled={turnOn.isPending}
                        tone="primary"
                      >
                        <PowerIcon />
                      </IconAction>
                    )}
                    {l.status !== 'REMOVED' && l.status !== 'SOLD' && (
                      <IconAction
                        label="Remove"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently remove "${l.year} ${l.modelName}" (VIN…${l.vin.slice(-5)})? This cannot be undone.`,
                            )
                          ) {
                            remove.mutate(l.id);
                          }
                        }}
                        tone="danger"
                      >
                        <TrashIcon />
                      </IconAction>
                    )}
                    {/* Off-market rows still need an action affordance —
                        previously the column went empty for SOLD / REMOVED
                        rows (QA flagged "missing operational links"). View
                        opens the dealer-side detail/edit page hydrated from
                        the server so the dealer can see photos, price, VIN,
                        admin feedback, etc. for record-keeping. */}
                    {(l.status === 'SOLD' || l.status === 'REMOVED') && (
                      <Link
                        to={`/listings/${l.id}/edit`}
                        aria-label={
                          l.status === 'SOLD' ? 'View Details' : 'View / Restore'
                        }
                        title={
                          l.status === 'SOLD' ? 'View Details' : 'View / Restore'
                        }
                        className="group relative inline-flex items-center justify-center w-8 h-8 border border-gray-200 rounded transition text-gray-500 hover:text-text-on-light hover:border-gray-400 hover:bg-gray-50"
                      >
                        <EyeIcon />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-hd-black text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-2 py-1 rounded opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition z-10"
                        >
                          {l.status === 'SOLD' ? 'View Details' : 'View / Restore'}
                        </span>
                      </Link>
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

// Square icon button with a hover tooltip. Used in the Actions column to
// keep the table light when several actions stack up on a single row. The
// label is announced to screen readers via aria-label and shown to sighted
// users via a CSS-driven tooltip on hover/focus — no JS state required.
type IconActionProps = {
  label: string;
  children: React.ReactNode;
  tone?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
} & (
  | { as?: 'button'; onClick?: () => void; href?: undefined }
  | { as: 'a'; href: string; onClick?: undefined }
);

function IconAction(props: IconActionProps) {
  const { label, children, tone = 'default', disabled } = props;
  const toneClasses =
    tone === 'danger'
      ? 'text-gray-500 hover:text-danger hover:border-danger/40 hover:bg-danger/5'
      : tone === 'primary'
      ? 'text-gray-500 hover:text-hd-orange hover:border-hd-orange hover:bg-hd-orange/5'
      : 'text-gray-500 hover:text-text-on-light hover:border-gray-400 hover:bg-gray-50';
  const base = `group relative inline-flex items-center justify-center w-8 h-8 border border-gray-200 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${toneClasses}`;
  const tooltip = (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-hd-black text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-2 py-1 rounded opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition z-10"
    >
      {label}
    </span>
  );
  if (props.as === 'a') {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        className={base}
      >
        {children}
        {tooltip}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={disabled}
      aria-label={label}
      className={base}
    >
      {children}
      {tooltip}
    </button>
  );
}

// Inline 16×16 stroke icons. Heroicons-flavoured but kept inline so we don't
// add a dependency for five glyphs. Path data — never edit directly without
// re-running an icon set against the same viewBox.
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-4 h-4',
  'aria-hidden': true,
};
function EyeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function SoldIcon() {
  // Tag with a check inside — "marked sold".
  return (
    <svg {...ICON_PROPS}>
      <path d="M20.59 13.41 13.41 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PowerIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
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
