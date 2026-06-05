import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@hd-cpo/ui';
import { api } from '../lib/api';

type Kind = 'buyer' | 'trade-in';

// QA: admin lead detail page — mirrors the dealer LeadDetailPage's
// Customer Details panel so admins can see every field a customer
// submitted on their enquiry / sell-bike form. Admin has no pipeline
// actions here (those stay on the dealer side); this view is read-only
// oversight. The list page (`EnquiriesPage`) now links every row to
// `/admin/enquiries/:kind/:id`.

interface AdminLeadDetail {
  id: string;
  kind: Kind;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  pincode?: string | number | null;
  message?: string | null;
  bikeModel?: string;
  vin?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  dealer?: { id: string; name: string; city: string | null } | null;
  listing?: {
    id: string;
    slug: string;
    year: number;
    modelName: string;
    modelFamily: string;
    colour: string;
    kmsDriven: number;
    price: number;
    images: string[];
  } | null;
  // Buyer notes-derived fields
  state?: string | number | null;
  source?: string | number | null;
  budget?: string | number | null;
  financingNeeded?: string | number | boolean | null;
  tradeInInterest?: string | number | boolean | null;
  visitPreference?: string | number | null;
  bestTimeToCall?: string | number | null;
  lookingFor?: string | number | null;
  // Trade-in notes-derived fields
  year?: string | number | null;
  kmsDriven?: string | number | null;
  owners?: string | number | null;
  colour?: string | number | null;
  askingPrice?: string | number | null;
  rcAvailable?: string | number | boolean | null;
  serviceHistoryAvailable?: string | number | boolean | null;
  insuranceValidUntil?: string | number | null;
  loanOutstanding?: string | number | boolean | null;
  modifications?: string | number | null;
  reasonForSelling?: string | number | null;
  mileage?: string | number | null;
}

const KIND_LABEL: Record<Kind, string> = {
  buyer: 'Buyer Lead',
  'trade-in': 'Seller Lead',
};

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};
const has = (v: unknown) => v !== null && v !== undefined && v !== '';

