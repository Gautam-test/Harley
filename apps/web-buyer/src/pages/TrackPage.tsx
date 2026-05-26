import { useEffect, useState } from 'react';
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
    | 'CLOSED'
    | 'DOCUMENTATION_VERIFICATION'
    | 'TECHNICAL_INSPECTION'
    | 'VALUATION_OFFER'
    | 'NEGOTIATION_ACCEPTANCE'
    | 'LEGAL_TRANSFER'
    | 'TRADE_IN_FINALIZED';
  createdAt: string;
  updatedAt: string;
  context: string;
  dealerName: string | null;
}

// Pipelines mirror the dealer-portal stage machines exactly — pulled from
// the same shared constants (BUYER_LEAD_PIPELINE / SELLER_LEAD_PIPELINE
// in @hd-cpo/types) so buyer-facing tracking can never drift from the
// dealer's status dropdown. Each entry is `[apiStatus, label, note]`;
// the buyer copy is what the buyer sees while the apiStatus is the raw
// enum value the dealer moves the lead through.
const BUYER_STAGES: { status: LeadTrackResult['status']; label: string; note: string }[] = [
  { status: 'NEW', label: 'Enquiry Received', note: 'We have your details and notified the dealer.' },
  { status: 'CONTACTED', label: 'Dealer Contacted You', note: 'A dealer rep has reached out about this motorcycle.' },
  { status: 'ON_SITE_VISIT', label: 'On-Site Visit', note: 'Dealer scheduled an in-store visit.' },
  { status: 'LOAN_APPROVAL', label: 'Loan Approval', note: 'Finance assessment in progress.' },
  { status: 'CLOSED', label: 'Booking Closed', note: 'Booking finalised — paperwork next.' },
  { status: 'SUCCESS', label: 'Delivered', note: 'Motorcycle handed over — ride safe.' },
];
// Seller / trade-in 7-stage pipeline (QA round 3 — expanded from
// 4 stages). Buyer-tone copy on each note line; the canonical short
// label here matches LEAD_STAGE_LABELS in @hd-cpo/types so the dealer
// dropdown + pipeline bar + this buyer-side timeline read identical.
const SELLER_STAGES: { status: LeadTrackResult['status']; label: string; note: string }[] = [
  { status: 'NEW', label: 'Enquiry Received', note: 'Dealer notified about your motorcycle.' },
  { status: 'DOCUMENTATION_VERIFICATION', label: 'Documentation Verification', note: 'Dealer reviewing your RC, insurance, and service history.' },
  { status: 'TECHNICAL_INSPECTION', label: 'Technical Inspection', note: 'Authorised technician running the 110-point check.' },
  { status: 'VALUATION_OFFER', label: 'Valuation & Offer', note: 'Quote on the way based on inspection + market.' },
  { status: 'NEGOTIATION_ACCEPTANCE', label: 'Negotiation & Acceptance', note: 'Final price under discussion.' },
  { status: 'LEGAL_TRANSFER', label: 'Legal Transfer & Documentation', note: 'RC transfer + paperwork in progress.' },
  { status: 'TRADE_IN_FINALIZED', label: 'Trade-In Finalized', note: 'Trade-in complete — payment released.' },
];
const GENERAL_STAGES: { status: LeadTrackResult['status']; label: string; note: string }[] = [
  { status: 'NEW', label: 'Enquiry Received', note: 'Routed to your nearest dealer.' },
  { status: 'CONTACTED', label: 'Dealer Contacted You', note: 'A dealer rep has reached out.' },
  { status: 'IN_PROGRESS', label: 'In Progress', note: 'Conversation in progress.' },
  { status: 'CLOSED', label: 'Closed', note: 'Enquiry wrapped up.' },
];

// QA NEW: copy and titles updated per Figma. Step icons rendered as
// SVG glyphs (chat bubble / location target / shipping box) — see
// StepIcon below — instead of numbered circles.
type StepIconKind = 'message' | 'target' | 'truck';
const HOW_TO_STEPS: { icon: StepIconKind; title: string; body: string }[] = [
  {
    icon: 'message',
    title: 'Get Your Tracking Number',
    body: "You'll Receive Your Tracking Number Via Email After Order Confirmation.",
  },
  {
    icon: 'target',
    title: 'Enter Tracking ID',
    body: 'Input Your Tracking Number In The Search Box Above.',
  },
  {
    icon: 'truck',
    title: 'Check Status',
    body: "View Real-Time Updates On Your Motorcycle's Journey To You.",
  },
];

