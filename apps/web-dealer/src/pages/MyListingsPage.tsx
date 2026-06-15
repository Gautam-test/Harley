import { useState } from 'react';
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
  const qc = useQueryClient();
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
  // QA: surface a top-of-page error banner whenever a Turn-On / restore
  // mutation rejects (e.g. VIN_IN_USE). Without this the dealer clicks
  // the power button and gets no feedback at all because the mutations
  // had no onError handler. The banner auto-dismisses on the next click.
  const [actionError, setActionError] = useState<string | null>(null);
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
              <tr
                key={l.id}
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
                <Td
                  className="text-right pr-4 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Vertical action stack — status hint on top (when
                      applicable), action icons/links in a row below.
                      Prevents the cramped horizontal layout where
                      "AWAITING REVIEW EDIT [trash]" all ran together. */}
                  <div className="flex flex-col items-end gap-2">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {l.status === 'DRAFT' && !l.adminFeedback && (
                      <IconButton
                        to={`/listings/${l.id}/edit`}
                        label="Edit"
                        tone="primary"
                      >
                        <PencilIcon />
                      </IconButton>
                    )}
                    {l.status === 'DRAFT' && l.adminFeedback && (
                      <IconButton
                        to={`/listings/${l.id}/edit`}
                        label="Re-submit"
                        tone="danger"
                      >
                        <RefreshIcon />
                      </IconButton>
                    )}
                    {/* Preview opens the buyer-facing detail page, which only
                        renders ACTIVE listings. DEACTIVATED ("Off") rows are
                        hidden from buyers, so previewing them just lands on
                        a 404 — hiding the icon avoids that dead-end (QA #11). */}
                    {l.status === 'ACTIVE' && (
                      <IconButton
                        as="a"
                        label="Preview"
                        href={buyerListingHref(l.slug)}
                      >
                        <EyeIcon />
                      </IconButton>
                    )}
                    {l.status === 'ACTIVE' && (
                      <>
                        {/* Mark Sold + Turn Off both move stock out of the
                            active state — a clumsy thumb on a 32px icon
                            shouldn't be able to delist a live bike. The
                            confirms include the model + last-5 of VIN so
                            the dealer knows *exactly* which row they're
                            about to mutate. Same pattern as admin Publish. */}
                        <IconButton
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
                        </IconButton>
                        <IconButton
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
                        </IconButton>
                      </>
                    )}
                    {/* QA latest: icon-only power button — the "Turn On"
                        text label is dropped per spec. Accessible via
                        aria-label + native title tooltip. */}
                    {l.status === 'DEACTIVATED' && (
                      <IconButton
                        label="Turn On"
                        tone="primary"
                        onClick={() => turnOn.mutate(l.id)}
                        disabled={turnOn.isPending}
                      >
                        <PowerIcon />
                      </IconButton>
                    )}
                    {/* QA: Inactive tab REMOVED rows now show the same
                        Turn-On power button DEACTIVATED rows have, so the
                        dealer has one consistent affordance to bring an
                        inactive listing back. */}
                    {l.status === 'REMOVED' && (
                      <IconButton
                        label="Turn On"
                        tone="primary"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Restore "${l.year} ${l.modelName}" and re-submit it for admin approval? It will move from Inactive back into Pending.`,
                            )
                          ) {
                            restoreFromRemoved.mutate(l.id);
                          }
                        }}
                        disabled={restoreFromRemoved.isPending}
                      >
                        <PowerIcon />
                      </IconButton>
                    )}
                    {l.status !== 'REMOVED' && l.status !== 'SOLD' && (
                      <IconButton
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
                      </IconButton>
                    )}
                    {/* SOLD rows keep the View affordance for record-
                        keeping (photos, price, VIN, admin feedback). */}
                    {l.status === 'SOLD' && (
                      <IconButton to={`/listings/${l.id}/edit`} label="View Details">
                        <EyeIcon />
                      </IconButton>
                    )}
                  </div>
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
