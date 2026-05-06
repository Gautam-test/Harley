import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Select } from '@hd-cpo/ui';
import { api } from '../lib/api';

interface Metrics {
  range: { from: string; to: string };
  dealers: { byStatus: Record<string, number> };
  listings: { active: number; total: number };
  leads: {
    general: number;
    tradeIn: number;
    buyerEnquiries: number;
    total: number;
    conversions: number;
    conversionPct: number;
  };
  topDealersByListings: { dealerId: string; name: string; count: number }[];
  topDealersByLeads: { dealerId: string; name: string; count: number }[];
}

const RANGES = [
  { v: 'today', l: 'Today' },
  { v: '7d', l: 'Last 7 days' },
  { v: '30d', l: 'Last 30 days' },
];

export function DashboardPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-metrics', range],
    queryFn: () => api<Metrics>(`/admin/metrics?range=${range}`),
  });

  return (
    <div className="max-w-container mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8">
        <h1 className="font-headline text-3xl tracking-headline text-text-on-light">
          Network Overview
        </h1>
        <Select
          value={range}
          onChange={(e) => setRange(e.target.value as typeof range)}
          className="w-48"
        >
          {RANGES.map((r) => (
            <option key={r.v} value={r.v}>
              {r.l}
            </option>
          ))}
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="text-gray-500">Loading…</div>
      ) : (
        <>
          <section>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Tile label="Active Dealers" value={data.dealers.byStatus.ACTIVE ?? 0} />
              <Tile label="Active Listings" value={data.listings.active} />
              <Tile label="Total Leads" value={data.leads.total} />
              <Tile label="Conversion %" value={`${data.leads.conversionPct}%`} />
            </div>
          </section>

          <section className="mt-8 grid lg:grid-cols-2 gap-4">
            <Card className="bg-hd-white border-gray-200 p-6">
              <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
                Lead Mix
              </h2>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label="General leads" value={data.leads.general} />
                <Row label="Listing enquiries" value={data.leads.buyerEnquiries} />
                <Row label="Trade-in enquiries" value={data.leads.tradeIn} />
                <Row label="Conversions" value={data.leads.conversions} />
              </dl>
            </Card>
            <Card className="bg-hd-white border-gray-200 p-6">
              <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
                Dealers by Status
              </h2>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label="Active" value={data.dealers.byStatus.ACTIVE ?? 0} />
                <Row label="Inactive" value={data.dealers.byStatus.INACTIVE ?? 0} />
                <Row label="Suspended" value={data.dealers.byStatus.SUSPENDED ?? 0} />
              </dl>
            </Card>
          </section>

          <section className="mt-8 grid lg:grid-cols-2 gap-4">
            <Card className="bg-hd-white border-gray-200 p-6">
              <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
                Top Dealers — Listings
              </h2>
              <ol className="mt-4 space-y-2 text-sm">
                {data.topDealersByListings.length === 0 && <p className="text-gray-500">No data.</p>}
                {data.topDealersByListings.map((d) => (
                  <li key={d.dealerId} className="flex justify-between border-b border-gray-100 pb-2">
                    <span>{d.name}</span>
                    <span className="font-headline">{d.count}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="bg-hd-white border-gray-200 p-6">
              <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-sm">
                Top Dealers — Leads
              </h2>
              <ol className="mt-4 space-y-2 text-sm">
                {data.topDealersByLeads.length === 0 && <p className="text-gray-500">No data.</p>}
                {data.topDealersByLeads.map((d) => (
                  <li key={d.dealerId} className="flex justify-between border-b border-gray-100 pb-2">
                    <span>{d.name}</span>
                    <span className="font-headline">{d.count}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="bg-hd-white border-gray-200 p-6">
      <div className="text-xs font-subhead uppercase tracking-subhead text-gray-500">{label}</div>
      <div className="text-3xl font-headline text-text-on-light mt-2">{value}</div>
    </Card>
  );
}
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-headline text-text-on-light">{value}</dd>
    </div>
  );
}
