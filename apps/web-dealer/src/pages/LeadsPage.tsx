import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Input, Select } from '@hd-cpo/ui';
import { LEAD_STAGE_LABELS } from '@hd-cpo/types';
import { api, ApiError } from '../lib/api';
import { formatLeadId, type LeadKind } from '../lib/leadId';
import { validators, buildFieldErrors } from '../lib/formRules';

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

const KIND_META: Record<Kind, { title: string; subtitle: string; orangeWord: string; addLabel: string }> = {
  buyer: {
    title: 'Buyer Enquiries',
    subtitle:
      "Buyers who've submitted enquiries against your listed motorcycles. Click + Add Enquiry to log a phone call or walk-in.",
    orangeWord: 'Enquiries',
    addLabel: '+ Add Buyer Enquiry',
  },
  'trade-in': {
    title: 'Seller Enquiries',
    subtitle:
      'H-D owners looking to sell. Walk through inspection, docs, and admin approval to make the motorcycle live.',
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

  const { data, isLoading } = useQuery({
    queryKey: ['leads', kind],
    queryFn: () => api<LeadRow[]>(`/dealer/leads/${kind}`),
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
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

      {/* Layout collapses 9 cols → 5 by stacking related fields:
            Lead    = ID (caption) + name (heading)
            Contact = phone (mono) + email (muted)
            Bike    = model (+ VIN below for trade-in)
            Status  = status badge + received date below
          Wider cells beat narrow ones for scan-ability — easier than reading
          across 9 thin columns. */}
      <div className="bg-hd-white border border-gray-200 mt-6 overflow-x-auto rounded-card">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/80">
            <tr>
              <Th>Lead</Th>
              <Th>Contact</Th>
              <Th>{kind === 'buyer' ? 'Motorcycle Enquired' : 'Motorcycle Offered'}</Th>
              <Th>Status</Th>
              <Th className="text-right pr-4">
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  No {kind} leads yet — click <span className="font-subhead uppercase tracking-subhead text-hd-orange">{meta.addLabel}</span> to log one.
                </td>
              </tr>
            )}
            {data?.map((l, idx) => (
              <tr
                key={l.id}
                className={`hover:bg-hd-orange/5 transition-colors ${
                  idx % 2 === 1 ? 'bg-gray-50/40' : ''
                }`}
              >
                <Td>
                  <div className="font-mono text-[10px] text-gray-500 leading-none mb-1">
                    {formatLeadId(kind as LeadKind, l.id, l.createdAt)}
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
                  {kind === 'trade-in' && l.vin && (
                    <div
                      className="font-mono text-[10px] text-gray-500 mt-1"
                      title={l.vin}
                    >
                      VIN · {l.vin.slice(-6)}
                    </div>
                  )}
                </Td>
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
                      year: '2-digit',
                    })}
                  </div>
                </Td>
                <Td className="text-right pr-4">
                  <Link
                    to={`/leads/${kind}/${l.id}`}
                    className="inline-block border border-gray-300 px-3 py-1.5 font-subhead uppercase tracking-subhead text-[10px] text-text-on-light hover:bg-hd-orange hover:text-hd-black hover:border-hd-orange transition rounded-card"
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
    phone: '+91',
    email: '',
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
  const [showFieldErrors, setShowFieldErrors] = useState(false);

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
        city: validators.optionalCity,
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
        phone: form.phone,
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
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add lead'),
  });

  return (
    <ModalShell title="Log Buyer Enquiry" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          // First submit attempt switches on field-level errors. After
          // that they stay visible (and update live) until the rep
          // either fixes them or closes the modal.
          setShowFieldErrors(true);
          if (hasErrors) return;
          submit.mutate();
        }}
        className="space-y-5"
        noValidate
      >
        <FormSection kicker="1" label="Motorcycle of Interest">
          <Field label="Listing" required error={errFor('listingId')}>
            <Select
              value={form.listingId}
              onChange={(e) => setForm((f) => ({ ...f, listingId: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={100}
                aria-invalid={Boolean(errFor('name'))}
              />
            </Field>
            <Field label="Phone (+91…)" required error={errFor('phone')}>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                maxLength={13}
                inputMode="tel"
                placeholder="+919812345678"
                aria-invalid={Boolean(errFor('phone'))}
              />
            </Field>
          </div>
          <Field label="Email" required error={errFor('email')}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              maxLength={254}
              aria-invalid={Boolean(errFor('email'))}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="State">
              <Select
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              >
                <option value="">— Select —</option>
                {INDIA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="City" error={errFor('city')}>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                maxLength={60}
                placeholder="e.g. Gurgaon"
                aria-invalid={Boolean(errFor('city'))}
              />
            </Field>
            <Field label="PIN code" error={errFor('pincode')}>
              <Input
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
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
              className="w-full bg-hd-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
            />
          </Field>
        </FormSection>

        {showFieldErrors && hasErrors && !error && (
          <p className="text-xs text-danger">
            Please fix the highlighted fields above before submitting.
          </p>
        )}
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
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({
    username: '',
    bikeModel: '',
    vin: '',
    year: '',
    kmsDriven: '',
    owners: '1',
    colour: '',
    askingPrice: '',
    phone: '+91',
    email: '',
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
  const [showFieldErrors, setShowFieldErrors] = useState(false);

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
      city: validators.city,
      pincode: validators.optionalPincode,
      bikeModel: validators.requiredSelect('the motorcycle model'),
      vin: validators.vin,
      source: validators.requiredSelect('a lead source'),
      year: validators.intInRange(1903, currentYearLocal, 'Year'),
      kmsDriven: validators.intInRange(0, 500_000, 'KMs driven'),
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
        phone: form.phone,
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
      if (form.message.trim()) body.message = form.message.trim();
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
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add lead'),
  });

  return (
    <ModalShell title="Log Seller Enquiry" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setShowFieldErrors(true);
          if (hasErrors) return;
          submit.mutate();
        }}
        className="space-y-5"
        noValidate
      >
        <FormSection kicker="1" label="Seller Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full Name" required error={errFor('username')}>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                maxLength={100}
                aria-invalid={Boolean(errFor('username'))}
              />
            </Field>
            <Field label="Phone (+91…)" required error={errFor('phone')}>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                maxLength={13}
                inputMode="tel"
                placeholder="+919812345678"
                aria-invalid={Boolean(errFor('phone'))}
              />
            </Field>
          </div>
          <Field label="Email" required error={errFor('email')}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              maxLength={254}
              aria-invalid={Boolean(errFor('email'))}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="State">
              <Select
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                maxLength={60}
                placeholder="e.g. Gurgaon"
                aria-invalid={Boolean(errFor('city'))}
              />
            </Field>
            <Field label="PIN code" error={errFor('pincode')}>
              <Input
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
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
            <Field label="Model / Year line" required error={errFor('bikeModel')}>
              <Input
                value={form.bikeModel}
                onChange={(e) => setForm((f) => ({ ...f, bikeModel: e.target.value }))}
                maxLength={100}
                placeholder="e.g. Street Glide Special"
                aria-invalid={Boolean(errFor('bikeModel'))}
              />
            </Field>
            <Field label="VIN" required error={errFor('vin')}>
              <Input
                value={form.vin.toUpperCase()}
                onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))}
                maxLength={17}
                placeholder="17-char VIN, no I/O/Q"
                className="font-mono"
                aria-invalid={Boolean(errFor('vin'))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              className="w-full bg-hd-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
            />
          </Field>
        </FormSection>

        {showFieldErrors && hasErrors && !error && (
          <p className="text-xs text-danger">
            Please fix the highlighted fields above before submitting.
          </p>
        )}
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
      className="fixed inset-0 z-50 bg-hd-black/50 flex items-start justify-center pt-10 p-4 overflow-y-auto"
      onClick={closeWithConfirm}
    >
      <div
        data-modal-form
        className="bg-hd-white border border-gray-200 rounded-card max-w-3xl w-full p-4 sm:p-6 shadow-2xl"
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
