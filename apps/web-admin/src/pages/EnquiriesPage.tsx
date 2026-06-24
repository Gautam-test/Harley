import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Input, Select } from '@hd-cpo/ui';
import { LEAD_STAGE_LABELS } from '@hd-cpo/types';
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
  | 'CASH'
  | 'IN_PROGRESS'
  | 'CONVERTED'
  | 'SUCCESS'
  | 'LOST'
  | 'DEAD'
  | 'CLOSED'
  | 'DROPPED';

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
  createdAt: string;
  updatedAt: string;
  /** F6: PORTAL = online buyer portal, DEALER = walk-in logged by rep. Buyer only. */
  entrySource?: 'PORTAL' | 'DEALER';
}

interface AdminLeadsResponse {
  results: AdminLeadRow[];
  total: number;
}

interface DealerOption {
  id: string;
  name: string;
}

// Kept around for consumers that still want a label lookup. The tab nav
// in EnquiriesPage uses the same id values ('all' | 'buyer' | 'trade-in')
// so behaviour stays identical — only the UX shape changed (tabs vs
// Select).
const KIND_TABS: { id: 'all' | Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'trade-in', label: 'Seller' },
];

const STATUS_OPTIONS: ('' | LeadStatus)[] = [
  '',
  'NEW',
  'CONTACTED',
  'ON_SITE_VISIT',
  'LOAN_APPROVAL',
  'CASH',
  'IN_PROGRESS',
  'CONVERTED',
  'SUCCESS',
  'LOST',
  'DEAD',
  'CLOSED',
  'DROPPED',
];

export function EnquiriesPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [status, setStatus] = useState<'' | LeadStatus>('');
  const [dealerId, setDealerId] = useState('');
  const [channel, setChannel] = useState<'' | 'PORTAL' | 'DEALER'>('');
  const [q, setQ] = useState('');

  // Pull dealers list once to populate the filter dropdown.
  const dealers = useQuery({
    queryKey: ['admin-dealers-options'],
    queryFn: () => api<DealerOption[]>('/admin/dealers'),
    staleTime: 5 * 60 * 1000,
  });

  const leads = useQuery({
    queryKey: ['admin-leads', kind, status, dealerId, channel, q],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (kind !== 'all') sp.set('kind', kind);
      if (status) sp.set('status', status);
      if (dealerId) sp.set('dealerId', dealerId);
      if (channel) sp.set('channel', channel);
      if (q) sp.set('q', q);
      return api<AdminLeadsResponse>(`/admin/leads?${sp.toString()}`);
    },
  });

  const total = leads.data?.total ?? 0;

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
            Enquiries
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Cross-dealer view of every lead. Phone &amp; email are visible so
            you can step in without bouncing back to the dealer.
          </p>
        </div>
      </div>

      {/* Tab nav — replaces the Kind dropdown. Three options drive the
          same `kind` state the underlying query already used; switching
          tabs re-keys the leads query so React Query refetches cleanly.
          Mirrors the dealer-portal Enquiries page so admins and dealers
          see the same vocabulary (All / Buyer / Seller). */}
      <nav
        className="flex items-end gap-1 mb-4 border-b border-gray-200 overflow-x-auto scrollbar-hide"
        role="tablist"
        aria-label="Enquiry kind"
      >
        {KIND_TABS.map((t) => {
          const isActive = kind === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setKind(t.id)}
              className={`px-4 py-2 text-sm font-subhead uppercase tracking-subhead border-b-2 -mb-px transition flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'border-hd-orange text-text-on-light'
                  : 'border-transparent text-gray-500 hover:text-text-on-light'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Filter row — Status / Channel / Dealer / Search. Channel filter is
          buyer-only (trade-in leads have no entrySource), but showing it on
          all tabs is safe — selecting PORTAL/Walk-in while on the Seller tab
          just returns 0 rows as expected. */}
      <div className="bg-hd-white border border-gray-200 p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | LeadStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? (LEAD_STAGE_LABELS[s as keyof typeof LEAD_STAGE_LABELS] ?? s.replace(/_/g, ' ')) : 'All Status'}
            </option>
          ))}
        </Select>
        <Select value={channel} onChange={(e) => setChannel(e.target.value as '' | 'PORTAL' | 'DEALER')}>
          <option value="">All Channels</option>
          <option value="PORTAL">Online (Portal)</option>
          <option value="DEALER">Walk-In (Dealer)</option>
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
        />
      </div>

      {/* Results table */}
      <div className="bg-hd-white border border-gray-200 overflow-x-auto">
        <table className="min-w-full text-sm">
          {/* 8 cols collapsed → 5 by stacking related fields:
                Lead    = name + bike (muted) underneath
                Contact = phone (mono) + email (muted)
                Dealer
                Status  = badge + date below + ⚠ stuck flag inline
              Easier to scan than 8 narrow columns. Stuck rows pick up a soft
              red tint so admins can spot them without the toggle. */}
          {/* QA: table previously left a wide empty gutter to the right
              of the Status column because the table auto-sized to its
              content (the badge + date are narrow). Two fixes:
                1. Dealer column gets `w-full` so it absorbs the slack —
                   dealer names are the most variable-width values in the
                   row.
                2. Status column header + cell get `text-right` so the
                   badge + date land flush against the right edge for a
                   balanced, professional layout. */}
          <thead className="bg-gray-50/80 text-text-on-light">
            <tr>
              <Th>Kind</Th>
              <Th>Lead</Th>
              <Th>Contact</Th>
              <Th>Channel</Th>
              <Th className="w-full">Dealer</Th>
              <Th className="text-right">Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.isLoading && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-8">
                  Loading…
                </td>
              </tr>
            )}
            {!leads.isLoading && total === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-12">
                  No enquiries match this filter.
                </td>
              </tr>
            )}
            {leads.data?.results.map((l) => (
              <tr
                key={`${l.kind}-${l.id}`}
                onClick={() => navigate(`/enquiries/${l.kind}/${l.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/enquiries/${l.kind}/${l.id}`);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-hd-orange/5"
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
                <Td>
                  {l.kind === 'buyer' ? (
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-subhead uppercase tracking-subhead border ${
                        (l.entrySource ?? 'PORTAL') === 'PORTAL'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {(l.entrySource ?? 'PORTAL') === 'PORTAL' ? 'Online' : 'Walk-in'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">—</span>
                  )}
                </Td>
                <Td className="text-xs text-gray-700 w-full">{l.dealerName}</Td>
                <Td className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1.5 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
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

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Header text defaults to left-aligned; caller can override with
  // `text-right`/`w-full` (e.g. to push the Status column to the edge
  // and let the Dealer column absorb the remaining width).
  return (
    <th
      className={`px-4 py-3 text-[10px] font-subhead uppercase tracking-subhead text-gray-500 ${
        className.includes('text-right') ? '' : 'text-left'
      } ${className}`}
    >
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
      : status === 'LOST' || status === 'DEAD' || status === 'CLOSED' || status === 'DROPPED'
      ? 'danger'
      : 'warning';
  return (
    <Badge variant="status" tone={tone}>
      {LEAD_STAGE_LABELS[status as keyof typeof LEAD_STAGE_LABELS] ?? status.replace(/_/g, ' ')}
    </Badge>
  );
}
