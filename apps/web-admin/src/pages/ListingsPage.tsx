import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { ListingPreviewDrawer } from '../components/ListingPreviewDrawer';

// Friendly copy for the publish-time conflict codes raised by
// POST /admin/listings/:id/publish. The server message is detailed
// ("VIN ABC is already in use by another live listing (status: ACTIVE).
// Mark the existing one Sold or Removed before publishing this one.")
// — usable, but QA asked for a single, shorter, explicit alert as the
// primary signal. We keep the server's detail as a secondary line so
// the admin can still act on it without re-opening the listing.
function friendlyPublishError(err: unknown): { title: string; detail: string } | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 409 && (err.code === 'VIN_PENDING_DUPLICATE' || err.code === 'VIN_ALREADY_PUBLISHED')) {
    return {
      title: 'VIN Number already registered.',
      detail: err.message,
    };
  }
  if (err.status === 409) {
    return { title: err.message || 'Publish blocked.', detail: '' };
  }
  return { title: err.message || 'Could not publish listing.', detail: '' };
}

interface AdminListingRow {
  id: string;
  vin: string;
  modelName: string;
  year: number;
  price: number;
  certificationStatus: 'CPO' | 'AS_IS';
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  primaryImage: string | null;
  publishedAt: string | null;
  createdAt: string;
  dealerId: string;
  dealerName: string;
  /** Dealer's city — surfaced on the row so admins can scan locations
   *  without opening the preview drawer for every listing. */
  dealerCity: string;
  /** Dealer's 6-digit PIN code — paired with the city above. */
  dealerPincode: string;
}

// QA: the Removed tab was hidden from the admin UI per ops request, but
// the "Deactivated" tab was previously a single-status filter and didn't
// include REMOVED rows — admins reported deleted listings disappearing
// from every tab except All. Renamed to "Deactivated" (still the visible
// label) but the filter now pulls both DEACTIVATED + REMOVED via the
// API's comma-separated status query so removed bikes resurface here
// alongside deactivated ones.
//
// `statusFilter` is the comma-joined query value sent to the API; `id` is
// a stable React key. `''` means no filter (All).
const TABS: { id: string; label: string; statusFilter: string }[] = [
  { id: 'ACTIVE', label: 'Ongoing', statusFilter: 'ACTIVE' },
  { id: 'DRAFT', label: 'Drafts', statusFilter: 'DRAFT' },
  { id: 'SOLD', label: 'Sold', statusFilter: 'SOLD' },
  { id: 'DEACTIVATED', label: 'Deactivated', statusFilter: 'DEACTIVATED,REMOVED' },
  { id: 'ALL', label: 'All', statusFilter: '' },
];

