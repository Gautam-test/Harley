import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, IconButton, Input, Select, checkPincodeMatch } from '@hd-cpo/ui';
import { LEAD_STAGE_LABELS } from '@hd-cpo/types';
import { api, ApiError } from '../lib/api';
import { formatLeadId, type LeadKind } from '../lib/leadId';
import { validators, buildFieldErrors, normalisePhone, toApiPhone, sanitizeAlpha, sanitizeDigits } from '../lib/formRules';
import { reverseGeocode } from '../lib/reverseGeocode';
import { HD_MODELS_FLAT } from '../lib/models';

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
  /** True when the dealer-notification email couldn't be sent; rep needs
      to follow up manually since they won't get the usual inbox heads-up. */
  notificationFailed?: boolean;
  createdAt: string;
}

type Kind = 'buyer' | 'trade-in';
type Tab = 'all' | Kind;

interface MergedLead extends LeadRow {
  kind: Kind;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buyer', label: 'Buyer' },
  { id: 'trade-in', label: 'Seller' },
];

// BUG-053/055 shared hook: returns the live "Pincode does not match
// city/state" error string for a form, or null when the trio is OK or
// not yet checkable. Used by both AddBuyerEnquiryModal and
// AddSellerEnquiryModal — same logic, same UX. Debounced 400ms so a
// fast typist doesn't thrash the network; result cached 30 min by the
// shared checkPincodeMatch helper from @hd-cpo/ui.
function usePincodeMatchError(
  pincode: string,
  city: string,
  state: string,
): string | null {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      setErr(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkPincodeMatch({ pincode, city, state });
      if (cancelled) return;
      setErr(
        result.status === 'mismatch' || result.status === 'invalid'
          ? result.error ?? null
          : null,
      );
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pincode, city, state]);
  return err;
}

const TAB_SUBTITLE: Record<Tab, string> = {
  all: 'Every buyer + seller enquiry routed to your dealership in one feed. Use the tabs to narrow by kind, or + Add Enquiry to log a phone call or walk-in.',
  buyer:
    "Buyers who've submitted enquiries against your listed motorcycles. Click + Add Enquiry to log a phone call or walk-in.",
  'trade-in':
    'H-D owners looking to sell. Walk through inspection, docs, and admin approval to make the motorcycle live.',
};

