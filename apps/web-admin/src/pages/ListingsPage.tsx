import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input } from '@hd-cpo/ui';
import { api } from '../lib/api';
import { ListingPreviewDrawer } from '../components/ListingPreviewDrawer';

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
}

const TABS: { id: AdminListingRow['status'] | ''; label: string }[] = [
  { id: 'ACTIVE', label: 'Ongoing' },
  { id: 'SOLD', label: 'Sold' },
  { id: 'REMOVED', label: 'Removed' },
  { id: 'DRAFT', label: 'Drafts' },
  { id: 'DEACTIVATED', label: 'Deactivated' },
  { id: '', label: 'All' },
];

export function ListingsPage() {
  const [status, setStatus] = useState<AdminListingRow['status'] | ''>('ACTIVE');
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

  const publish = useMutation({
    mutationFn: (id: string) => api(`/admin/listings/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      setPreviewId(null);
      qc.invalidateQueries({ queryKey: ['admin-listings'] });
      qc.invalidateQueries({ queryKey: ['admin-listing-detail'] });
    },
  });

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

  // Pending-approval count drives the orange chip on the Drafts tab.
  const { data: draftsForBadge } = useQuery({
    queryKey: ['admin-listings', 'DRAFT', 'badge'],
    queryFn: () => api<AdminListingRow[]>('/admin/listings?status=DRAFT'),
  });
  const draftCount = draftsForBadge?.length ?? 0;

  return (
    <div className="max-w-container mx-auto px-6 py-10">
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
            key={t.id || 'all'}
            onClick={() => setStatus(t.id)}
            className={`px-4 py-2 text-sm font-subhead uppercase tracking-subhead border-b-2 -mb-px transition flex items-center gap-2 ${
              status === t.id
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

      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Listing</Th>
              <Th>VIN</Th>
              <Th>Year</Th>
              <Th>Price</Th>
              <Th>Cert</Th>
              <Th>Dealer</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr>
                <td colSpan={9} className="text-center py-6 text-gray-500">Loading…</td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-10 text-gray-500">No listings.</td>
              </tr>
            )}
            {data?.map((l) => (
              <tr
                key={l.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setPreviewId(l.id)}
              >
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-9 bg-gray-200 overflow-hidden">
                      {l.primaryImage && (
                        <img src={l.primaryImage} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div>
                      <div className="font-subhead">{l.modelName}</div>
                      <div className="text-[11px] text-hd-orange hover:underline">Preview ↗</div>
                    </div>
                  </div>
                </Td>
                <Td className="font-mono text-xs">{l.vin}</Td>
                <Td>{l.year}</Td>
                <Td>₹{l.price.toLocaleString('en-IN')}</Td>
                <Td>
                  {l.certificationStatus === 'CPO' ? (
                    <Badge variant="cpo">CPO</Badge>
                  ) : (
                    <Badge variant="as-is">As-Is</Badge>
                  )}
                </Td>
                <Td className="text-xs">{l.dealerName}</Td>
                <Td>
                  <StatusBadge status={l.status} />
                </Td>
                <Td className="text-xs text-gray-600">
                  {new Date(l.createdAt).toLocaleDateString('en-IN')}
                </Td>
                <Td className="text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {l.status === 'DRAFT' && (
                    <>
                      <Button size="sm" onClick={() => publish.mutate(l.id)} disabled={publish.isPending}>
                        Publish
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setReturning(l)}>
                        Return to Dealer
                      </Button>
                    </>
                  )}
                  {(l.status === 'ACTIVE' || l.status === 'DRAFT') && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => deactivate.mutate(l.id)}>
                        Deactivate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(l)}>
                        Remove
                      </Button>
                    </>
                  )}
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
          onConfirm={(reason) => remove.mutate({ id: removing.id, reason })}
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
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-hd-white text-text-on-light max-w-md w-full p-6">
        <h2 className="font-headline text-2xl tracking-headline">Remove Listing</h2>
        <p className="text-sm text-gray-600 mt-2">
          Removing <strong>{listing.year} {listing.modelName}</strong>. The dealer is notified with the reason below.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Reason (visible to dealer)"
          className="w-full bg-hd-white border border-gray-200 px-4 py-3 mt-4 focus:outline-none focus:ring-2 focus:ring-hd-orange"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason)}
            disabled={reason.trim().length < 3 || submitting}
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
    <th className={`px-4 py-3 text-left text-xs font-subhead uppercase tracking-subhead text-gray-500 ${className}`}>
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
    <td className={`px-4 py-3 ${className}`} onClick={onClick}>
      {children}
    </td>
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