function StepIcon({ kind }: { kind: StepIconKind }) {
  const common: React.SVGProps<SVGSVGElement> = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'w-8 h-8',
    'aria-hidden': true,
  };
  switch (kind) {
    case 'message':
      // Chat bubble — "you'll receive your tracking number via email".
      return (
        <svg {...common}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case 'target':
      // Location target — "enter tracking number".
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case 'truck':
      // Shipping truck — "check status".
      return (
        <svg {...common}>
          <rect x="1" y="6" width="15" height="11" />
          <polyline points="16 9 20 9 23 12 23 17 16 17" />
          <circle cx="6" cy="20" r="2" />
          <circle cx="18" cy="20" r="2" />
        </svg>
      );
  }
}

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

  // Auto-look-up when the URL changes (back/forward, deep link, copied URL).
  // Previously this guard ran on every render and was wedged on first 404
  // — `error` stayed truthy so the effect refused to re-fire even when the
  // id changed. Switching to useEffect([initialId]) + lookup.reset() runs
  // a fresh lookup each time the id param changes.
  const initialId = params.get('id');
  useEffect(() => {
    if (!initialId) return;
    lookup.reset();
    lookup.mutate(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = orderId.trim();
    if (!v) return;
    // Update the URL only — the `useEffect([initialId])` above owns
    // the lookup. Calling `lookup.mutate(v)` here too used to fire a
    // duplicate request and could surface the wrong result if the
    // two responses arrived out of order.
    setParams({ id: v });
  };

  const result = lookup.data;
  const errorMsg =
    lookup.error instanceof ApiError ? lookup.error.message : lookup.error ? 'Lookup failed' : null;

  // QA RE-OPEN bug #7: invalid Enquiry ID error must auto-clear after
  // 30 seconds and restore the empty placeholder ("How to Track…")
  // layout, instead of staying on screen indefinitely. Clear the URL
  // ?id param too so the placeholder view is genuinely "first visit"
  // — otherwise the auto-lookup effect would re-fire on every render.
  useEffect(() => {
    if (!errorMsg) return;
    const t = window.setTimeout(() => {
      lookup.reset();
      setOrderId('');
      const next = new URLSearchParams(params);
      next.delete('id');
      setParams(next);
    }, 30_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMsg]);

  return (
    <>
      <Helmet>
        <title>Track Your Harley — H-D Certified</title>
        <meta
          name="description"
          content="Track an H-D Certified order or enquiry — from confirmation through to delivery."
        />
      </Helmet>

      {/* QA NEW: Track hero rebuild per Figma —
            • Heading: "HARLEY-" white + "DAVIDSON" orange + ® mark
            • Compact size ("sm" → less vertical padding)
            • Breadcrumb HOME / TRACK
            • Title-case input label "Order ID / Tracking Number"
            • Polished placeholder "Enter Your Tracking Number"
            • CTA "TRACK YOUR HARLEY-DAVIDSON®"
            • Sharp container + input + CTA corners
            • Solid full-opacity orange CTA */}
      {/* QA BUG_UI_043:
            • Headline locked to 56px (was 60px via size='sm' default)
            • Hero canvas locked to exactly 380px height
            • Background swapped to brand-supplied /heros/track-bg.svg
              (outdoor mountain trail) — was the panAmerica placeholder
            • White search-box card has zero outer frame (drop shadow
              removed; relied on box-shadow before)
            • CTA button uses the vibrant #FF5500 brand fill (not the
              hd-orange #FF6600 pastel) with bold black text */}
      <PageHero
        title="Track Your"
        emphasis="Harley-Davidson®"
        image={HERO.track}
        size="sm"
        heightPx={380}
        titlePx={56}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Track' }]}
      >
        <form
          onSubmit={onSubmit}
          className="mx-auto max-w-2xl bg-hd-white p-3 grid sm:grid-cols-[1fr_auto] gap-2 text-left"
        >
          <div>
            <label className="block text-[11px] font-body text-text-on-light px-2 pt-1">
              Order ID / Tracking Number
            </label>
            <Input
              placeholder="Enter Your Tracking Number"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="font-body text-base !border-0 !shadow-none focus:!ring-0"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!orderId.trim() || lookup.isPending}
            style={{ backgroundColor: '#FF5500' }}
            className="text-hd-black font-subhead font-bold uppercase tracking-subhead text-xs px-6 py-3 hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {lookup.isPending ? 'Looking up…' : 'Track Your Harley-Davidson®'}
          </button>
        </form>
      </PageHero>

      {/* "How to Track Your Motorcycle" — only show when no result yet */}
      {!result && !errorMsg && (
        <section className="bg-hd-white py-16">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-center font-subhead font-bold tracking-subhead uppercase text-2xl md:text-3xl text-text-on-light">
              {/* QA NEW: heading per Figma — "Track Your Enquiry". */}
              Track Your Enquiry
            </h2>
            <div className="mt-10 grid md:grid-cols-3 gap-8">
              {HOW_TO_STEPS.map((s) => (
                <div key={s.title} className="text-center">
                  {/* QA NEW: orange brand icon (chat / target / truck)
                      replaces the previous numbered peach circle. */}
                  <div className="mx-auto inline-flex items-center justify-center text-hd-orange">
                    <StepIcon kind={s.icon} />
                  </div>
                  <h3 className="mt-4 font-subhead font-bold uppercase tracking-subhead text-lg text-text-on-light">
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
          <div className="bg-danger/10 border border-danger text-danger p-5">
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
        {/* QA latest: heading is solid black, 16px, wide 1903 Sans —
            no two-tone orange split per Figma. */}
        <h2 className="font-subhead font-bold tracking-subhead uppercase text-[16px] text-hd-black">
          Track Your Order
        </h2>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-start border-b border-gray-200 pb-5">
          <div>
            {/* QA latest: field labels in Title Case body face (not
                uppercase tracking-subhead) per Figma. */}
            <p className="font-body text-[12px] text-gray-500">Order ID</p>
            <p className="font-mono text-lg text-text-on-light mt-1">{order.orderId}</p>
            <p className="font-body text-base mt-3 text-text-on-light">
              {order.bikeLabel}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Routed to <strong>{order.dealerName}</strong> · {order.dealerCity}
            </p>
            {order.estimatedDelivery && (
              <p className="text-xs text-gray-600 mt-2">
                Estimated Delivery:{' '}
                <span className="text-hd-orange font-body font-bold">
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
            <p className="font-body text-[12px] text-gray-500">Current Status</p>
            {/* Sharp 0px badge corners per Figma. */}
            <span className="inline-flex mt-2 items-center bg-hd-orange text-hd-black font-subhead font-bold uppercase tracking-subhead text-xs px-4 py-2">
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

  const headingType = lead.type === 'BUYER' ? 'Enquiry' : lead.type === 'TRADE_IN' ? 'Sell Motorcycle' : 'Enquiry';
  const updatedAt = new Date(lead.updatedAt);

  return (
    <section className="bg-hd-white py-12">
      <div className="max-w-3xl mx-auto px-6">
        {/* QA latest: heading is solid black, 16px, wide 1903 Sans —
            no two-tone orange split per Figma. */}
        <h2 className="font-subhead font-bold tracking-subhead uppercase text-[16px] text-hd-black">
          Track Your {headingType}
        </h2>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:items-start border-b border-gray-200 pb-5">
          <div>
            {/* Title Case labels per Figma. */}
            <p className="font-body text-[12px] text-gray-500">Enquiry ID</p>
            <p className="font-mono text-lg text-text-on-light mt-1">{id}</p>
            <p className="font-body text-base mt-3 text-text-on-light">
              {lead.context}
            </p>
            {lead.dealerName && (
              <p className="text-xs text-gray-600 mt-1">
                Routed to <strong>{lead.dealerName}</strong>
              </p>
            )}
            <p className="text-xs text-gray-600 mt-2">
              Last Update:{' '}
              <span className="font-body font-bold">
                {updatedAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </span>
            </p>
          </div>
          <div className="md:text-right">
            <p className="font-body text-[12px] text-gray-500">Current Status</p>
            <span
              className={`inline-flex mt-2 items-center font-subhead font-bold uppercase tracking-subhead text-xs px-4 py-2 ${
                isDead
                  ? 'bg-danger text-hd-white'
                  : lead.status === 'SUCCESS' || lead.status === 'CONVERTED'
                  ? 'bg-success text-hd-white'
                  : 'bg-hd-orange text-hd-black'
              }`}
            >
              {lead.status.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {isDead ? (
          <div className="mt-6 bg-danger/10 border border-danger/40 p-5">
            <p className="font-subhead uppercase tracking-subhead text-sm text-danger">
              Enquiry closed
            </p>
            <p className="text-sm text-gray-700 mt-1">
              The dealer has closed this enquiry. If this was unexpected, get in touch with the
              dealer directly or raise a new enquiry on the motorcycle you&rsquo;re interested in.
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
            {/* QA latest: double-ring timeline node per Figma —
                active state = open orange boundary ring + filled
                orange inner dot. Reached (past) = solid orange disc.
                Inactive = open grey ring only. */}
            <span
              aria-hidden
              className={`absolute left-0 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 bg-hd-white ${
                stage.isCurrent
                  ? 'border-hd-orange'
                  : stage.reached
                  ? 'border-hd-orange'
                  : 'border-gray-300'
              }`}
            >
              {stage.isCurrent && (
                <span className="block h-2.5 w-2.5 rounded-full bg-hd-orange" />
              )}
              {!stage.isCurrent && stage.reached && (
                <span className="block h-3 w-3 rounded-full bg-hd-orange" />
              )}
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span
                className={`font-subhead font-bold tracking-subhead uppercase text-base ${
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
