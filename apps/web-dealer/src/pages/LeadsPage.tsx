import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { formatLeadId, type LeadKind } from '../lib/leadId';

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  message?: string | null;
  /** Set for buyer enquiries (joined from listing) and trade-in leads. */
  bikeModel?: string;
  vin?: string;
  status:
    | 'NEW'
    | 'CONTACTED'
    | 'ON_SITE_VISIT'
    | 'LOAN_APPROVAL'
    | 'IN_PROGRESS'
    | 'CONVERTED'
    | 'SUCCESS'
    | 'LOST'
    | 'DEAD'
    | 'CLOSED';
  createdAt: string;
}

type Kind = 'buyer' | 'trade-in';

const KIND_META: Record<Kind, { title: string; subtitle: string; orangeWord: string; addLabel: string }> = {
  buyer: {
    title: 'Buyer Enquiries',
    subtitle:
      "Buyers who've submitted enquiries against your listed bikes. Click + Add Enquiry to log a phone call or walk-in.",
    orangeWord: 'Enquiries',
    addLabel: '+ Add Buyer Enquiry',
  },
  'trade-in': {
    title: 'Seller Enquiries',
    subtitle:
      'H-D owners looking to sell. Walk through inspection, docs, and admin approval to make the bike live.',
    orangeWord: 'Enquiries',
    addLabel: '+ Add Seller Enquiry',
  },
};

export function LeadsPage() {
  const { kind: rawKind } = useParams<{ kind: string }>();
  // 'general' was retired May 2026 — anyone who lands on /leads/general (old
  // bookmarks, sidebar links from a stale build) gets redirected to the buyer
  // view, which is the closest equivalent.
  const kind = (['buyer', 'trade-in'].includes(rawKind ?? '') ? rawKind : 'buyer') as Kind;
  const meta = KIND_META[kind];
  const [showForm, setShowForm] = useState(false);
  // Header row shows VIN only for trade-in leads. Buyer = 8 cols (with bike),
  // trade-in = 9 cols (bike + VIN).
  const colCount = kind === 'trade-in' ? 9 : 8;

  const { data, isLoading } = useQuery({
    queryKey: ['leads', kind],
    queryFn: () => api<LeadRow[]>(`/dealer/leads/${kind}`),
  });

  return (
    <div className="px-8 py-8 lg:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-headline text-3xl tracking-headline uppercase text-text-on-light">
            {meta.title.replace(meta.orangeWord, '').trim()}{' '}
            <span className="text-hd-orange">{meta.orangeWord}</span>
          </h1>
          <p className="text-gray-600 text-sm mt-2 max-w-2xl">{meta.subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          {meta.addLabel}
        </Button>
      </div>

      <div className="bg-hd-white border border-gray-200 mt-6 overflow-x-auto rounded-card">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>ID</Th>
              <Th>{kind === 'buyer' ? 'Buyer' : 'Seller'}</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>{kind === 'buyer' ? 'Bike (Listed)' : 'Bike'}</Th>
              {kind === 'trade-in' && <Th>VIN</Th>}
              <Th>Received</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading && (
              <tr>
                <td colSpan={colCount} className="text-center py-6 text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={colCount} className="text-center py-10 text-gray-500">
                  No {kind} leads yet — click {meta.addLabel} to log one.
                </td>
              </tr>
            )}
            {data?.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <Td className="font-mono text-xs text-text-on-light">
                  {formatLeadId(kind as LeadKind, l.id, l.createdAt)}
                </Td>
                <Td className="font-subhead">{l.name}</Td>
                <Td className="font-mono text-xs whitespace-nowrap">{l.phone}</Td>
                <Td className="text-xs">{l.email}</Td>
                <Td className="text-xs text-gray-700">{l.bikeModel ?? '—'}</Td>
                {kind === 'trade-in' && (
                  <Td className="font-mono text-xs">{l.vin ?? '—'}</Td>
                )}
                <Td className="text-xs text-gray-600 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString('en-IN', { dateStyle: 'medium' })}
                </Td>
                <Td>
                  <StatusBadge status={l.status} />
                </Td>
                <Td>
                  <Link
                    to={`/leads/${kind}/${l.id}`}
                    className="inline-block border border-gray-300 px-3 py-1.5 font-subhead uppercase tracking-subhead text-[11px] text-text-on-light hover:bg-hd-orange hover:text-hd-white hover:border-hd-orange transition rounded-card"
                  >
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm &&
        (kind === 'buyer' ? (
          <AddBuyerEnquiryModal onClose={() => setShowForm(false)} />
        ) : (
          <AddSellerEnquiryModal onClose={() => setShowForm(false)} />
        ))}
    </div>
  );
}