export function ListingsPage() {
  const [tabId, setTabId] = useState<string>('ACTIVE');
  const status = TABS.find((t) => t.id === tabId)?.statusFilter ?? '';
  const [q, setQ] = useState('');
  const [removing, setRemoving] = useState<AdminListingRow | null>(null);
  const [returning, setReturning] = useState<AdminListingRow | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-listings', status, q],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (status) sp.set('status', status);
      if (q) sp.set('q', q);
      return api<AdminListingRow[]>(`/admin/listings?${sp.toString()}`);
    },
  });

  const remove = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      api(`/admin/listings/${vars.id}/remove`, {
        method: 'POST',
        body: JSON.stringify({ reason: vars.reason }),
      }),
    onSuccess: () => {
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/admin/listings/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-listings'] }),
  });

  // QA: When publishing a DRAFT whose VIN clashes with another live or
  // pending listing, the API replies 409 with code VIN_ALREADY_PUBLISHED
  // or VIN_PENDING_DUPLICATE. The mutation used to swallow this silently,
  // so the admin's click looked like a no-op. We now lift the error into
  // local state and render a banner above the page header explaining
  // exactly what went wrong, with the server's detail as a sub-line so
  // the admin can act ("mark the other one Sold first" etc).
  const [publishAlert, setPublishAlert] = useState<{ title: string; detail: string } | null>(null);
  const publish = useMutation({
    mutationFn: (id: string) => api(`/admin/listings/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      setPreviewId(null);
      setPublishAlert(null);
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
      qc.invalidateQueries({ queryKey: ['admin-listing-detail'] });
    },
    onError: (e) => {
      const msg = friendlyPublishError(e);
      if (msg) setPublishAlert(msg);
    },
  });
  // Auto-dismiss the alert after 8s so it doesn't linger after the admin
  // navigates away. Cleared on every fresh publish click via onSuccess /
  // a new onError.
  useEffect(() => {
    if (!publishAlert) return;
    const t = window.setTimeout(() => setPublishAlert(null), 8_000);
    return () => window.clearTimeout(t);
  }, [publishAlert]);

  const returnToDealer = useMutation({
    mutationFn: (vars: { id: string; feedback: string }) =>
      api(`/admin/listings/${vars.id}/return-to-dealer`, {
        method: 'POST',
        body: JSON.stringify({ feedback: vars.feedback }),
      }),
    onSuccess: () => {
      setReturning(null);
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
    },
  });

  // Reactivate flips DEACTIVATED → ACTIVE in one click. Confirmed inline
  // because the button itself only appears on the Deactivated tab — no risk
  // of a mis-click on an unrelated row.
  const reactivate = useMutation({
    mutationFn: (id: string) => api(`/admin/listings/${id}/reactivate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-listings'] }),
  });

  // Restore flips REMOVED → DRAFT (sends it back through the normal review
  // queue). Server stamps adminFeedback noting the dealer must re-upload
  // assets, since the removal step deleted them from disk.
  const restore = useMutation({
    mutationFn: (id: string) => api(`/admin/listings/${id}/restore`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-listings'] }),
  });

  // Pending-approval count drives the orange chip on the Drafts tab.
  const { data: draftsForBadge } = useQuery({
    queryKey: ['admin-listings', 'DRAFT', 'badge'],
    queryFn: () => api<AdminListingRow[]>('/admin/listings?status=DRAFT'),
  });
  const draftCount = draftsForBadge?.length ?? 0;

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Publish-time error banner. Surfaces 409 VIN conflicts from the
          publish endpoint with a clear "VIN Number already registered."
          headline (per QA) and the server's actionable detail below it
          ("…Mark the existing one Sold or Removed before publishing this
          one."). Self-dismisses after 8s; admin can dismiss earlier
          with the close button. Sticks to the top of the listing page
          so it's visible regardless of scroll position. */}
      {publishAlert && (
        <div
          role="alert"
          className="mb-6 bg-danger/10 border border-danger/40 rounded-card px-4 py-3 flex items-start gap-3"
        >
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-danger text-hd-white text-xs font-bold shrink-0 mt-0.5"
          >
            !
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-subhead uppercase tracking-subhead text-[13px] text-danger leading-tight">
              {publishAlert.title}
            </p>
            {publishAlert.detail && (
              <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                {publishAlert.detail}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPublishAlert(null)}
            aria-label="Dismiss"
            className="text-gray-500 hover:text-text-on-light text-sm shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">Listings</h1>
        <Input
          placeholder="Search VIN or model"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
        />
      </div>

      <nav className="flex items-end gap-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTabId(t.id)}
            className={`px-4 py-2 text-sm font-subhead uppercase tracking-subhead border-b-2 -mb-px transition flex items-center gap-2 ${
              tabId === t.id
                ? 'border-hd-orange text-text-on-light'
                : 'border-transparent text-gray-500 hover:text-text-on-light'
            }`}
          >
            {t.label}
            {t.id === 'DRAFT' && draftCount > 0 && (
              <span className="bg-hd-orange text-hd-black text-[10px] font-subhead px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {draftCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* 9 cols → 5. Listing column carries thumbnail + model + year + VIN.
          Price stacks rupee + CPO/As-Is badge. Dealer stays its own column.
          Status stacks badge + created date. Actions stack vertically so
          the column stays narrow even with the Publish / Return / Deactivate /
          Remove combinations on draft rows. */}
      <div className="bg-hd-white border border-gray-200 rounded-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80">
            <tr>
              <Th>Listing</Th>
              <Th>Price</Th>
              <Th>Dealer</Th>
              <Th>Status</Th>
              <Th className="text-right pr-4">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">Loading…</td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">No listings.</td>
              </tr>
            )}
            {data?.map((l, idx) => (
              <tr
                key={l.id}
                className={`cursor-pointer transition-colors hover:bg-hd-orange/5 ${
                  idx % 2 === 1 ? 'bg-gray-50/40' : ''
                }`}
                onClick={() => setPreviewId(l.id)}
              >
                <Td>
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                      {l.primaryImage && (
                        <img src={l.primaryImage} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-subhead uppercase tracking-subhead text-[13px] text-text-on-light leading-tight">
                        {l.modelName}
                      </div>
                      <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
                        {l.year}
                      </div>
                      <div className="font-mono text-[10px] text-gray-400 leading-tight mt-1">
                        VIN&hellip;{l.vin.slice(-7)}
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
                <Td className="text-xs text-gray-700">
                  <div className="leading-tight">{l.dealerName}</div>
                  {(l.dealerCity || l.dealerPincode) && (
                    <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      {[l.dealerCity, l.dealerPincode].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </Td>
                <Td>
                  <StatusBadge status={l.status} />
                  <div className="text-[10px] text-gray-500 mt-1.5 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </div>
                </Td>
                <Td className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                  {/* Icon-only actions — labels surface on hover via the
                      tooltip span. Clicking the row (anywhere outside this
                      cell) opens the preview drawer. */}
                  <div className="inline-flex items-center justify-end gap-1">
                    {l.status === 'DRAFT' && (
                      <>
                        {/* Publish flips the listing to ACTIVE and pushes
                            it to Torque + buyer search. The icon-only UI
                            previously fired this on a single mis-click; we
                            now confirm so the admin acknowledges the bike
                            is going live. */}
                        <IconAction
                          label="Publish"
                          tone="primary"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Publish "${l.year} ${l.modelName}" (${l.dealerName})? It will appear on the buyer site and sync to Torque.`,
                              )
                            ) {
                              publish.mutate(l.id);
                            }
                          }}
                          disabled={publish.isPending}
                        >
                          <PublishIcon />
                        </IconAction>
                        <IconAction
                          label="Return to Dealer"
                          onClick={() => setReturning(l)}
                        >
                          <ReturnIcon />
                        </IconAction>
                      </>
                    )}
                    {(l.status === 'ACTIVE' || l.status === 'DRAFT') && (
                      <>
                        <IconAction
                          label="Deactivate"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Take "${l.year} ${l.modelName}" (${l.dealerName}) offline? Buyers will no longer see it on search.`,
                              )
                            ) {
                              deactivate.mutate(l.id);
                            }
                          }}
                        >
                          <PowerIcon />
                        </IconAction>
                        <IconAction
                          label="Remove"
                          tone="danger"
                          onClick={() => setRemoving(l)}
                        >
                          <TrashIcon />
                        </IconAction>
                      </>
                    )}
                    {/* Off-market rows still surface an action so the column
                        isn't empty (QA blocker — admins thought the page was
                        broken). SOLD is read-only since the bike is gone, so
                        the View icon just opens the same preview drawer the
                        row click would. DEACTIVATED → reactivate flips back
                        to ACTIVE in one click. REMOVED → restore sends the
                        listing back through the DRAFT review queue (the
                        dealer is told to re-upload missing assets). */}
                    {l.status === 'SOLD' && (
                      <IconAction label="View" onClick={() => setPreviewId(l.id)}>
                        <EyeIcon />
                      </IconAction>
                    )}
                    {l.status === 'DEACTIVATED' && (
                      <IconAction
                        label="Reactivate"
                        tone="primary"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Reactivate "${l.year} ${l.modelName}" (${l.dealerName})? It will return to the buyer site immediately.`,
                            )
                          ) {
                            reactivate.mutate(l.id);
                          }
                        }}
                        disabled={reactivate.isPending}
                      >
                        <PowerIcon />
                      </IconAction>
                    )}
                    {l.status === 'REMOVED' && (
                      <IconAction
                        label="Restore"
                        tone="primary"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Restore "${l.year} ${l.modelName}" (${l.dealerName})? The listing returns to DRAFT and the dealer will be asked to re-upload any missing assets.`,
                            )
                          ) {
                            restore.mutate(l.id);
                          }
                        }}
                        disabled={restore.isPending}
                      >
                        <RestoreIcon />
                      </IconAction>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {removing && (
        <RemoveModal
          listing={removing}
          submitting={remove.isPending}
          onCancel={() => setRemoving(null)}
          // QA: the old modal forced the admin to type a "Reason" before
          // Remove could fire. Ops fed back that delete should be a one-tap
          // confirm; we now send a fixed default so the server's audit
          // trail still has copy ("Removed by admin"), and the dealer
          // notification carries the same line.
          onConfirm={() => remove.mutate({ id: removing.id, reason: 'Removed by admin' })}
        />
      )}

      {returning && (
        <ReturnModal
          listing={returning}
          submitting={returnToDealer.isPending}
          onCancel={() => setReturning(null)}
          onConfirm={(feedback) => returnToDealer.mutate({ id: returning.id, feedback })}
        />
      )}

      <ListingPreviewDrawer
        listingId={previewId}
        onClose={() => setPreviewId(null)}
        onPublish={(id) => publish.mutate(id)}
        onDeactivate={(id) => deactivate.mutate(id)}
        onRemove={(id) => {
          // Reuse the existing reason-required RemoveModal: synthesise a row
          // shape from the drawer-detail data via a quick lookup in the table.
          const row = data?.find((r) => r.id === id);
          if (row) {
            setPreviewId(null);
            setRemoving(row);
          }
        }}
        publishing={publish.isPending}
      />
    </div>
  );
}

function RemoveModal({
  listing,
  submitting,
  onCancel,
  onConfirm,
}: {
  listing: AdminListingRow;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // QA: simplified to a Remove/Cancel confirm. The old "Reason"
  // textarea was friction the admin team didn't want — Remove is
  // already audited server-side and the dealer notification copy is
  // generated from a fixed default in the caller.
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-hd-white text-text-on-light max-w-md w-full p-6">
        <h2 className="font-headline text-2xl tracking-headline">Remove Listing?</h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
          This will take <strong>{listing.year} {listing.modelName}</strong>
          {' '}off the buyer site and move it into the Deactivated section.
          The dealer is notified.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({
  listing,
  submitting,
  onCancel,
  onConfirm,
}: {
  listing: AdminListingRow;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-hd-white text-text-on-light max-w-md w-full p-6">
        <h2 className="font-headline text-2xl tracking-headline">Return to Dealer</h2>
        <p className="text-sm text-gray-600 mt-2">
          Returning <strong>{listing.year} {listing.modelName}</strong> ({listing.dealerName}).
          Listing stays in DRAFT; the dealer sees this feedback as a red banner on My Listings
          and can edit and re-submit.
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          placeholder="What needs to change? (e.g. Photo 2 is too dark — please re-upload.)"
          className="w-full bg-hd-white border border-gray-200 px-4 py-3 mt-4 focus:outline-none focus:ring-2 focus:ring-hd-orange"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={() => onConfirm(feedback)}
            disabled={feedback.trim().length < 5 || submitting}
          >
            {submitting ? 'Sending…' : 'Send to dealer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[10px] font-subhead uppercase tracking-subhead text-gray-500 ${className}`}>
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
// Square icon button with a hover tooltip — same pattern as MyListingsPage.
// Duplicated rather than lifted into @hd-cpo/ui for now since the admin and
// dealer apps use slightly different tone palettes; promote to shared when
// a third surface needs it.
type IconActionProps = {
  label: string;
  children: React.ReactNode;
  tone?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
  onClick?: () => void;
};

function IconAction({ label, children, tone = 'default', disabled, onClick }: IconActionProps) {
  const toneClasses =
    tone === 'danger'
      ? 'text-gray-500 hover:text-danger hover:border-danger/40 hover:bg-danger/5'
      : tone === 'primary'
      ? 'text-gray-500 hover:text-hd-orange hover:border-hd-orange hover:bg-hd-orange/5'
      : 'text-gray-500 hover:text-text-on-light hover:border-gray-400 hover:bg-gray-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`group relative inline-flex items-center justify-center w-8 h-8 border border-gray-200 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${toneClasses}`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-hd-black text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-2 py-1 rounded opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition z-10"
      >
        {label}
      </span>
    </button>
  );
}

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
function PublishIcon() {
  // Paper-plane / send glyph — "publish to the world".
  return (
    <svg {...ICON_PROPS}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function ReturnIcon() {
  // Curved arrow back to sender.
  return (
    <svg {...ICON_PROPS}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
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
function EyeIcon() {
  // Eye glyph — read-only "View" action for SOLD rows.
  return (
    <svg {...ICON_PROPS}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function RestoreIcon() {
  // Counter-clockwise rewind arrow — "undo the removal".
  return (
    <svg {...ICON_PROPS}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function StatusBadge({ status }: { status: AdminListingRow['status'] }) {
  const tone =
    status === 'ACTIVE'
      ? 'success'
      : status === 'DRAFT'
      ? 'info'
      : status === 'SOLD'
      ? 'warning'
      : status === 'DEACTIVATED'
      ? 'warning'
      : 'danger'; // REMOVED
  return (
    <Badge variant="status" tone={tone}>
      {status}
    </Badge>
  );
}
