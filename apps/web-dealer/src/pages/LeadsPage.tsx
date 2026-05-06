import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@hd-cpo/ui';
import { api } from '../lib/api';
import { formatLeadId, type LeadKind } from '../lib/leadId';

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  modelInterest?: string | null;
  message?: string | null;
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

type Kind = 'general' | 'buyer' | 'trade-in';

const KIND_META: Record<Kind, { title: string; subtitle: string; orangeWord: string }> = {
  general: {
    title: 'General Leads',
    subtitle: "Visitors who filled the info-gate popup. Reach out to qualify and route to a sale.",
    orangeWord: 'Leads',
  },
  buyer: {
    title: 'Buyer Enquiries',
    subtitle: "Buyers who've submitted enquiries against your listed bikes. All are OTP-verified.",
    orangeWord: 'Enquiries',
  },
  'trade-in': {
    title: 'Seller Enquiries',
    subtitle:
      'H-D owners looking to sell. Walk through inspection, docs, and admin approval to make the bike live.',
    orangeWord: 'Enquiries',
  },
};

export function LeadsPage() {
  const { kind: rawKind } = useParams<{ kind: string }>();
  const kind = (['general', 'buyer', 'trade-in'].includes(rawKind ?? '')
    ? rawKind
    : 'general') as Kind;
  const meta = KIND_META[kind];
  // Header row shows VIN only for trade-in leads, so the Loading / Empty
  // colSpan has to track that — otherwise a 1-cell span breaks the table.
  const colCount = kind === 'trade-in' ? 8 : 7;

  const { data, isLoading } = useQuery({
    queryKey: ['leads', kind],
    queryFn: () => api<LeadRow[]>(`/dealer/leads/${kind}`),
  });

  return (
    <div className="px-8 py-8 lg:py-10">
      <h1 className="font-headline text-3xl tracking-headline uppercase text-text-on-light">
        {meta.title.replace(meta.orangeWord, '').trim()}{' '}
        <span className="text-hd-orange">{meta.orangeWord}</span>
      </h1>
      <p className="text-gray-600 text-sm mt-2 max-w-2xl">{meta.subtitle}</p>

      <div className="bg-hd-white border border-gray-200 mt-6 overflow-x-auto rounded-card">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>ID</Th>
              <Th>{kind === 'buyer' ? 'Buyer' : kind === 'trade-in' ? 'Seller' : 'Name'}</Th>
              <Th>Contact</Th>
              <Th>{kind === 'buyer' ? 'Interested In' : kind === 'trade-in' ? 'Bike' : 'Model interest'}</Th>
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
                  No {kind} leads yet.
                </td>
              </tr>
            )}
            {data?.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <Td className="font-mono text-xs text-text-on-light">
                  {formatLeadId(kind as LeadKind, l.id, l.createdAt)}
                </Td>
                <Td className="font-subhead">{l.name}</Td>
                <Td>
                  <div className="font-mono text-xs">{l.phone}</div>
                  <div className="text-xs text-gray-500">{l.email}</div>
                </Td>
                <Td className="text-xs text-gray-700">
                  {kind === 'buyer'
                    ? l.message ?? '—'
                    : kind === 'trade-in'
                    ? l.bikeModel ?? '—'
                    : l.modelInterest ?? '—'}
                </Td>
                {kind === 'trade-in' && (
                  <Td className="font-mono text-xs">{l.vin ?? '—'}</Td>
                )}
                <Td className="text-xs text-gray-600">
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