// ─── Add Buyer Enquiry — manual (phone-call / walk-in) ─────────────────────

interface DealerListingOption {
  id: string;
  vin: string;
  modelName: string;
  year: number;
}

function AddBuyerEnquiryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    listingId: '',
    name: '',
    phone: '+91',
    email: '',
    city: '',
    pincode: '',
    message: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Pull this dealer's own listings so the rep can attach the lead to a bike.
  // Restricting to ACTIVE / DRAFT / DEACTIVATED keeps SOLD/REMOVED out of the
  // dropdown — you can't log a new lead against a bike that's already gone.
  const listings = useQuery({
    queryKey: ['dealer-listings', 'enquiry-form'],
    queryFn: () => api<Array<DealerListingOption & { status: string }>>('/dealer/listings'),
    select: (rows) =>
      rows
        .filter((r) => ['ACTIVE', 'DRAFT', 'DEACTIVATED'].includes(r.status))
        .map((r) => ({ id: r.id, vin: r.vin, modelName: r.modelName, year: r.year })),
  });

  const submit = useMutation({
    mutationFn: (body: typeof form) =>
      api<{ id: string }>('/dealer/leads/buyer', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads', 'buyer'] });
      qc.invalidateQueries({ queryKey: ['dealer-leads', 'buyer', 'sidebar'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add lead'),
  });

  return (
    <ModalShell title="Log Buyer Enquiry" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submit.mutate(form);
        }}
        className="space-y-4"
      >
        <Field label="Bike (from your listings)">
          <Select
            value={form.listingId}
            onChange={(e) => setForm((f) => ({ ...f, listingId: e.target.value }))}
            required
          >
            <option value="">Select a bike…</option>
            {listings.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.year} {l.modelName} · {l.vin.slice(-5)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buyer Name">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              minLength={2}
            />
          </Field>
          <Field label="Phone (+91…)">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
              pattern="^\+91[0-9]{10}$"
              placeholder="+919812345678"
            />
          </Field>
        </div>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City (optional)">
            <Input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </Field>
          <Field label="PIN code (optional)">
            <Input
              value={form.pincode}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
              pattern="^[0-9]{6}$"
              placeholder="122001"
            />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea
            rows={3}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            maxLength={1000}
            placeholder="Walked in 11 AM, asked about EMI options…"
            className="w-full bg-hd-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
          />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? 'Saving…' : 'Save Enquiry'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Add Seller / Trade-in Enquiry — manual ────────────────────────────────

function AddSellerEnquiryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    username: '',
    bikeModel: '',
    vin: '',
    phone: '+91',
    email: '',
    city: '',
  });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (body: typeof form) =>
      api<{ id: string }>('/dealer/leads/trade-in', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads', 'trade-in'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add lead'),
  });

  return (
    <ModalShell title="Log Seller Enquiry" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submit.mutate(form);
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seller Name">
            <Input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              minLength={2}
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              required
              minLength={1}
            />
          </Field>
        </div>
        <Field label="Bike Model">
          <Input
            value={form.bikeModel}
            onChange={(e) => setForm((f) => ({ ...f, bikeModel: e.target.value }))}
            required
            placeholder="e.g. 2019 Street Glide Special"
          />
        </Field>
        <Field label="VIN">
          <Input
            value={form.vin.toUpperCase()}
            onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))}
            required
            pattern="^[A-HJ-NPR-Z0-9]{17}$"
            placeholder="17-char VIN, no I/O/Q"
            className="font-mono"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (+91…)">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
              pattern="^\+91[0-9]{10}$"
              placeholder="+919812345678"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </Field>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submit.isPending}>
            {submit.isPending ? 'Saving…' : 'Save Enquiry'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-hd-black/50 flex items-start justify-center pt-16 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-hd-white border border-gray-200 rounded-card max-w-xl w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-headline text-2xl tracking-headline uppercase text-text-on-light">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-text-on-light text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-subhead uppercase tracking-subhead text-gray-500">
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
function StatusBadge({ status }: { status: LeadRow['status'] }) {
  const tone =
    status === 'NEW'
      ? 'info'
      : status === 'CONVERTED' || status === 'SUCCESS'
      ? 'success'
      : status === 'LOST' || status === 'CLOSED' || status === 'DEAD'
      ? 'danger'
      : 'warning';
  return (
    <Badge variant="status" tone={tone}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
