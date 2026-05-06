import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { HERO, PageHero } from '../components/PageHero';

interface OrderStage {
  status: string;
  label: string;
  note: string;
  reached: boolean;
  isCurrent: boolean;
  occurredAt: string | null;
}

interface OrderTrackResult {
  orderId: string;
  bikeLabel: string;
  estimatedDelivery: string | null;
  currentStatus: string;
  currentLabel: string;
  dealerName: string;
  dealerCity: string;
  createdAt: string;
  stages: OrderStage[];
}

interface LeadTrackResult {
  type: 'BUYER' | 'GENERAL' | 'TRADE_IN';
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
  updatedAt: string;
  context: string;
  dealerName: string | null;
}

// Pipelines mirror the dealer-portal stage machines so buyers see the same
// journey their dealer is moving them through.
const BUYER_STAGES: { status: LeadTrackResult['status']; label: string; note: string }[] = [
  { status: 'NEW', label: 'Enquiry Received', note: 'We have your details and notified the dealer.' },
  { status: 'ON_SITE_VISIT', label: 'On-Site Visit', note: 'Dealer scheduled an in-store visit.' },
  { status: 'LOAN_APPROVAL', label: 'Loan Approval', note: 'Finance assessment in progress.' },
  { status: 'CLOSED', label: 'Booking Closed', note: 'Booking finalised — paperwork next.' },
  { status: 'SUCCESS', label: 'Delivered', note: 'Bike handed over — ride safe.' },
];
const SELLER_STAGES: { status: LeadTrackResult['status']; label: string; note: string }[] = [
  { status: 'NEW', label: 'Enquiry Received', note: 'Dealer notified about your bike.' },
  { status: 'CONTACTED', label: 'Inspection Scheduled', note: 'Dealer is arranging a 110-point inspection.' },
  { status: 'IN_PROGRESS', label: 'Approved for Trade-in', note: 'Inspection passed — quote on the way.' },
  { status: 'CLOSED', label: 'Trade-in Closed', note: 'Final paperwork complete.' },
];
const GENERAL_STAGES: { status: LeadTrackResult['status']; label: string; note: string }[] = [
  { status: 'NEW', label: 'Enquiry Received', note: 'Routed to your nearest dealer.' },
  { status: 'CONTACTED', label: 'Dealer Contacted You', note: 'A dealer rep has reached out.' },
  { status: 'IN_PROGRESS', label: 'In Progress', note: 'Conversation in progress.' },
  { status: 'CLOSED', label: 'Closed', note: 'Enquiry wrapped up.' },
];

const HOW_TO_STEPS = [
  {
    title: 'Get Your Tracking Number',
    body: 'Order or enquiry IDs were sent via email after submission.',
  },
  {
    title: 'Enter Tracking ID',
    body: 'Input your number in the search box above — orders or enquiries both work.',
  },
  {
    title: 'Check Status',
    body: "View real-time updates of your bike's journey to you.",
  },
];

type LookupResult =
  | { kind: 'order'; order: OrderTrackResult }
  | { kind: 'lead'; lead: LeadTrackResult; id: string };

