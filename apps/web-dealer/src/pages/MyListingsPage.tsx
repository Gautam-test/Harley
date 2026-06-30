import { useState, useEffect, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, IconButton } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';

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
//
// QA: separate Removed and Deactivated tabs were collapsed into a single
// "Inactive" tab per ops request. Both statuses still exist on the DB
// side and the per-row actions (Turn On for DEACTIVATED, removal-reason
// banner for REMOVED) stay intact — the change is UI grouping only.
// `statusFilter` is now an array so the Inactive tab can pull both.
type TabId = 'ALL' | 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'SOLD';
const TABS: {
  id: TabId;
  label: string;
  statusFilter: ReadonlyArray<DealerListingRow['status']>;
}[] = [
  { id: 'ALL',      label: 'All',     statusFilter: [] },
  { id: 'DRAFT',    label: 'Pending', statusFilter: ['DRAFT'] },
  { id: 'ACTIVE',   label: 'Live',    statusFilter: ['ACTIVE'] },
  { id: 'INACTIVE', label: 'Inactive', statusFilter: ['DEACTIVATED', 'REMOVED'] },
  { id: 'SOLD',     label: 'Sold',    statusFilter: ['SOLD'] },
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
  REMOVED: 'Rejected by Admin',
};

export function MyListingsPage() {
  const [tab, setTab] = useState<TabId>('ALL');
  const [docsPanel, setDocsPanel] = useState<string | null>(null);
  const qc = useQueryClient();
  // Close the docs panel whenever the user switches tabs so it can't ghost-
  // open against a listing that is no longer visible in the filtered set.
  useEffect(() => { setDocsPanel(null); }, [tab]);
  const navigate = useNavigate();

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
    const wanted = TABS.find((t) => t.id === tab)?.statusFilter ?? [];
    // Empty array = "All" tab → no filter; otherwise match any status in
    // the tab's set (Inactive pulls both DEACTIVATED and REMOVED rows).
    return wanted.length === 0 || wanted.includes(l.status);
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });
  const turnOff = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}/turn-off`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });
  // QA: surface a top-of-page error banner whenever a Turn-On / restore
  // mutation rejects (e.g. VIN_IN_USE). Without this the dealer clicks
  // the power button and gets no feedback at all because the mutations
  // had no onError handler. The banner auto-dismisses on the next click.
  const [actionError, setActionError] = useState<string | null>(null);
  // F3: the listing currently being marked sold via the document-collection
  // modal (null = modal closed).
  const [markSoldFor, setMarkSoldFor] = useState<DealerListingRow | null>(null);
  // Map server error codes to QA-spec exact strings. Anything we don't
  // recognise falls through to whatever the API put in `err.message`.
  function turnOnErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      // The reactivate / restore path returns 'VIN_IN_USE' when the VIN
      // is now held by a DRAFT / ACTIVE / DEACTIVATED listing — QA copy:
      if (err.code === 'VIN_IN_USE' || err.code === 'VIN_DUPLICATE') {
        return 'A listing for this VIN is already live or pending. Mark the previous one Sold or Removed before re-listing.';
      }
      return err.message;
    }
    return 'Could not turn on this listing — please try again.';
  }
  const turnOn = useMutation({
    mutationFn: (id: string) => api(`/dealer/listings/${id}/turn-on`, { method: 'POST' }),
    onError: (err) => setActionError(turnOnErrorMessage(err)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
  });
  // "Turn On" for REMOVED rows in the Inactive tab. The /turn-on
  // endpoint only handles DEACTIVATED → ACTIVE, so for REMOVED we PATCH
  // with an empty body which trips updateListing's restoreToDraft branch
  // (clears soldAt + adminFeedback, flips status to DRAFT). The listing
  // re-enters the admin review queue from there. We can't bypass admin
  // approval client-side — only an admin can move DRAFT → ACTIVE per
  // PRD §6.3.4.
  const restoreFromRemoved = useMutation({
    mutationFn: (id: string) =>
      api(`/dealer/listings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dealer-listings'] }),
    // FIX: this mutation was silently swallowing 409 VIN_IN_USE because it
    // had no onError handler. REMOVED listings use this path (not /turn-on),
    // so clicking Turn On on a REMOVED listing with a conflicting VIN showed
    // nothing in the UI while the error was visible in browser DevTools.
    onError: (err) => setActionError(turnOnErrorMessage(err)),
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
  // Collapsible attention banner — starts open so the dealer sees the
  // feedback immediately, but can collapse it to see the listings table
  // without scrolling past the cards.
  const [attentionOpen, setAttentionOpen] = useState(false);
  // Slider index for the attention carousel — one card visible at a time.
  const [attentionIdx, setAttentionIdx] = useState(0);
  // Clamp idx whenever the list changes (e.g. dealer fixes one listing).
  const safeIdx = Math.min(attentionIdx, Math.max(0, returnedDrafts.length - 1));
  // QA latest: the removed-by-admin carousel banner was dropped, so we
  // no longer derive a removedWithReason list here. The per-row REMOVAL
  // REASON copy in the table reads l.adminFeedback directly.

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

      {markSoldFor && (
        <MarkSoldModal
          listing={markSoldFor}
          onClose={() => setMarkSoldFor(null)}
          onDone={() => {
            setMarkSoldFor(null);
            qc.invalidateQueries({ queryKey: ['dealer-listings'] });
          }}
        />
      )}

      {/* QA: red error banner for the Turn-On / restore flows so a
          VIN-conflict on the API surfaces in the UI (it was silent
          before — the dealer clicked the power button and saw no
          feedback at all). Dismissible via the X button. */}
      {actionError && (
        <div className="mb-6 bg-danger/10 border border-danger/40 p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-subhead uppercase tracking-subhead text-sm text-danger">
              Action blocked
            </p>
            <p className="text-sm text-gray-700 mt-1 leading-relaxed">
              {actionError}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss"
            className="shrink-0 text-danger hover:text-text-on-light text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin feedback banner — collapsible so the dealer can hide the
          cards and see the listings table without scrolling. Starts open
          so feedback is immediately visible on page load. */}
      {returnedDrafts.length > 0 && (
        <div className="mb-6 bg-danger/10 border border-danger/40">
          {/* Clickable header row — always visible, toggles the cards */}
          <button
            type="button"
            onClick={() => setAttentionOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-danger/5 transition"
            aria-expanded={attentionOpen}
          >
            <p className="font-subhead uppercase tracking-subhead text-sm text-danger">
              {returnedDrafts.length} listing{returnedDrafts.length === 1 ? '' : 's'} need
              {returnedDrafts.length === 1 ? 's' : ''} your attention
            </p>
            {/* Chevron rotates on open/close */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-4 h-4 shrink-0 text-danger transition-transform duration-200 ${attentionOpen ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Collapsible slider — one card visible at a time */}
          {attentionOpen && returnedDrafts[safeIdx] && (
            <div className="px-4 pb-4">
              {/* Single card */}
              {(() => {
                const l = returnedDrafts[safeIdx]!;
                // adminFeedback may contain a newline-separated restoration
                // note appended by the admin restore route. Split so we can
                // render each part as a distinct line rather than one long
                // run-on string.
                const feedbackParts = (l.adminFeedback ?? '')
                  .split(/\n+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                return (
                  <div className="text-sm bg-hd-white border border-danger/30 p-3 flex flex-wrap gap-3 items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-subhead text-text-on-light">
                        {l.year} {l.modelName} ·{' '}
                        <span className="font-mono text-xs text-gray-600">{l.vin}</span>
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {feedbackParts.map((part, i) => (
                          <p key={i} className="text-gray-700">
                            {i === 0 && (
                              <span className="font-subhead uppercase tracking-subhead text-[11px] text-danger mr-1">
                                Admin feedback:
                              </span>
                            )}
                            {part}
                          </p>
                        ))}
                      </div>
                    </div>
                    <Link
                      to={`/listings/${l.id}/edit`}
                      className="shrink-0 self-center bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 hover:brightness-110 transition"
                    >
                      Resume Edit →
                    </Link>
                  </div>
                );
              })()}

              {/* Slider nav — prev / counter / next */}
              {returnedDrafts.length > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <button
                    type="button"
                    onClick={() => setAttentionIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    aria-label="Previous listing"
                    className="inline-flex items-center gap-1 font-subhead uppercase tracking-subhead text-[11px] text-danger disabled:opacity-30 hover:underline disabled:no-underline transition"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
                    Prev
                  </button>

                  {/* Dot indicators */}
                  <div className="flex items-center gap-1.5">
                    {returnedDrafts.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setAttentionIdx(i)}
                        aria-label={`Go to listing ${i + 1}`}
                        className={`w-2 h-2 rounded-full transition ${
                          i === safeIdx ? 'bg-danger' : 'bg-danger/30 hover:bg-danger/60'
                        }`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAttentionIdx((i) => Math.min(returnedDrafts.length - 1, i + 1))}
                    disabled={safeIdx === returnedDrafts.length - 1}
                    aria-label="Next listing"
                    className="inline-flex items-center gap-1 font-subhead uppercase tracking-subhead text-[11px] text-danger disabled:opacity-30 hover:underline disabled:no-underline transition"
                  >
                    Next
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* QA latest: the top "N LISTINGS REMOVED BY ADMIN" carousel
          banner is removed per request. The per-row REMOVAL REASON
          copy still renders inline in the Inactive/Removed table rows
          (see the l.status === 'REMOVED' block below), so the dealer
          can still see why each bike was taken down — just without the
          large stacked banner at the top of the page. */}

      {/* Tab bar — Figma terminology with badge counts. scrollbar-hide
          suppresses the always-visible horizontal track that QA flagged
          as a stray "scrollbar icon" sitting under the tab labels. The
          nav can still scroll on narrow viewports via touch / wheel. */}
      <nav className="flex items-end gap-1 mb-4 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => {
          // Inactive sums DEACTIVATED + REMOVED; All sums everything;
          // single-status tabs read straight off the per-status counts.
          const count =
            t.id === 'ALL'
              ? (all ?? []).length
              : t.statusFilter.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
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
      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80 text-text-on-light">
            <tr>
              <Th>Listing</Th>
              <Th>Price</Th>
              <Th>Status</Th>
              <Th className="text-center">Active</Th>
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
            {filtered.map((l) => (
              <Fragment key={l.id}>
              <tr
                onClick={() => navigate(`/listings/${l.id}/edit`)}
                className="hover:bg-hd-orange/5 transition-colors cursor-pointer"
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/listings/${l.id}/edit`);
                  }
                }}
              >
                <Td className="py-2.5">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail with proper fallback icon when image
                        is missing or fails to load — previously showed
                        a blank grey box which looked broken. */}
                    <div className="w-20 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-200">
                      {l.primaryImage ? (
                        <img
                          src={l.primaryImage}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="w-6 h-6 text-gray-300"
                          aria-hidden
                        >
                          <circle cx="5.5" cy="17.5" r="3.5" />
                          <circle cx="18.5" cy="17.5" r="3.5" />
                          <path d="M15 6h3l3 4-5 4-4-4" />
                          <path d="M5 17.5l4.5-7h6" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-subhead uppercase tracking-subhead text-[14px] text-text-on-light leading-tight">
                        {l.modelName}
                      </div>
                      <div className="text-[11px] text-gray-600 mt-1">
                        {l.year} · {l.kmsDriven.toLocaleString('en-IN')} km
                      </div>
                      <div className="font-mono text-[10px] text-gray-400 mt-1" title={l.vin}>
                        VIN…{l.vin.slice(-7)}
                      </div>
                      {l.status === 'REMOVED' && l.adminFeedback && (
                        <div className="mt-2 text-[10px] text-warning leading-snug max-w-[280px] bg-warning/10 border-l-2 border-warning px-2 py-1">
                          <span className="font-subhead uppercase tracking-subhead">
                            Rejection reason:
                          </span>{' '}
                          {l.adminFeedback}
                        </div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td className="py-2.5">
                  <div className="font-subhead font-bold text-text-on-light whitespace-nowrap">
                    ₹{l.price.toLocaleString('en-IN')}
                  </div>
                  <div className="mt-1.5">
                    {/* Client feedback #12: "As-Is" → "Pre-Owned" */}
                    {l.certificationStatus === 'CPO' ? (
                      <Badge variant="cpo">CPO</Badge>
                    ) : (
                      <Badge variant="as-is">Pre-Owned</Badge>
                    )}
                  </div>
                </Td>
                <Td className="py-2.5">
                  <div className="flex flex-col items-start gap-1.5">
                    <StatusBadge status={l.status} />
                    <div className="text-[10px] text-gray-500 whitespace-nowrap">
                      {l.publishedAt
                        ? new Date(l.publishedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : new Date(l.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                    </div>
                  </div>
                </Td>
                {/* ── Active / Inactive toggle column ── */}
                <Td className="text-center py-2.5" onClick={(e) => e.stopPropagation()}>
                  {(l.status === 'ACTIVE' || l.status === 'DEACTIVATED') && (
                    <div className="flex flex-col items-center gap-1">
                      <button
                        role="switch"
                        aria-checked={l.status === 'ACTIVE'}
                        title={l.status === 'ACTIVE' ? 'Click to deactivate' : 'Click to activate'}
                        disabled={turnOn.isPending || turnOff.isPending}
                        className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40"
                        style={{ backgroundColor: l.status === 'ACTIVE' ? '#22c55e' : '#d1d5db' }}
                        onClick={() => {
                          if (l.status === 'ACTIVE') {
                            if (window.confirm(`Deactivate "${l.year} ${l.modelName}"? Buyers will stop seeing it.`)) turnOff.mutate(l.id);
                          } else {
                            const msg = l.publishedAt
                              ? `Activate "${l.year} ${l.modelName}"? It will go live on the marketplace.`
                              : `Re-submit "${l.year} ${l.modelName}" for admin approval?`;
                            if (window.confirm(msg)) turnOn.mutate(l.id);
                          }
                        }}
                      >
                        <span
                          className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                          style={{ transform: l.status === 'ACTIVE' ? 'translateX(16px)' : 'translateX(0px)' }}
                        />
                      </button>
                      <span className="text-[10px] text-gray-400 leading-none">
                        {l.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  )}
                  {l.status === 'REMOVED' && (
                    <button
                      className="text-[11px] text-blue-600 underline underline-offset-2 hover:text-blue-800 disabled:opacity-50"
                      disabled={restoreFromRemoved.isPending}
                      onClick={() => {
                        if (window.confirm(`Restore "${l.year} ${l.modelName}" and re-submit for admin approval?`)) {
                          restoreFromRemoved.mutate(l.id);
                        }
                      }}
                    >
                      Restore
                    </button>
                  )}
                  {(l.status === 'DRAFT' || l.status === 'SOLD' || l.status === 'PENDING') && (
                    <span className="text-gray-300 text-sm select-none">—</span>
                  )}
                </Td>

                {/* ── Actions column ── */}
                <Td className="text-right pr-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {l.status === 'ACTIVE' && (
                      <IconButton as="a" label="Preview on buyer site" href={buyerListingHref(l.slug)}>
                        <EyeIcon />
                      </IconButton>
                    )}
                    {l.status === 'SOLD' && (
                      <IconButton to={`/listings/${l.id}/edit`} label="View Details">
                        <EyeIcon />
                      </IconButton>
                    )}
                    {l.status === 'DRAFT' && !l.adminFeedback && (
                      <IconButton to={`/listings/${l.id}/edit`} label="Edit listing" tone="primary">
                        <PencilIcon />
                      </IconButton>
                    )}
                    {l.status === 'DRAFT' && l.adminFeedback && (
                      <IconButton to={`/listings/${l.id}/edit`} label="Re-submit with corrections" tone="danger">
                        <RefreshIcon />
                      </IconButton>
                    )}
                    {l.status === 'ACTIVE' && (
                      <IconButton label="Mark as Sold" onClick={() => setMarkSoldFor(l)}>
                        <SoldIcon />
                      </IconButton>
                    )}
                    <IconButton
                      label={docsPanel === l.id ? 'Close Docs' : 'Manage Docs'}
                      tone={docsPanel === l.id ? 'primary' : undefined}
                      onClick={() => setDocsPanel(docsPanel === l.id ? null : l.id)}
                    >
                      <DocsIcon />
                    </IconButton>
                    {l.status !== 'REMOVED' && l.status !== 'SOLD' && l.status !== 'DEACTIVATED' && (
                      <IconButton
                        label={l.status === 'DRAFT' ? 'Withdraw listing' : 'Mark Inactive'}
                        tone="danger"
                        onClick={() => {
                          if (window.confirm(
                            l.status === 'DRAFT'
                              ? `Withdraw "${l.year} ${l.modelName}" from review? It will move to Inactive.`
                              : `Mark "${l.year} ${l.modelName}" as Inactive?`,
                          )) {
                            turnOff.mutate(l.id);
                          }
                        }}
                      >
                        <TrashIcon />
                      </IconButton>
                    )}
                  </div>
                </Td>
              </tr>
              {docsPanel === l.id && (
                <tr>
                  <td colSpan={5} className="bg-gray-50/70 border-b border-gray-200 px-0 py-0">
                    <DocsPanel
                      listingId={l.id}
                      isSold={l.status === 'SOLD'}
                      onClose={() => setDocsPanel(null)}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
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
function Td({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td className={`px-4 py-3.5 align-top ${className}`} onClick={onClick}>
      {children}
    </td>
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
function PencilIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

function DocsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DocsPanel — F3 (sold docs + RC transfer) and F4 (CPO certification docs)
// Rendered as a full-width row below the listing row when the dealer clicks
// the Manage Docs icon.
// ──────────────────────────────────────────────────────────────────────────────

interface SoldDoc { id: string; url: string; label: string }
interface ListingDocsDetail {
  id: string;
  status: string;
  cpoDocs: Record<string, string> | null;
  soldDocs: SoldDoc[] | null;
  rcTransferStatus: string | null;
}

const CPO_DOC_TYPES = ['RSA', 'Warranty', 'HOG', 'CPO Certificate'] as const;
// F3 spec: RC Transfer Status is a simple Yes / No flag.
const RC_STATUS_OPTIONS = ['Yes', 'No'];
// F3 spec: the document types a dealer attaches when a bike is sold.
const SOLD_DOC_TYPES = ['Invoice', 'RC Transfer Document', 'Delivery Note', 'Customer Agreement', 'Other Supporting Document'] as const;

function DocsPanel({
  listingId,
  isSold,
  onClose,
}: {
  listingId: string;
  isSold: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dealer-listing-docs', listingId],
    queryFn: () => api<ListingDocsDetail>(`/dealer/listings/${listingId}`),
  });

  // CPO Docs state — local draft of the record map
  const [cpoDraft, setCpoDraft] = useState<Record<string, string> | null>(null);
  const cpoDocs: Record<string, string> = cpoDraft ?? (data?.cpoDocs ?? {});

  // New sold doc form
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newDocLabel, setNewDocLabel] = useState('');

  // RC Transfer Status local value
  const [rcValue, setRcValue] = useState<string | null>(null);
  const currentRc = rcValue ?? data?.rcTransferStatus ?? '';

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['dealer-listing-docs', listingId] });
    setCpoDraft(null);
  };

  const saveCpoDocs = useMutation({
    mutationFn: () => {
      const cleaned = Object.fromEntries(
        Object.entries(cpoDocs).filter(([, v]) => v.trim().length > 0),
      );
      return api(`/dealer/listings/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ cpoDocs: Object.keys(cleaned).length > 0 ? cleaned : null }),
      });
    },
    onSuccess: invalidate,
  });

  const addSoldDoc = useMutation({
    mutationFn: () =>
      api(`/dealer/listings/${listingId}/sold-docs`, {
        method: 'POST',
        body: JSON.stringify({ url: newDocUrl.trim(), label: newDocLabel.trim() }),
      }),
    onSuccess: () => {
      setNewDocUrl('');
      setNewDocLabel('');
      invalidate();
    },
  });

  const removeSoldDoc = useMutation({
    mutationFn: (docId: string) =>
      api(`/dealer/listings/${listingId}/sold-docs/${docId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const saveRcStatus = useMutation({
    mutationFn: () =>
      api(`/dealer/listings/${listingId}/rc-transfer-status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: currentRc }),
      }),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return (
      <div className="px-6 py-4 text-sm text-gray-500">Loading documents…</div>
    );
  }

  const soldDocs = Array.isArray(data?.soldDocs) ? (data!.soldDocs as SoldDoc[]) : [];

  return (
    <div className="px-6 py-5 space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
          Document Management
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-subhead uppercase tracking-subhead text-gray-400 hover:text-text-on-light transition"
        >
          ✕ Close
        </button>
      </div>

      {/* F4 — CPO Certification Documents */}
      <div>
        <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
          CPO Certification Documents
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {CPO_DOC_TYPES.map((docType) => (
            <div key={docType}>
              <label className="block text-[10px] font-subhead uppercase tracking-subhead text-gray-500 mb-1">
                {docType}
              </label>
              <input
                type="url"
                placeholder="https://…"
                value={cpoDocs[docType] ?? ''}
                onChange={(e) =>
                  setCpoDraft({ ...cpoDocs, [docType]: e.target.value })
                }
                className="w-full border border-gray-300 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-hd-orange"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={saveCpoDocs.isPending || cpoDraft === null}
            onClick={() => saveCpoDocs.mutate()}
            className="px-4 py-1.5 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] hover:brightness-110 disabled:opacity-40 transition"
          >
            {saveCpoDocs.isPending ? 'Saving…' : 'Save CPO Docs'}
          </button>
          {cpoDraft !== null && (
            <button
              type="button"
              onClick={() => setCpoDraft(null)}
              className="text-[11px] font-subhead uppercase tracking-subhead text-gray-400 hover:text-text-on-light transition"
            >
              Discard
            </button>
          )}
          {saveCpoDocs.isSuccess && cpoDraft === null && (
            <span className="text-[11px] text-success">Saved</span>
          )}
        </div>
      </div>

      {/* F3 — Sold Documents + RC Transfer (SOLD listings only) */}
      {isSold && (
        <>
          <div className="border-t border-gray-200 pt-5">
            <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
              Post-Sale Documents
            </p>
            {soldDocs.length > 0 && (
              <ul className="space-y-1.5 mb-4">
                {soldDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 bg-hd-white border border-gray-200 px-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="font-subhead text-[11px] text-text-on-light mr-2">{doc.label}</span>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-hd-orange hover:underline truncate"
                      >
                        {doc.url}
                      </a>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSoldDoc.mutate(doc.id)}
                      disabled={removeSoldDoc.isPending}
                      className="shrink-0 text-danger text-[11px] font-subhead uppercase tracking-subhead hover:underline disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {soldDocs.length === 0 && (
              <p className="text-[11px] text-gray-400 mb-4">No post-sale documents added yet.</p>
            )}
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-[10px] font-subhead uppercase tracking-subhead text-gray-500 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. RC Transfer Receipt"
                  value={newDocLabel}
                  onChange={(e) => setNewDocLabel(e.target.value)}
                  className="border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:border-hd-orange w-48"
                />
              </div>
              <div>
                <label className="block text-[10px] font-subhead uppercase tracking-subhead text-gray-500 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  placeholder="https://…"
                  value={newDocUrl}
                  onChange={(e) => setNewDocUrl(e.target.value)}
                  className="border border-gray-300 px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-hd-orange w-64"
                />
              </div>
              <button
                type="button"
                disabled={addSoldDoc.isPending || !newDocUrl.trim() || !newDocLabel.trim()}
                onClick={() => addSoldDoc.mutate()}
                className="px-4 py-1.5 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] hover:brightness-110 disabled:opacity-40 transition"
              >
                {addSoldDoc.isPending ? 'Adding…' : '+ Add Document'}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5">
            <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
              RC Transfer Status
            </p>
            <div className="flex items-center gap-3">
              <select
                value={currentRc}
                onChange={(e) => setRcValue(e.target.value)}
                className="border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:border-hd-orange"
              >
                <option value="">— Not set —</option>
                {RC_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={saveRcStatus.isPending || !currentRc || currentRc === (data?.rcTransferStatus ?? '')}
                onClick={() => saveRcStatus.mutate()}
                className="px-4 py-1.5 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] hover:brightness-110 disabled:opacity-40 transition"
              >
                {saveRcStatus.isPending ? 'Saving…' : 'Save Status'}
              </button>
              {saveRcStatus.isSuccess && currentRc === (data?.rcTransferStatus ?? '') && (
                <span className="text-[11px] text-success">Saved</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// F3: Mark-as-Sold modal — collects multiple sale documents (file upload) +
// RC Transfer status BEFORE marking the bike sold, so the buyer's purchase
// email (F5) goes out with those documents attached.
interface SoldDocRow {
  type: string;
  file: File | null;
}

function MarkSoldModal({
  listing,
  onClose,
  onDone,
}: {
  listing: DealerListingRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<SoldDocRow[]>([{ type: SOLD_DOC_TYPES[0], file: null }]);
  const [rcStatus, setRcStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<SoldDocRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { type: SOLD_DOC_TYPES[0], file: null }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    try {
      const withFiles = rows.filter((r) => r.file);
      // 1. Upload each document + attach to the listing BEFORE mark-sold so
      //    the F5 buyer email picks them up as attachments.
      for (let i = 0; i < withFiles.length; i++) {
        const r = withFiles[i]!;
        setProgress(`Uploading document ${i + 1} of ${withFiles.length}…`);
        const fd = new FormData();
        fd.append('file', r.file as File);
        const up = await api<{ url: string }>('/uploads/document', {
          method: 'POST',
          body: fd,
          formData: true,
        });
        await api(`/dealer/listings/${listing.id}/sold-docs`, {
          method: 'POST',
          body: JSON.stringify({ url: up.url, label: r.type }),
        });
      }
      // 2. RC transfer status (optional).
      if (rcStatus) {
        await api(`/dealer/listings/${listing.id}/rc-transfer-status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: rcStatus }),
        });
      }
      // 3. Finally mark sold.
      setProgress('Marking sold…');
      await api(`/dealer/listings/${listing.id}/mark-sold`, { method: 'POST' });
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        // 404 from the uploads/document endpoint means the server build is stale
        // and the document upload route isn't registered yet. Give a clear message.
        const msg =
          e.status === 404 && e.code === 'NOT_FOUND'
            ? 'Upload service unavailable — please refresh the page and try again, or mark as sold without attaching documents.'
            : e.message;
        setErr(msg);
      } else {
        setErr('Could not complete — please try again.');
      }
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-hd-white w-full max-w-lg border border-gray-200 shadow-xl my-8">
        <div className="bg-hd-black px-6 py-4">
          <h2 className="font-headline text-xl tracking-headline text-hd-white uppercase">Mark as Sold</h2>
          <p className="text-[11px] text-gray-300 mt-1">
            {listing.year} {listing.modelName} · VIN…{listing.vin.slice(-5)}
          </p>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
              Sale Documents
            </p>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    value={r.type}
                    onChange={(e) => setRow(i, { type: e.target.value })}
                    disabled={busy}
                    className="border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:border-hd-orange"
                  >
                    {SOLD_DOC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(e) => setRow(i, { file: e.target.files?.[0] ?? null })}
                    disabled={busy}
                    className="text-xs flex-1 min-w-0"
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={busy}
                      className="text-danger text-[11px] font-subhead uppercase tracking-subhead hover:underline disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              disabled={busy}
              className="mt-3 text-hd-orange text-[11px] font-subhead uppercase tracking-subhead hover:underline disabled:opacity-40"
            >
              + Add another document
            </button>
            <p className="text-[10px] text-gray-400 mt-2">
              PDF, JPG or PNG · up to 10 MB each. Attached to the buyer&apos;s purchase email. Documents are optional — you can add more later from Manage Docs.
            </p>
          </div>
          <div>
            <label className="block font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-1">
              RC Transfer Status
            </label>
            <select
              value={rcStatus}
              onChange={(e) => setRcStatus(e.target.value)}
              disabled={busy}
              className="border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:border-hd-orange"
            >
              <option value="">— Not set —</option>
              {RC_STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          {err && <p className="text-[11px] text-danger">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          {busy && <span className="text-[11px] text-gray-500 mr-auto">{progress}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 border border-gray-300 font-subhead uppercase tracking-subhead text-[11px] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="px-5 py-2 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] hover:brightness-110 disabled:opacity-40"
          >
            {busy ? 'Working…' : 'Confirm Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}
