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
    <div className="max-w-container mx-auto px-6 py-10">
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
          <thead className="bg-gray-50 text-text-on-light">
            <tr>
              <Th>Kind</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Bike</Th>
              <Th>Dealer</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {leads.isLoading && (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 py-6">
                  Loading…
                </td>
              </tr>
            )}
            {!leads.isLoading && total === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 py-10">
                  No enquiries match this filter.
                </td>
              </tr>
            )}
            {leads.data?.results.map((l) => (
              <tr
                key={`${l.kind}-${l.id}`}
                className={`hover:bg-gray-50 ${l.stuck ? 'bg-danger/5' : ''}`}
              >
                <Td>
                  <Badge
                    variant="status"
                    tone={l.kind === 'buyer' ? 'info' : 'warning'}
                  >
                    {l.kind === 'trade-in' ? 'Seller' : l.kind}
                  </Badge>
                </Td>
                <Td>
                  <span className="font-subhead text-text-on-light">{l.name}</span>
                </Td>
                <Td>
                  <span className="font-mono text-[11px] text-gray-700 whitespace-nowrap">
                    {l.phone}
                  </span>
                </Td>
                <Td>
                  <span className="text-[11px] text-gray-700">{l.email}</span>
                </Td>
                <Td className="text-xs text-gray-700 max-w-[200px] truncate" title={l.bikeModel}>
                  {l.bikeModel || '—'}
                </Td>
                <Td className="text-xs">{l.dealerName}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={l.status} />
                    {l.stuck && (
                      <span
                        title="Sat in NEW for >7 days"
                        className="inline-flex items-center gap-1 text-[10px] font-subhead uppercase tracking-subhead text-danger"
                      >
                        ⚠ Stuck
                      </span>
                    )}
                  </div>
                </Td>
                <Td className="text-xs text-gray-600 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                  })}
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
    <th className="px-4 py-3 text-left text-xs font-subhead uppercase tracking-subhead text-gray-500">
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
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