export function TrackPage() {
  const [params, setParams] = useSearchParams();
  const [orderId, setOrderId] = useState(params.get('id') ?? '');

  const lookup = useMutation<LookupResult, ApiError, string>({
    mutationFn: async (id: string) => {
      // Try order first — order IDs are 16-char numeric. Lead IDs are CUIDs (~25 chars).
      try {
        const order = await api<OrderTrackResult>(`/orders/track/${encodeURIComponent(id)}`);
        return { kind: 'order', order };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          // Fall through to lead lookup.
          const lead = await api<LeadTrackResult>(`/leads/track/${encodeURIComponent(id)}`);
          return { kind: 'lead', lead, id };
        }
        throw e;
      }
    },
  });

  // Auto-look-up when ?id= is in the URL.
  const initialId = params.get('id');
  if (initialId && !lookup.data && !lookup.isPending && !lookup.error) {
    setTimeout(() => lookup.mutate(initialId), 0);
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = orderId.trim();
    if (!v) return;
    setParams({ id: v });
    lookup.mutate(v);
  };

  const result = lookup.data;
  const errorMsg =
    lookup.error instanceof ApiError ? lookup.error.message : lookup.error ? 'Lookup failed' : null;

  return (
    <>
      <Helmet>
        <title>Track Your Harley — H-D Certified</title>
        <meta
          name="description"
          content="Track an H-D Certified order or enquiry — from confirmation through to delivery."
        />
      </Helmet>

      <PageHero title="Track Your" emphasis="Harley" image={HERO.panAmerica} size="lg">
        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-2xl bg-hd-white border border-gray-200 p-3 grid sm:grid-cols-[1fr_auto] gap-2 shadow-2xl rounded-card text-left"
        >
          <div>
            <label className="block text-[10px] font-subhead uppercase tracking-subhead text-gray-500 px-2 pt-1">
              Order ID or Enquiry ID
            </label>
            <Input
              placeholder="Enter order or enquiry ID"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="font-mono text-base !border-0 !shadow-none focus:!ring-0"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={!orderId.trim() || lookup.isPending}>
            {lookup.isPending ? 'Looking up…' : 'Track'}
          </Button>
        </form>
      </PageHero>

      {/* "How to Track Your Bike" — only show when no result yet */}
      {!result && !errorMsg && (
        <section className="bg-hd-white py-16">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-center font-headline tracking-headline uppercase text-2xl md:text-3xl text-text-on-light">
              How to Track Your Bike
            </h2>
            <div className="mt-10 grid md:grid-cols-3 gap-8">
              {HOW_TO_STEPS.map((s, i) => (
                <div key={s.title} className="text-center">
                  <div className="mx-auto h-12 w-12 rounded-full bg-hd-orange/10 border border-hd-orange/40 text-hd-orange font-headline tracking-headline flex items-center justify-center text-xl">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 font-headline uppercase tracking-headline text-lg text-text-on-light">
                    {s.title}
                  </h3>
                  <p className="text-sm text-gray-600 mt-2 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="bg-danger/10 border border-danger text-danger p-5 rounded-card">
            <p className="font-subhead uppercase tracking-subhead text-sm">Not found</p>
            <p className="text-sm mt-1">{errorMsg}</p>
            <p className="text-xs text-gray-600 mt-3">
              Tip: try the demo order ID <code className="font-mono">9876543212345678</code> or paste an enquiry ID
              from your confirmation email.
            </p>
          </div>
        </div>
      )}

      {/* Order result — 6-stage delivery pipeline */}
      {result?.kind === 'order' && <OrderResult order={result.order} />}

      {/* Lead/enquiry result — pipeline depends on lead type */}
      {result?.kind === 'lead' && <LeadResult lead={result.lead} id={result.id} />}
    </>
  );
}

function OrderResult({ order }: { order: OrderTrackResult }) {
  return (
    <section className="bg-hd-white py-12">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-center font-headline tracking-headline uppercase text-2xl md:text-3xl text-text-on-light">
          Track Your <span className="text-hd-orange">Order</span>
        </h2>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-start border-b border-gray-200 pb-5">
          <div>
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
              Order ID
            </p>
            <p className="font-mono text-lg text-text-on-light mt-1">{order.orderId}</p>
            <p className="font-subhead uppercase tracking-subhead text-base mt-3 text-text-on-light">
              {order.bikeLabel}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Routed to <strong>{order.dealerName}</strong> · {order.dealerCity}
            </p>
            {order.estimatedDelivery && (
              <p className="text-xs text-gray-600 mt-2">
                Estimated Delivery —{' '}
                <span className="text-hd-orange font-subhead uppercase tracking-subhead">
                  {new Date(order.estimatedDelivery).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            )}
          </div>
          <div className="md:text-right">
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
              Current Status
            </p>
            <span className="inline-flex mt-2 items-center bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-xs px-4 py-2 rounded-card">
              {order.currentLabel}
            </span>
          </div>
        </div>

        <Timeline
          stages={order.stages.map((s) => ({
            label: s.label,
            note: s.note,
            reached: s.reached,
            isCurrent: s.isCurrent,
            occurredAt: s.occurredAt,
          }))}
        />
      </div>
    </section>
  );
}

function LeadResult({ lead, id }: { lead: LeadTrackResult; id: string }) {
  const stages =
    lead.type === 'BUYER'
      ? BUYER_STAGES
      : lead.type === 'TRADE_IN'
      ? SELLER_STAGES
      : GENERAL_STAGES;

  // The current dealer-side status maps to the closest matching stage in this
  // buyer-facing pipeline. DEAD short-circuits to a final negative card.
  const isDead = lead.status === 'DEAD' || lead.status === 'LOST';
  const currIdx = stages.findIndex((s) => s.status === lead.status);
  // CONVERTED maps to SUCCESS (terminal happy path).
  const effectiveIdx =
    currIdx >= 0
      ? currIdx
      : lead.status === 'CONVERTED'
      ? stages.length - 1
      : 0;

  const headingType = lead.type === 'BUYER' ? 'Enquiry' : lead.type === 'TRADE_IN' ? 'Sell Bike' : 'Enquiry';
  const updatedAt = new Date(lead.updatedAt);

  return (
    <section className="bg-hd-white py-12">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-center font-headline tracking-headline uppercase text-2xl md:text-3xl text-text-on-light">
          Track Your <span className="text-hd-orange">{headingType}</span>
        </h2>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-start border-b border-gray-200 pb-5">
          <div>
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
              Enquiry ID
            </p>
            <p className="font-mono text-lg text-text-on-light mt-1">{id}</p>
            <p className="font-subhead uppercase tracking-subhead text-base mt-3 text-text-on-light">
              {lead.context}
            </p>
            {lead.dealerName && (
              <p className="text-xs text-gray-600 mt-1">
                Routed to <strong>{lead.dealerName}</strong>
              </p>
            )}
            <p className="text-xs text-gray-600 mt-2">
              Last update —{' '}
              <span className="font-subhead uppercase tracking-subhead">
                {updatedAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </span>
            </p>
          </div>
          <div className="md:text-right">
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
              Current Status
            </p>
            <span
              className={`inline-flex mt-2 items-center font-subhead uppercase tracking-subhead text-xs px-4 py-2 rounded-card ${
                isDead
                  ? 'bg-danger text-hd-white'
                  : lead.status === 'SUCCESS' || lead.status === 'CONVERTED'
                  ? 'bg-success text-hd-white'
                  : 'bg-hd-orange text-hd-white'
              }`}
            >
              {lead.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {isDead ? (
          <div className="mt-6 bg-danger/10 border border-danger/40 rounded-card p-5">
            <p className="font-subhead uppercase tracking-subhead text-sm text-danger">
              Enquiry closed
            </p>
            <p className="text-sm text-gray-700 mt-1">
              The dealer has closed this enquiry. If this was unexpected, get in touch with the
              dealer directly or raise a new enquiry on the bike you&rsquo;re interested in.
            </p>
          </div>
        ) : (
          <Timeline
            stages={stages.map((s, i) => ({
              label: s.label,
              note: s.note,
              reached: i <= effectiveIdx,
              isCurrent: i === effectiveIdx,
              occurredAt: i === effectiveIdx ? lead.updatedAt : i === 0 ? lead.createdAt : null,
            }))}
          />
        )}
      </div>
    </section>
  );
}

function Timeline({
  stages,
}: {
  stages: { label: string; note: string; reached: boolean; isCurrent: boolean; occurredAt: string | null }[];
}) {
  return (
    <ol className="mt-6 relative">
      {stages.map((stage, idx) => {
        const last = idx === stages.length - 1;
        const ts = stage.occurredAt ? new Date(stage.occurredAt) : null;
        return (
          <li key={stage.label} className="relative pl-10 pb-8 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className={`absolute left-3 top-7 bottom-0 w-px ${
                  stage.reached ? 'bg-hd-orange' : 'bg-gray-200'
                }`}
              />
            )}
            <span
              aria-hidden
              className={`absolute left-0 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                stage.isCurrent
                  ? 'bg-hd-orange border-hd-orange text-hd-white'
                  : stage.reached
                  ? 'bg-hd-orange/20 border-hd-orange text-hd-orange'
                  : 'bg-hd-white border-gray-300 text-gray-400'
              }`}
            >
              {stage.reached ? '●' : '○'}
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span
                className={`font-headline tracking-headline uppercase text-base ${
                  stage.reached ? 'text-text-on-light' : 'text-gray-400'
                }`}
              >
                {stage.label}
              </span>
              <span className="text-right font-subhead uppercase tracking-subhead text-[10px] text-gray-500 leading-tight">
                {ts ? (
                  <>
                    <span className="block">
                      {ts.toLocaleDateString('en-IN', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="block text-gray-400">
                      {ts.toLocaleTimeString('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">Pending</span>
                )}
              </span>
            </div>
            <p className={`text-xs mt-1 ${stage.reached ? 'text-gray-600' : 'text-gray-400'}`}>
              {stage.note}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
