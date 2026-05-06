import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Input, Select } from '@hd-cpo/ui';
import { api } from '../lib/api';

// Cross-dealer enquiry oversight for admins. Shows every lead in the system
// (buyer / trade-in), unmasked PII (admins need to step in on stuck leads),
// dealer assignment, bike model, and a "stuck" flag for leads in NEW > 7 days.
//
// Counterpart of the dealer-side LeadsPage but with the dealer-id filter
// dropped and a stuck-only toggle that flags neglected leads.
//
// The legacy "general" lead kind (info-gate popup) was retired May 2026; the
// filter dropdown only offers buyer + trade-in now.

type Kind = 'buyer' | 'trade-in';
type LeadStatus =
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

interface AdminLeadRow {
  id: string;
  kind: Kind;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  dealerId: string;
  dealerName: string;
  bikeModel: string;
  context: string;
  stuck: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AdminLeadsResponse {
  results: AdminLeadRow[];
  total: number;
  stuckCount: number;
}

interface DealerOption {
  id: string;
  name: string;
}

const KIND_OPTIONS: { value: 'all' | Kind; label: string }[] = [
  { value: 'all', label: 'All Kinds' },
  { value: 'buyer', label: 'Buyer Enquiries' },
  { value: 'trade-in', label: 'Seller Enquiries' },
];

const STATUS_OPTIONS: ('' | LeadStatus)[] = [
  '',
  'NEW',
  'CONTACTED',
  'ON_SITE_VISIT',
  'LOAN_APPROVAL',
  'IN_PROGRESS',
  'CONVERTED',
  'SUCCESS',
  'LOST',
  'DEAD',
  'CLOSED',
];

export function EnquiriesPage() {
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [status, setStatus] = useState<'' | LeadStatus>('');
  const [dealerId, setDealerId] = useState('');
  const [stuckOnly, setStuckOnly] = useState(false);
  const [q, setQ] = useState('');

  // Pull dealers list once to populate the filter dropdown.
  const dealers = useQuery({
    queryKey: ['admin-dealers-options'],
    queryFn: () => api<DealerOption[]>('/admin/dealers'),
    staleTime: 5 * 60 * 1000,
  });

  const leads = useQuery({
    queryKey: ['admin-leads', kind, status, dealerId, stuckOnly, q],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (kind !== 'all') sp.set('kind', kind);
      if (status) sp.set('status', status);
      if (dealerId) sp.set('dealerId', dealerId);
      if (stuckOnly) sp.set('stuckOnly', 'true');
      if (q) sp.set('q', q);
      return api<AdminLeadsResponse>(`/admin/leads?${sp.toString()}`);
    },
  });

  const total = leads.data?.total ?? 0;
  const stuckCount = leads.data?.stuckCount ?? 0;

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
            Enquiries
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Cross-dealer view of every lead. Phone &amp; email are visible so
            you can step in on stuck leads without bouncing back to the dealer.
          </p>
        </div>
        {stuckCount > 0 && (
          <button
            type="button"
            onClick={() => setStuckOnly((v) => !v)}
            className={`inline-flex items-center gap-2 border rounded-card px-4 py-2 text-xs font-subhead uppercase tracking-subhead transition ${
              stuckOnly
                ? 'bg-danger text-hd-white border-danger'
                : 'bg-danger/10 text-danger border-danger/40 hover:bg-danger/20'
            }`}
            title={`${stuckCount} lead${stuckCount === 1 ? '' : 's'} sat in NEW for over 7 days`}
          >
            {stuckOnly ? '✓ Showing stuck only' : `⚠ ${stuckCount} stuck`}
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="bg-hd-white border border-gray-200 rounded-card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Select value={kind} onChange={(e) => setKind(e.target.value as 'all' | Kind)}>
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | LeadStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? s.replace(/_/g, ' ') : 'All Statuses'}
            </option>
          ))}
        </Select>
        <Select value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
          <option value="">All Dealers</option>
          {dealers.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Search name / model / VIN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="lg:col-span-2"
        />
      </div>

      {/* Results table */}
      <div className="bg-hd-white border border-gray-200 rounded-card overflow-x-auto">
        <table className="min-w-full text-sm">
          {/* 8 cols collapsed → 5 by stacking related fields:
                Lead    = name + bike (muted) underneath
                Contact = phone (mono) + email (muted)
                Dealer
                Status  = badge + date below + ⚠ stuck flag inline
              Easier to scan than 8 narrow columns. Stuck rows pick up a soft
              red tint so admins can spot them without the toggle. */}
          <thead className="bg-gray-50/80 text-text-on-light">
            <tr>
              <Th>Kind</Th>
              <Th>Lead</Th>
              <Th>Contact</Th>
              <Th>Dealer</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.isLoading && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-8">
                  Loading…
                </td>
              </tr>
            )}
            {!leads.isLoading && total === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-12">
                  No enquiries match this filter.
                </td>
              </tr>
            )}
            {leads.data?.results.map((l, idx) => (
              <tr
                key={`${l.kind}-${l.id}`}
                className={`transition-colors ${
                  l.stuck
                    ? 'bg-danger/5 hover:bg-danger/10'
                    : `hover:bg-hd-orange/5 ${idx % 2 === 1 ? 'bg-gray-50/40' : ''}`
                }`}
              >
                <Td>
                  <Badge
                    variant="status"
                    tone={l.kind === 'buyer' ? 'info' : 'warning'}
                  >
                    {l.kind === 'trade-in' ? 'Seller' : 'Buyer'}
                  </Badge>
                </Td>
                <Td>
                  <div className="font-subhead uppercase tracking-subhead text-[13px] text-text-on-light leading-tight">
                    {l.name}
                  </div>
                  <div
                    className="text-[11px] text-gray-500 leading-tight mt-0.5 max-w-[220px] truncate"
                    title={l.bikeModel}
                  >
                    {l.bikeModel || '—'}
                  </div>
                </Td>
                <Td>
                  <a
                    href={`tel:${l.phone.replace(/\s+/g, '')}`}
                    className="block font-mono text-xs text-text-on-light hover:text-hd-orange leading-tight whitespace-nowrap"
                  >
                    {l.phone}
                  </a>
                  <a
                    href={`mailto:${l.email}`}
                    className="block text-[11px] text-gray-500 hover:text-hd-orange leading-tight mt-0.5 truncate max-w-[220px]"
                    title={l.email}
                  >
                    {l.email}
                  </a>
                </Td>
                <Td className="text-xs text-gray-700">{l.dealerName}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusBadge status={l.status} />
                    {l.stuck && (
                      <span
                        title="Sat in NEW for >7 days"
                        className="inline-flex items-center text-[10px] font-subhead uppercase tracking-subhead text-danger"
                      >
                        ⚠ Stuck
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1.5 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[10px] font-subhead uppercase tracking-subhead text-gray-500">
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-top ${className}`}>{children}</td>;
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const tone =
    status === 'NEW'
      ? 'info'
      : status === 'CONVERTED' || status === 'SUCCESS'
      ? 'success'
      : status === 'LOST' || status === 'DEAD' || status === 'CLOSED'
      ? 'danger'
      : 'warning';
  return (
    <Badge variant="status" tone={tone}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