export function LeadsPage() {
  const navigate = useNavigate();
  // URL contract:
  //   /enquiries           → All tab (default)
  //   /enquiries/buyer     → Buyer tab (deep link, also serves the legacy
  //                          dealer-sidebar link)
  //   /enquiries/trade-in  → Seller tab (deep link)
  // Legacy /leads/* URLs are aliased via redirects in App.tsx so existing
  // bookmarks survive. 'general' (the retired info-gate kind) folds into
  // the Buyer tab — same fall-back the previous build used.
  const { kind: rawKind } = useParams<{ kind?: string }>();
  const tab: Tab =
    rawKind === 'buyer' || rawKind === 'trade-in'
      ? rawKind
      : rawKind === 'general'
        ? 'buyer'
        : 'all';
  // Form-modal mode: null = closed; 'buyer' / 'trade-in' = open with that
  // kind preselected. On the All tab the + Add Enquiry button opens a
  // tiny chooser; on the kind-specific tabs it jumps straight in.
  const [formMode, setFormMode] = useState<Kind | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  // Each tab keys its own query so React Query caches the lists
  // independently — switching tabs is instant after the first load. The
  // "All" tab fires both in parallel and merges client-side; total
  // payload for a typical dealer is small (~50 rows), no server-side
  // pagination needed.
  const buyerQuery = useQuery({
    queryKey: ['leads', 'buyer'],
    queryFn: () => api<LeadRow[]>(`/dealer/leads/buyer`),
    enabled: tab === 'all' || tab === 'buyer',
  });
  const sellerQuery = useQuery({
    queryKey: ['leads', 'trade-in'],
    queryFn: () => api<LeadRow[]>(`/dealer/leads/trade-in`),
    enabled: tab === 'all' || tab === 'trade-in',
  });
  const data: MergedLead[] | undefined = useMemo(() => {
    if (tab === 'buyer') {
      return buyerQuery.data?.map((l) => ({ ...l, kind: 'buyer' as const }));
    }
    if (tab === 'trade-in') {
      return sellerQuery.data?.map((l) => ({ ...l, kind: 'trade-in' as const }));
    }
    if (!buyerQuery.data || !sellerQuery.data) return undefined;
    const merged: MergedLead[] = [
      ...buyerQuery.data.map((l) => ({ ...l, kind: 'buyer' as const })),
      ...sellerQuery.data.map((l) => ({ ...l, kind: 'trade-in' as const })),
    ];
    merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return merged;
  }, [tab, buyerQuery.data, sellerQuery.data]);
  const isLoading =
    tab === 'all'
      ? buyerQuery.isLoading || sellerQuery.isLoading
      : tab === 'buyer'
        ? buyerQuery.isLoading
        : sellerQuery.isLoading;

  // Counts for the tab badges. Falls back to undefined → renders nothing
  // until the data lands so we don't flash "0" while loading.
  const buyerCount = buyerQuery.data?.length;
  const sellerCount = sellerQuery.data?.length;
  const allCount =
    buyerCount !== undefined && sellerCount !== undefined
      ? buyerCount + sellerCount
      : undefined;
  const countFor = (t: Tab) =>
    t === 'all' ? allCount : t === 'buyer' ? buyerCount : sellerCount;

  // Tab-switch helper — drives URL so deep-links + browser back/forward
  // work cleanly. The All tab uses the bare /enquiries path so it stays
  // bookmark-friendly.
  const goToTab = (t: Tab) => {
    navigate(t === 'all' ? '/enquiries' : `/enquiries/${t}`);
  };

  // Add Enquiry button behaviour:
  //   - On All        → open chooser modal (pick buyer or seller)
  //   - On Buyer      → open Add Buyer Enquiry directly
  //   - On Seller     → open Add Seller Enquiry directly
  const onAddClick = () => {
    if (tab === 'all') setChooserOpen(true);
    else setFormMode(tab);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-headline text-3xl tracking-headline uppercase text-text-on-light">
            Enquiries
          </h1>
          <p className="text-gray-600 text-sm mt-2 max-w-2xl">{TAB_SUBTITLE[tab]}</p>
        </div>
        <Button variant="primary" onClick={onAddClick}>
          + Add Enquiry
        </Button>
      </div>

      {/* Tab nav — All / Buyer / Seller. Each tab carries an inline
          count chip so the dealer can see at a glance how many leads
          live where without switching tabs. */}
      <nav
        className="flex items-end gap-1 mt-6 border-b border-gray-200 overflow-x-auto scrollbar-hide"
        role="tablist"
        aria-label="Enquiry kind"
      >
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const count = countFor(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => goToTab(t.id)}
              className={`px-4 py-2 text-sm font-subhead uppercase tracking-subhead border-b-2 -mb-px transition flex items-center gap-2 whitespace-nowrap ${
                isActive
                  ? 'border-hd-orange text-text-on-light'
                  : 'border-transparent text-gray-500 hover:text-text-on-light'
              }`}
            >
              {t.label}
              {count !== undefined && (
                <span
                  className={`text-[10px] font-subhead px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                    isActive
                      ? 'bg-hd-orange text-hd-black'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Layout collapses 9 cols → 5 by stacking related fields:
            Lead    = ID (caption) + name (heading)
            Contact = phone (mono) + email (muted)
            Bike    = model (+ VIN below for trade-in)
            Status  = status badge + received date below
          Wider cells beat narrow ones for scan-ability — easier than reading
          across 9 thin columns. */}
      <div className="bg-hd-white border border-gray-200 mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80">
            <tr>
              <Th>Lead</Th>
              <Th>Contact</Th>
              <Th>
                {tab === 'buyer'
                  ? 'Motorcycle Enquired'
                  : tab === 'trade-in'
                    ? 'Motorcycle Offered'
                    : 'Motorcycle'}
              </Th>
              <Th>Location</Th>
              {tab === 'all' && <Th>Kind</Th>}
              <Th>Status</Th>
              <Th className="text-right pr-4">
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={tab === 'all' ? 7 : 6} className="text-center py-8 text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={tab === 'all' ? 7 : 6} className="text-center py-12 text-gray-500">
                  No{' '}
                  {tab === 'buyer'
                    ? 'buyer'
                    : tab === 'trade-in'
                      ? 'seller'
                      : ''}{' '}
                  enquiries yet — click{' '}
                  <span className="font-subhead uppercase tracking-subhead text-hd-orange">
                    + Add Enquiry
                  </span>{' '}
                  to log one.
                </td>
              </tr>
            )}
            {data?.map((l) => (
              <tr
                key={`${l.kind}-${l.id}`}
                className="hover:bg-hd-orange/5 transition-colors"
              >
                <Td>
                  <div className="font-mono text-[10px] text-gray-500 leading-none mb-1">
                    {formatLeadId(l.kind as LeadKind, l.id, l.createdAt)}
                  </div>
                  <div className="font-subhead uppercase tracking-subhead text-[13px] text-text-on-light leading-tight">
                    {l.name}
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
                    className="block text-[11px] text-gray-500 hover:text-hd-orange leading-tight mt-0.5 truncate max-w-[200px]"
                    title={l.email}
                  >
                    {l.email}
                  </a>
                </Td>
                <Td className="text-xs">
                  <div className="text-text-on-light leading-tight">
                    {l.bikeModel ?? '—'}
                  </div>
                  {l.kind === 'trade-in' && l.vin && (
                    <div
                      className="font-mono text-[10px] text-gray-500 mt-1"
                      title={l.vin}
                    >
                      VIN · {l.vin.slice(-6)}
                    </div>
                  )}
                </Td>
                {/* Location — customer city captured at enquiry time.
                    Falls back to em-dash when not provided. */}
                <Td className="text-xs">
                  <div className="text-text-on-light leading-tight" title={l.city ?? ''}>
                    {l.city || '—'}
                  </div>
                </Td>
                {tab === 'all' && (
                  <Td>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-subhead uppercase tracking-subhead ${
                        l.kind === 'buyer'
                          ? 'bg-hd-orange/10 text-hd-orange border border-hd-orange/30'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {l.kind === 'buyer' ? 'Buyer' : 'Seller'}
                    </span>
                  </Td>
                )}
                <Td>
                  <StatusBadge status={l.status} />
                  {l.notificationFailed && (
                    <div
                      className="text-[10px] text-warning font-subhead uppercase tracking-subhead mt-1 flex items-center gap-1"
                      title="Our system couldn't email you about this lead. Please reach out to the buyer directly."
                    >
                      <span aria-hidden>⚠</span> Email not sent
                    </div>
                  )}
                  <div className="text-[10px] text-gray-500 mt-1.5 whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </Td>
                <Td className="text-right pr-4">
                  <IconButton
                    to={`/leads/${l.kind}/${l.id}`}
                    label="Open"
                    tone="primary"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                      aria-hidden
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </IconButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chooser modal — surfaces only on the All tab where the +Add
          button can't infer which form to open. Two big buttons; clicking
          one stores the choice in formMode and unmounts the chooser. */}
      {chooserOpen && (
        <ModalShell title="Add Enquiry" onClose={() => setChooserOpen(false)}>
          <p className="text-sm text-gray-600 mb-4">
            Which kind of enquiry are you logging?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setChooserOpen(false);
                setFormMode('buyer');
              }}
              className="text-left border border-gray-300 p-4 hover:border-hd-orange hover:bg-hd-orange/5 transition"
            >
              <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
                Buyer Enquiry
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Customer asking about one of your listed motorcycles.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setChooserOpen(false);
                setFormMode('trade-in');
              }}
              className="text-left border border-gray-300 p-4 hover:border-hd-orange hover:bg-hd-orange/5 transition"
            >
              <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
                Seller Enquiry
              </p>
              <p className="text-xs text-gray-600 mt-1">
                H-D owner looking to trade in / sell their motorcycle.
              </p>
            </button>
          </div>
        </ModalShell>
      )}

      {formMode === 'buyer' && (
        <AddBuyerEnquiryModal onClose={() => setFormMode(null)} />
      )}
      {formMode === 'trade-in' && (
        <AddSellerEnquiryModal onClose={() => setFormMode(null)} />
      )}
    </div>
  );
}

// ─── Form options shared by both modals ───────────────────────────────────

const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

const SOURCE_OPTIONS = [
  { value: 'walk-in', label: 'Walk-in (showroom)' },
  { value: 'phone', label: 'Phone call' },
  { value: 'website', label: 'Website / online' },
  { value: 'referral', label: 'Customer referral' },
  { value: 'event', label: 'Event / exhibition' },
  { value: 'other', label: 'Other' },
];

const VISIT_OPTIONS = [
  { value: '', label: '— Not yet decided —' },
  { value: 'test-ride', label: 'Wants a test ride' },
  { value: 'showroom', label: 'Showroom visit only' },
  { value: 'virtual', label: 'Virtual / video walkthrough' },
  { value: 'none-yet', label: 'Information gathering only' },
];

const CALL_WINDOW_OPTIONS = [
  { value: '', label: '— Anytime —' },
  { value: 'morning', label: 'Morning (9 – 12)' },
  { value: 'afternoon', label: 'Afternoon (12 – 5)' },
  { value: 'evening', label: 'Evening (5 – 8)' },
  { value: 'anytime', label: 'Anytime' },
];

// Section header inside the modal — keeps the long form scannable. Two
// lines: a tiny orange-on-white kicker + a bold uppercase label, mirroring
// the H-D brand subhead pattern used elsewhere on the dealer portal.
function FormSection({ kicker, label, children }: { kicker: string; label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 pt-3 border-t border-gray-100 first:pt-0 first:border-t-0">
      <legend className="font-subhead uppercase tracking-subhead text-[11px] text-text-on-light">
        <span className="text-hd-orange">{kicker} ·</span> {label}
      </legend>
      {children}
    </fieldset>
  );
}

// ─── Location input — free-text neighbourhood field with a locator
// button. Tap the icon → ask the browser for coords → reverse-geocode
// via BigDataCloud → fill the `location` text AND auto-populate
// state / city / pincode below. Mirrors apps/web-buyer InfoGateModal
// LocationInput so dealer + buyer flows feel identical (QA spec). */
function LocationInput({
  value,
  onChange,
  onResolved,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Called after a successful geolocation + reverse-geocode pass so
   *  the parent form can auto-fill State / City / Pincode below. */
  onResolved: (r: { state: string; city: string; pincode: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      setError('Location services unavailable in this browser');
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          onChange(
            r.locality ||
              [r.city, r.state].filter(Boolean).join(', ') ||
              `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          );
          onResolved({ state: r.state, city: r.city, pincode: r.pincode });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not resolve location');
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        if (err.code === 1) setError('Permission denied');
        else setError('Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <div>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={busy ? 'Locating…' : 'e.g. MG Road, Sector 14'}
          className="pr-10"
          readOnly={busy}
        />
        <button
          type="button"
          onClick={useGeolocation}
          disabled={busy}
          aria-label="Use my current location"
          title="Use my current location"
          className={`absolute right-2 top-1/2 -translate-y-1/2 text-hd-orange hover:brightness-110 ${
            busy ? 'animate-pulse' : ''
          }`}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
          </svg>
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

// ─── Add Buyer Enquiry — manual (phone-call / walk-in) ─────────────────────

interface DealerListingOption {
  id: string;
  vin: string;
  modelName: string;
  year: number;
  status?: string;
}

function AddBuyerEnquiryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    listingId: '',
    name: '',
    // QA: ship the trailing space in the default so the field opens
    // already formatted as "+91 " rather than "+91" (matches normalisePhone).
    phone: '+91 ',
    email: '',
    location: '', // QA: neighbourhood free-text; locator icon fills city/state/pincode
    city: '',
    state: '',
    pincode: '',
    source: 'walk-in',
    budget: '',
    visitPreference: '',
    bestTimeToCall: '',
    financingNeeded: false,
    tradeInInterest: false,
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  // Separate state for duplicate-phone 409 so it renders as a prominent
  // amber warning banner (not the tiny red generic-error line) and blocks
  // re-submission until the rep either closes the modal or changes the
  // phone number to try a different one.
  const [dupError, setDupError] = useState<string | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  // BUG-053/055: real-time pincode/city/state mismatch error.
  const pincodeMatchError = usePincodeMatchError(form.pincode, form.city, form.state);

  // Per-field validation. Required fields are name + phone + email +
  // listingId + source. City / state / pincode / budget / message are
  // optional but validated when present. Errors are computed on every
  // render so they update as the rep types — but only RENDERED after
  // the first submit attempt (showFieldErrors gate) so the rep doesn't
  // see red on every field as soon as the modal opens.
  const fieldErrors = useMemo(
    () =>
      buildFieldErrors(form, {
        listingId: validators.requiredSelect('a motorcycle listing'),
        name: validators.name,
        phone: validators.phone,
        email: validators.email,
        // QA BUG-020: State / City / Location are all mandatory on the
        // buyer enquiry form (consistent with the Seller modal). The
        // submit gate (`hasErrors`) blocks until each carries a value.
        state: validators.requiredSelect('a state'),
        city: validators.city,
        location: validators.requiredSelect('a location'),
        pincode: validators.optionalPincode,
        source: validators.requiredSelect('a lead source'),
        budget: validators.intInRange(0, 100_000_000, 'Budget'),
        message: validators.message,
      }),
    [form],
  );
  const hasErrors = Object.keys(fieldErrors).length > 0;
  const errFor = (k: keyof typeof form) =>
    showFieldErrors ? fieldErrors[k] : undefined;

  // Pull this dealer's own listings so the rep can attach the lead to a bike.
  // Include EVERY listing the dealer has except permanently-removed rows —
  // QA #10: dropdown was previously incomplete, missing SOLD bikes that the
  // rep needed to log post-sale follow-up leads against. Including
  // ACTIVE/DRAFT/DEACTIVATED/SOLD covers every "stock" the dealer can
  // legitimately reference. REMOVED stays excluded (those rows are
  // soft-deleted and shouldn't surface in any forward-looking flow).
  const listings = useQuery({
    queryKey: ['dealer-listings', 'enquiry-form'],
    queryFn: () => api<Array<DealerListingOption & { status: string }>>('/dealer/listings'),
    select: (rows) =>
      rows
        .filter((r) => r.status !== 'REMOVED')
        .map((r) => ({
          id: r.id,
          vin: r.vin,
          modelName: r.modelName,
          year: r.year,
          status: r.status,
        })),
  });

  const submit = useMutation({
    mutationFn: () => {
      // Strip empty-string optionals so the Zod input validates without
      // tripping on `""` values where it expects undefined.
      const body: Record<string, unknown> = {
        listingId: form.listingId,
        name: form.name,
        phone: toApiPhone(form.phone),
        email: form.email,
        source: form.source,
        financingNeeded: form.financingNeeded,
        tradeInInterest: form.tradeInInterest,
      };
      if (form.city.trim()) body.city = form.city.trim();
      if (form.state) body.state = form.state;
      if (form.pincode.trim()) body.pincode = form.pincode.trim();
      if (form.budget) body.budget = Number(form.budget);
      if (form.visitPreference) body.visitPreference = form.visitPreference;
      if (form.bestTimeToCall) body.bestTimeToCall = form.bestTimeToCall;
      if (form.message.trim()) body.message = form.message.trim();
      return api<{ id: string }>('/dealer/leads/buyer', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads', 'buyer'] });
      qc.invalidateQueries({ queryKey: ['dealer-leads', 'buyer', 'sidebar'] });
      onClose();
    },
    onError: (e) => {
      if (
        e instanceof ApiError &&
        (e.code === 'ENQUIRY_ALREADY_OPEN' || e.code === 'BUYER_ENQUIRY_ALREADY_OPEN')
      ) {
        // QA-spec: buyer dedup is (listing + phone), so the duplicate
        // condition is the BIKE — banner copy reflects that the rep
        // must pick a different bike (or close the existing lead).
        setDupError(
          // QA spec: unified copy across customer + dealer surfaces.
          // Same VIN/listing + same mobile + non-terminal status = block.
          'You already have an active enquiry for this motorcycle. Our dealer team will contact you shortly.',
        );
        setError(null);
      } else {
        setError(e instanceof ApiError ? e.message : 'Failed to add lead');
        setDupError(null);
      }
    },
  });

  return (
    <ModalShell title="Log Buyer Enquiry" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setDupError(null);
          // First submit attempt switches on field-level errors. After
          // that they stay visible (and update live) until the rep
          // either fixes them or closes the modal.
          setShowFieldErrors(true);
          if (hasErrors) return;
          submit.mutate();
        }}
        className="space-y-5 [&_input]:!border-[1.5px] [&_input]:!border-hd-black [&_select]:!border-[1.5px] [&_select]:!border-hd-black [&_textarea]:!border-[1.5px] [&_textarea]:!border-hd-black"
        noValidate
      >
        {/* Duplicate-phone warning — renders as a prominent amber banner at
            the top of the form so the rep can't miss it. Clears when they
            change the phone number and attempt a fresh submit. */}
        {dupError && (
          <div className="bg-warning/10 border border-warning/60 p-4 flex items-start gap-3">
            <span className="shrink-0 mt-0.5 text-warning text-lg leading-none" aria-hidden>⚠</span>
            <div className="min-w-0">
              <p className="font-subhead uppercase tracking-subhead text-xs text-warning mb-1">
                Duplicate Bike Entry
              </p>
              <p className="text-sm text-text-on-light leading-relaxed">{dupError}</p>
            </div>
          </div>
        )}
        <FormSection kicker="1" label="Motorcycle of Interest">
          <Field label="Listing" required error={errFor('listingId')}>
            <Select
              value={form.listingId}
              onChange={(e) => {
                // Buyer dedup is (listing + phone) — banner must clear
                // only when the rep picks a DIFFERENT bike, not when
                // they edit phone/email/etc. Save stays disabled until
                // listing actually changes.
                setDupError(null);
                setForm((f) => ({ ...f, listingId: e.target.value }));
              }}
              aria-invalid={Boolean(errFor('listingId'))}
            >
              <option value="">Select a motorcycle…</option>
              {listings.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.year} {l.modelName} · {l.vin.slice(-5)}
                  {l.status && l.status !== 'ACTIVE' ? ` · ${l.status}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        <FormSection kicker="2" label="Buyer Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full Name" required error={errFor('name')}>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: sanitizeAlpha(e.target.value) }))}
                maxLength={100}
                aria-invalid={Boolean(errFor('name'))}
              />
            </Field>
            <Field label="Phone (+91…)" required error={errFor('phone')}>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: normalisePhone(e.target.value) }))}
                maxLength={14}
                inputMode="tel"
                placeholder="+91 9812345678"
                aria-invalid={Boolean(errFor('phone'))}
              />
            </Field>
          </div>
          {/* QA: Email + Location share a single row (50/50 on sm+,
              stacked on mobile) — matches the Customer Portal enquiry
              forms. Location uses the same geolocation autocomplete
              pattern (BigDataCloud reverse-geocode); a successful
              resolve auto-fills the State / City / PIN code row below
              so the rep doesn't have to re-type. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" required error={errFor('email')}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                maxLength={254}
                aria-invalid={Boolean(errFor('email'))}
              />
            </Field>
            {/* QA BUG-020: Location is mandatory on the buyer enquiry
                form (consistent with the Seller modal + Customer
                Portal enquiry forms). */}
            <Field label="Location" required error={errFor('location')}>
              <LocationInput
                value={form.location}
                onChange={(v) => setForm((f) => ({ ...f, location: v }))}
                onResolved={({ state, city, pincode }) =>
                  setForm((f) => ({
                    ...f,
                    state: state || f.state,
                    city: city || f.city,
                    pincode: pincode || f.pincode,
                  }))
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* QA BUG-020: State is mandatory on the buyer enquiry
                form (mirrors Seller modal BUG-019). */}
            <Field label="State" required error={errFor('state')}>
              <Select
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                aria-invalid={Boolean(errFor('state'))}
              >
                <option value="">— Select —</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            {/* QA BUG-020: City is mandatory on the buyer enquiry form
                (was previously validators.optionalCity → no asterisk,
                no submit block). */}
            <Field label="City" required error={errFor('city')}>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: sanitizeAlpha(e.target.value) }))}
                maxLength={60}
                placeholder="e.g. Gurgaon"
                aria-invalid={Boolean(errFor('city'))}
              />
            </Field>
            {/* BUG-053/055: pincode-vs-city/state mismatch shown inline
                in real time. Existing per-field validator stays as the
                primary error, pincodeMatchError as the fallback so a
                bad-pincode (e.g. starts with 0) still takes precedence. */}
            <Field label="PIN code" error={errFor('pincode') ?? pincodeMatchError ?? undefined}>
              <Input
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: sanitizeDigits(e.target.value, 6) }))}
                maxLength={6}
                inputMode="numeric"
                placeholder="122001"
                aria-invalid={Boolean(errFor('pincode'))}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection kicker="3" label="Lead Qualification">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="How did the lead come in?" required error={errFor('source')}>
              <Select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                aria-invalid={Boolean(errFor('source'))}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stated budget (₹, optional)" error={errFor('budget')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={50_000}
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="e.g. 1500000"
                aria-invalid={Boolean(errFor('budget'))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Visit preference">
              <Select
                value={form.visitPreference}
                onChange={(e) => setForm((f) => ({ ...f, visitPreference: e.target.value }))}
              >
                {VISIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Best time to call">
              <Select
                value={form.bestTimeToCall}
                onChange={(e) => setForm((f) => ({ ...f, bestTimeToCall: e.target.value }))}
              >
                {CALL_WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CheckboxField
              checked={form.financingNeeded}
              onChange={(v) => setForm((f) => ({ ...f, financingNeeded: v }))}
              label="Financing / EMI needed"
            />
            <CheckboxField
              checked={form.tradeInInterest}
              onChange={(v) => setForm((f) => ({ ...f, tradeInInterest: v }))}
              label="Has a motorcycle to trade in"
            />
          </div>
        </FormSection>

        <FormSection kicker="4" label="Notes">
          <Field label="Conversation notes (optional)" error={errFor('message')}>
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              maxLength={1000}
              placeholder="Walked in 11 AM, asked about EMI options, wants to bring spouse for second visit…"
              aria-invalid={Boolean(errFor('message'))}
              className="w-full bg-hd-white border-[1.5px] border-hd-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
            />
          </Field>
        </FormSection>

        {showFieldErrors && hasErrors && !error && !dupError && (
          <p className="text-xs text-danger">
            Please fix the highlighted fields above before submitting.
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {/* Disabled while duplicate warning is showing — rep must
              resolve the existing lead (or change the phone) first. */}
          <Button type="submit" variant="primary" disabled={submit.isPending || Boolean(dupError)}>
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
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    username: '',
    bikeModel: '',
    vin: '',
    year: '',
    kmsDriven: '',
    mileage: '',
    owners: '1',
    colour: '',
    askingPrice: '',
    // QA: ship the trailing space in the default so the field opens
    // already formatted as "+91 " rather than "+91" (matches normalisePhone).
    phone: '+91 ',
    email: '',
    location: '', // QA: neighbourhood free-text; locator icon fills city/state/pincode
    city: '',
    state: '',
    pincode: '',
    source: 'walk-in',
    bestTimeToCall: '',
    rcAvailable: false,
    serviceHistoryAvailable: false,
    insuranceValidUntil: '',
    loanOutstanding: false,
    modifications: '',
    reasonForSelling: '',
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  // BUG-053/055: real-time pincode/city/state mismatch error.
  const pincodeMatchError = usePincodeMatchError(form.pincode, form.city, form.state);

  // Per-field validation. Required: username + phone + email + city +
  // bikeModel + vin + source. Year / kms / owner / asking-price are
  // optional with numeric range checks; pincode optional with format
  // check; message / colour / modifications / reasonForSelling
  // optional with trim + max-length checks.
  const fieldErrors = useMemo(() => {
    const currentYearLocal = new Date().getFullYear();
    return buildFieldErrors(form, {
      username: validators.name,
      phone: validators.phone,
      email: validators.email,
      // QA BUG-019: State is mandatory on seller enquiries (consistent
      // with City, which is already required). Surfaces as a red
      // asterisk on the label + blocks submit until a value is picked.
      //
      // POST-AUDIT (re-verify pass): Location was missing from the
      // validator block — visual + validator drift vs. the Buyer modal
      // (which gates all three: state / city / location). Added below
      // so the Seller form enforces the same trio and the * on the
      // Location label below isn't a lie.
      state: validators.requiredSelect('a state'),
      city: validators.city,
      location: validators.requiredSelect('a location'),
      pincode: validators.optionalPincode,
      bikeModel: validators.requiredSelect('the motorcycle model'),
      vin: validators.vinOptional,
      source: validators.requiredSelect('a lead source'),
      year: validators.intInRange(1903, currentYearLocal, 'Year'),
      kmsDriven: validators.intInRange(0, 500_000, 'KMs driven'),
      // Decimals allowed (e.g. 18.5 km/l).
      mileage: validators.numberInRange(5, 80, 'Mileage'),
      askingPrice: validators.intInRange(0, 100_000_000, 'Asking price'),
      colour: validators.optionalCity, // letters + spaces only
      message: validators.message,
      modifications: validators.message,
      reasonForSelling: validators.message,
    });
  }, [form]);
  const hasErrors = Object.keys(fieldErrors).length > 0;
  const errFor = (k: keyof typeof form) =>
    showFieldErrors ? fieldErrors[k] : undefined;

  const submit = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        username: form.username,
        bikeModel: form.bikeModel,
        vin: form.vin,
        phone: toApiPhone(form.phone),
        email: form.email,
        city: form.city,
        source: form.source,
        rcAvailable: form.rcAvailable,
        serviceHistoryAvailable: form.serviceHistoryAvailable,
        loanOutstanding: form.loanOutstanding,
      };
      if (form.state) body.state = form.state;
      if (form.pincode.trim()) body.pincode = form.pincode.trim();
      if (form.year) body.year = Number(form.year);
      if (form.kmsDriven) body.kmsDriven = Number(form.kmsDriven);
      if (form.owners) body.owners = Number(form.owners);
      if (form.colour.trim()) body.colour = form.colour.trim();
      if (form.askingPrice) body.askingPrice = Number(form.askingPrice);
      if (form.bestTimeToCall) body.bestTimeToCall = form.bestTimeToCall;
      if (form.insuranceValidUntil) body.insuranceValidUntil = form.insuranceValidUntil;
      if (form.modifications.trim()) body.modifications = form.modifications.trim();
      if (form.reasonForSelling.trim()) body.reasonForSelling = form.reasonForSelling.trim();
      // Mileage isn't yet a first-class column on the seller lead model;
      // until that migration ships, prepend it to the freeform message so
      // the dealer doesn't lose the value the rep keyed in. Trims cleanly
      // when message is otherwise empty.
      const mileageNote = form.mileage ? `Mileage: ${form.mileage} km/l` : '';
      const noteParts = [mileageNote, form.message.trim()].filter(Boolean);
      if (noteParts.length > 0) body.message = noteParts.join(' — ');
      return api<{ id: string }>('/dealer/leads/trade-in', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads', 'trade-in'] });
      // Mirror the buyer modal — sidebar count chip on Seller Enquiries
      // wasn't moving until the next refetch tick (QA BUG-12).
      qc.invalidateQueries({ queryKey: ['dealer-leads', 'trade-in', 'sidebar'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SELLER_ENQUIRY_ALREADY_OPEN') {
        setDupError(
          'An enquiry for this bike (VIN) is already open. Continue working the existing lead, or mark it closed to log a fresh one.',
        );
        setError(null);
      } else if (e instanceof ApiError && e.code === 'SELLER_VIN_STILL_LISTED') {
        setDupError(
          'This bike already has a closed enquiry and is still listed on the platform. A new enquiry can only be raised once the bike is marked Sold or Removed.',
        );
        setError(null);
      } else {
        setError(e instanceof ApiError ? e.message : 'Failed to add lead');
        setDupError(null);
      }
    },
  });

  return (
    <ModalShell title="Log Seller Enquiry" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setDupError(null);
          setShowFieldErrors(true);
          if (hasErrors) return;
          submit.mutate();
        }}
        className="space-y-5 [&_input]:!border-[1.5px] [&_input]:!border-hd-black [&_select]:!border-[1.5px] [&_select]:!border-hd-black [&_textarea]:!border-[1.5px] [&_textarea]:!border-hd-black"
        noValidate
      >
        {dupError && (
          <div className="bg-warning/10 border border-warning/60 p-4 flex items-start gap-3">
            <span className="shrink-0 mt-0.5 text-warning text-lg leading-none" aria-hidden>⚠</span>
            <div className="min-w-0">
              <p className="font-subhead uppercase tracking-subhead text-xs text-warning mb-1">
                Duplicate VIN Entry
              </p>
              <p className="text-sm text-text-on-light leading-relaxed">{dupError}</p>
            </div>
          </div>
        )}
        <FormSection kicker="1" label="Seller Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full Name" required error={errFor('username')}>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: sanitizeAlpha(e.target.value) }))}
                maxLength={100}
                aria-invalid={Boolean(errFor('username'))}
              />
            </Field>
            <Field label="Phone (+91…)" required error={errFor('phone')}>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: normalisePhone(e.target.value) }))}
                maxLength={14}
                inputMode="tel"
                placeholder="+91 9812345678"
                aria-invalid={Boolean(errFor('phone'))}
              />
            </Field>
          </div>
          {/* QA: Email + Location share a single row (50/50 on sm+,
              stacked on mobile) — matches the Customer Portal enquiry
              forms. Locator icon → auto-fills State / City / PIN
              code below. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" required error={errFor('email')}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                maxLength={254}
                aria-invalid={Boolean(errFor('email'))}
              />
            </Field>
            {/* Post-audit: Location is now required on the Seller form
                to match the Buyer modal — same validator wired above. */}
            <Field label="Location" required error={errFor('location')}>
              <LocationInput
                value={form.location}
                onChange={(v) => setForm((f) => ({ ...f, location: v }))}
                onResolved={({ state, city, pincode }) =>
                  setForm((f) => ({
                    ...f,
                    state: state || f.state,
                    city: city || f.city,
                    pincode: pincode || f.pincode,
                  }))
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* QA BUG-019: State is mandatory (mirrors City). Asterisk
                via required prop; inline error via errFor('state'). */}
            <Field label="State" required error={errFor('state')}>
              <Select
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                aria-invalid={Boolean(errFor('state'))}
              >
                <option value="">— Select —</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="City" required error={errFor('city')}>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: sanitizeAlpha(e.target.value) }))}
                maxLength={60}
                placeholder="e.g. Gurgaon"
                aria-invalid={Boolean(errFor('city'))}
              />
            </Field>
            {/* BUG-053/055: pincode-vs-city/state mismatch shown inline
                in real time. Existing per-field validator stays as the
                primary error, pincodeMatchError as the fallback so a
                bad-pincode (e.g. starts with 0) still takes precedence. */}
            <Field label="PIN code" error={errFor('pincode') ?? pincodeMatchError ?? undefined}>
              <Input
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: sanitizeDigits(e.target.value, 6) }))}
                maxLength={6}
                inputMode="numeric"
                placeholder="122001"
                aria-invalid={Boolean(errFor('pincode'))}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection kicker="2" label="Motorcycle Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* QA BUG-048: free-text "Model / Year line" replaced with
                a searchable dropdown anchored to the approved H-D model
                master list (apps/web-dealer/src/lib/models.ts). Native
                <input list>+<datalist> gives type-to-filter behaviour
                with zero extra deps. Label renamed "Select Model" per
                spec; on blur we also normalise + reject any free-text
                that doesn't match the catalog so data quality is locked
                regardless of how the rep typed. */}
            <Field label="Select Model" required error={errFor('bikeModel')}>
              <Input
                list="hd-model-list"
                value={form.bikeModel}
                onChange={(e) => setForm((f) => ({ ...f, bikeModel: e.target.value }))}
                onBlur={(e) => {
                  const typed = e.target.value.trim();
                  // Allow empty (the required validator handles that).
                  // Reject anything not in the catalog by clearing the
                  // field — the validator then surfaces the required
                  // error so the rep is forced to pick from the list.
                  if (typed && !HD_MODELS_FLAT.includes(typed)) {
                    setForm((f) => ({ ...f, bikeModel: '' }));
                  }
                }}
                placeholder="Start typing — e.g. Street Glide"
                aria-invalid={Boolean(errFor('bikeModel'))}
                autoComplete="off"
              />
              <datalist id="hd-model-list">
                {HD_MODELS_FLAT.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="VIN Number" error={errFor('vin')}>
              <Input
                value={form.vin.toUpperCase()}
                onChange={(e) => {
                  setDupError(null);
                  setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }));
                }}
                maxLength={17}
                placeholder="Optional — enter if available"
                className="font-mono"
                aria-invalid={Boolean(errFor('vin'))}
              />
            </Field>
          </div>
          {/* QA: restructured from a single 4-col row to two balanced rows
              so the new Mileage field fits without shrinking inputs.
              Row 1 — three numeric measurements (Year / KMs / Mileage).
              Row 2 — two descriptive attributes (Owner / Colour). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Year" error={errFor('year')}>
              <Input
                type="number"
                min={1903}
                max={currentYear}
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                placeholder={String(currentYear - 3)}
                aria-invalid={Boolean(errFor('year'))}
              />
            </Field>
            <Field label="KMs driven" error={errFor('kmsDriven')}>
              <Input
                type="number"
                min={0}
                step={500}
                value={form.kmsDriven}
                onChange={(e) => setForm((f) => ({ ...f, kmsDriven: e.target.value }))}
                placeholder="e.g. 12500"
                aria-invalid={Boolean(errFor('kmsDriven'))}
              />
            </Field>
            <Field label="Mileage (km/l)" error={errFor('mileage')}>
              <Input
                type="number"
                min={5}
                max={80}
                step={0.1}
                value={form.mileage}
                onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value }))}
                placeholder="e.g. 18.5"
                aria-invalid={Boolean(errFor('mileage'))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Owner">
              <Select
                value={form.owners}
                onChange={(e) => setForm((f) => ({ ...f, owners: e.target.value }))}
              >
                <option value="1">1st owner</option>
                <option value="2">2nd owner</option>
                <option value="3">3rd owner</option>
                <option value="4">4th+</option>
              </Select>
            </Field>
            <Field label="Colour" error={errFor('colour')}>
              <Input
                value={form.colour}
                onChange={(e) => setForm((f) => ({ ...f, colour: e.target.value }))}
                maxLength={60}
                placeholder="e.g. Vivid Black"
                aria-invalid={Boolean(errFor('colour'))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CheckboxField
              checked={form.rcAvailable}
              onChange={(v) => setForm((f) => ({ ...f, rcAvailable: v }))}
              label="RC available"
            />
            <CheckboxField
              checked={form.serviceHistoryAvailable}
              onChange={(v) => setForm((f) => ({ ...f, serviceHistoryAvailable: v }))}
              label="Service history available"
            />
          </div>
        </FormSection>

        <FormSection kicker="3" label="Lead Qualification">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="How did the lead come in?" required error={errFor('source')}>
              <Select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                aria-invalid={Boolean(errFor('source'))}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Asking price (₹, optional)" error={errFor('askingPrice')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={10_000}
                value={form.askingPrice}
                onChange={(e) => setForm((f) => ({ ...f, askingPrice: e.target.value }))}
                placeholder="e.g. 950000"
                aria-invalid={Boolean(errFor('askingPrice'))}
              />
            </Field>
          </div>
          <Field label="Best time to call">
            <Select
              value={form.bestTimeToCall}
              onChange={(e) => setForm((f) => ({ ...f, bestTimeToCall: e.target.value }))}
            >
              {CALL_WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        <FormSection kicker="4" label="Motorcycle Condition & Notes">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Insurance valid until (optional)">
              <Input
                type="date"
                value={form.insuranceValidUntil}
                onChange={(e) => setForm((f) => ({ ...f, insuranceValidUntil: e.target.value }))}
              />
            </Field>
            <CheckboxField
              checked={form.loanOutstanding}
              onChange={(v) => setForm((f) => ({ ...f, loanOutstanding: v }))}
              label="Loan outstanding on the motorcycle"
            />
          </div>
          <Field label="Accessories / modifications (optional)" error={errFor('modifications')}>
            <Input
              value={form.modifications}
              onChange={(e) => setForm((f) => ({ ...f, modifications: e.target.value }))}
              maxLength={500}
              placeholder="HOG sticker, V&H exhaust, panniers, top-box…"
              aria-invalid={Boolean(errFor('modifications'))}
            />
          </Field>
          <Field label="Reason for selling (optional)" error={errFor('reasonForSelling')}>
            <Input
              value={form.reasonForSelling}
              onChange={(e) => setForm((f) => ({ ...f, reasonForSelling: e.target.value }))}
              maxLength={500}
              placeholder="Upgrading to a touring model, relocating abroad, etc."
              aria-invalid={Boolean(errFor('reasonForSelling'))}
            />
          </Field>
          <Field label="Conversation notes (optional)" error={errFor('message')}>
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              maxLength={1000}
              placeholder="Walked in 3 PM, has paperwork ready, prefers WhatsApp follow-up…"
              aria-invalid={Boolean(errFor('message'))}
              className="w-full bg-hd-white border-[1.5px] border-hd-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
            />
          </Field>
        </FormSection>

        {showFieldErrors && hasErrors && !error && !dupError && (
          <p className="text-xs text-danger">
            Please fix the highlighted fields above before submitting.
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submit.isPending || Boolean(dupError)}>
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
  // Backdrop click previously called `onClose` directly which silently
  // wiped a fully-filled 20-field form on a misclick. Now we confirm
  // before closing if the modal contains any user-typed input — the
  // window.confirm prompt is annoying enough to be a real safeguard but
  // not so heavyweight that you can't dismiss an empty modal in one click.
  const closeWithConfirm = () => {
    // Use Array.from(...).filter — iterator-helper `.values().filter().toArray()`
    // is ES2025 and crashes at runtime on TS targeting ES2022.
    const fields = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        '[data-modal-form] input, [data-modal-form] textarea, [data-modal-form] select',
      ),
    );
    const hasInput = fields.some((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        return (el as HTMLInputElement).checked;
      }
      // Skip the always-prefilled +91 country code on phone fields.
      const raw = el.value?.trim() ?? '';
      return Boolean(raw) && raw !== '+91' && raw !== '1';
    });
    if (hasInput && !window.confirm('Discard this enquiry? Your unsaved changes will be lost.')) {
      return;
    }
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-50 bg-hd-black/50 flex items-center justify-center px-3 sm:px-4 py-6 overflow-y-auto"
      onClick={closeWithConfirm}
    >
      <div
        data-modal-form
        className="bg-hd-white border-[1.5px] border-hd-black max-w-3xl w-full p-4 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-headline text-2xl tracking-headline uppercase text-text-on-light">
            {title}
          </h2>
          <button
            type="button"
            onClick={closeWithConfirm}
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

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  /** Renders a small red asterisk after the label so users learn the
   *  field is required up-front instead of via a submit error. */
  required?: boolean;
  /** Per-field validation error from the validators helper. When set,
   *  renders red text under the input. */
  error?: string;
  /** Optional grey caption below the input, suppressed when error is set. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </span>
      {children}
      {error ? (
        <span className="block mt-1 text-[11px] text-danger" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="block mt-1 text-[11px] text-gray-500">{hint}</span>
      )}
    </label>
  );
}

function CheckboxField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none border border-gray-200 rounded px-3 py-2.5 hover:border-hd-orange transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-hd-orange"
      />
      <span className="text-sm text-text-on-light">{label}</span>
    </label>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[10px] font-subhead uppercase tracking-subhead text-gray-500 ${className}`}
    >
      {children}
    </th>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-top ${className}`}>{children}</td>;
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
      {LEAD_STAGE_LABELS[status]}
    </Badge>
  );
}