export function EnquiryDetailPage() {
  const { kind: rawKind, id } = useParams<{ kind: string; id: string }>();
  const kind = (['buyer', 'trade-in'].includes(rawKind ?? '') ? rawKind : 'buyer') as Kind;

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['admin-lead', kind, id],
    queryFn: () => api<AdminLeadDetail>(`/admin/leads/${kind}/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="max-w-container mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }
  if (isError || !lead) {
    return (
      <div className="max-w-container mx-auto px-4 sm:px-6 py-10">
        <Link
          to="/enquiries"
          className="inline-flex items-center text-xs font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition border border-gray-300 px-3 py-1.5"
        >
          ← Back to Enquiries
        </Link>
        <p className="mt-6 text-sm text-danger">Lead not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-container mx-auto px-4 sm:px-6 py-6 lg:py-10">
      <Link
        to="/enquiries"
        className="inline-flex items-center text-xs font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition border border-gray-300 px-3 py-1.5"
      >
        ← Back to Enquiries
      </Link>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 mt-6">
        <div className="space-y-6 min-w-0">
          {/* Header — lead identity at a glance */}
          <header className="bg-hd-white border border-gray-200 p-6">
            <div className="flex flex-wrap items-baseline gap-3 text-xs">
              <span className="font-subhead uppercase tracking-subhead text-gray-500">
                {KIND_LABEL[kind]}
              </span>
              <Badge variant="status" tone={kind === 'buyer' ? 'info' : 'warning'}>
                {lead.status.replace(/_/g, ' ')}
              </Badge>
              <span className="text-[11px] text-gray-500">
                Created{' '}
                {new Date(lead.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <h1 className="font-headline text-3xl tracking-headline uppercase mt-3">
              {lead.name}
            </h1>
          </header>

          {/* CUSTOMER DETAILS PANEL — same structure as the dealer side. */}
          <section className="bg-hd-white border border-gray-200 p-6">
            <h2 className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mb-4">
              Customer Details
            </h2>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              <Field label="Full Name">{fmt(lead.name)}</Field>
              <Field label="Phone">
                <a
                  href={`tel:${lead.phone.replace(/\s+/g, '')}`}
                  className="font-mono text-xs hover:text-hd-orange"
                >
                  {lead.phone}
                </a>
              </Field>
              <Field label="Email">
                <a
                  href={`mailto:${lead.email}`}
                  className="font-mono text-xs hover:text-hd-orange break-all"
                >
                  {lead.email}
                </a>
              </Field>
              <Field label="City">{fmt(lead.city)}</Field>
              {has(lead.state) && <Field label="State">{fmt(lead.state)}</Field>}
              {has(lead.pincode) && <Field label="Pin Code">{fmt(lead.pincode)}</Field>}
            </div>

            {kind === 'buyer' ? (
              <>
                {(has(lead.lookingFor) ||
                  has(lead.source) ||
                  has(lead.budget) ||
                  has(lead.financingNeeded) ||
                  has(lead.tradeInInterest) ||
                  has(lead.visitPreference) ||
                  has(lead.bestTimeToCall)) && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <h3 className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
                      Lead Qualification
                    </h3>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                      {has(lead.lookingFor) && <Field label="Looking For">{fmt(lead.lookingFor)}</Field>}
                      {has(lead.source) && <Field label="Source">{fmt(lead.source)}</Field>}
                      {has(lead.budget) && (
                        <Field label="Budget">
                          {typeof lead.budget === 'number'
                            ? `₹ ${Number(lead.budget).toLocaleString('en-IN')}`
                            : fmt(lead.budget)}
                        </Field>
                      )}
                      {has(lead.financingNeeded) && <Field label="Financing Needed">{fmt(lead.financingNeeded)}</Field>}
                      {has(lead.tradeInInterest) && <Field label="Trade-In Interest">{fmt(lead.tradeInInterest)}</Field>}
                      {has(lead.visitPreference) && <Field label="Visit Preference">{fmt(lead.visitPreference)}</Field>}
                      {has(lead.bestTimeToCall) && <Field label="Best Time To Call">{fmt(lead.bestTimeToCall)}</Field>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <h3 className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
                    Motorcycle
                  </h3>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                    <Field label="Model">{fmt(lead.bikeModel)}</Field>
                    <Field label="VIN">
                      <span className="font-mono text-xs">{fmt(lead.vin)}</span>
                    </Field>
                    {has(lead.year) && <Field label="Year">{fmt(lead.year)}</Field>}
                    {has(lead.kmsDriven) && (
                      <Field label="KMs Driven">
                        {typeof lead.kmsDriven === 'number'
                          ? `${Number(lead.kmsDriven).toLocaleString('en-IN')} km`
                          : fmt(lead.kmsDriven)}
                      </Field>
                    )}
                    {has(lead.owners) && <Field label="Owner">{fmt(lead.owners)}</Field>}
                    {has(lead.colour) && <Field label="Colour">{fmt(lead.colour)}</Field>}
                    {has(lead.mileage) && <Field label="Mileage">{fmt(lead.mileage)} km/l</Field>}
                    {has(lead.rcAvailable) && <Field label="RC Available">{fmt(lead.rcAvailable)}</Field>}
                    {has(lead.serviceHistoryAvailable) && (
                      <Field label="Service History">{fmt(lead.serviceHistoryAvailable)}</Field>
                    )}
                    {has(lead.insuranceValidUntil) && (
                      <Field label="Insurance Valid Until">{fmt(lead.insuranceValidUntil)}</Field>
                    )}
                    {has(lead.modifications) && <Field label="Modifications">{fmt(lead.modifications)}</Field>}
                  </div>
                </div>

                {(has(lead.askingPrice) ||
                  has(lead.loanOutstanding) ||
                  has(lead.reasonForSelling) ||
                  has(lead.source) ||
                  has(lead.bestTimeToCall)) && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <h3 className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-3">
                      Commercials &amp; Context
                    </h3>
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                      {has(lead.askingPrice) && (
                        <Field label="Asking Price">
                          {typeof lead.askingPrice === 'number'
                            ? `₹ ${Number(lead.askingPrice).toLocaleString('en-IN')}`
                            : fmt(lead.askingPrice)}
                        </Field>
                      )}
                      {has(lead.loanOutstanding) && <Field label="Loan Outstanding">{fmt(lead.loanOutstanding)}</Field>}
                      {has(lead.reasonForSelling) && (
                        <Field label="Reason For Selling">{fmt(lead.reasonForSelling)}</Field>
                      )}
                      {has(lead.source) && <Field label="Source">{fmt(lead.source)}</Field>}
                      {has(lead.bestTimeToCall) && <Field label="Best Time To Call">{fmt(lead.bestTimeToCall)}</Field>}
                    </div>
                  </div>
                )}
              </>
            )}

            {has(lead.message) && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <h3 className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-2">
                  Customer Message
                </h3>
                <p className="text-sm text-text-on-light leading-relaxed whitespace-pre-line">
                  {String(lead.message)}
                </p>
              </div>
            )}
          </section>

          {/* Listing context for buyer leads */}
          {lead.listing && (
            <section className="bg-hd-white border border-gray-200 p-6">
              <h2 className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mb-4">
                Interested Listing
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                <Field label="Year">{lead.listing.year}</Field>
                <Field label="Model">{lead.listing.modelName}</Field>
                <Field label="Family">{lead.listing.modelFamily}</Field>
                <Field label="Colour">{lead.listing.colour}</Field>
                <Field label="KMs">{Number(lead.listing.kmsDriven).toLocaleString('en-IN')} km</Field>
                <Field label="Price">₹ {Number(lead.listing.price).toLocaleString('en-IN')}</Field>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar — Routed-to dealer card */}
        <aside className="space-y-4">
          <section className="bg-hd-white border border-gray-200 p-5">
            <h2 className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mb-3">
              Routed To
            </h2>
            <div className="space-y-2 text-sm">
              <Field label="Dealership">{lead.dealer?.name ?? '—'}</Field>
              {lead.dealer?.city && <Field label="City">{lead.dealer.city}</Field>}
            </div>
          </section>
          <section className="bg-hd-white border border-gray-200 p-5">
            <h2 className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mb-3">
              Lead Info
            </h2>
            <div className="space-y-2 text-sm">
              <Field label="Created">
                {new Date(lead.createdAt).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Field>
              {lead.updatedAt && (
                <Field label="Last Update">
                  {new Date(lead.updatedAt).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Field>
              )}
              <Field label="Status">{lead.status.replace(/_/g, ' ')}</Field>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-1">
        {label}
      </p>
      <p className="text-text-on-light">{children}</p>
    </div>
  );
}
