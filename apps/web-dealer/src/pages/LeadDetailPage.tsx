import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from '@hd-cpo/ui';
import {
  BUYER_LEAD_PIPELINE,
  SELLER_LEAD_PIPELINE,
  LEAD_STAGE_LABELS,
  type LeadStatus,
} from '@hd-cpo/types';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { formatLeadId, type LeadKind } from '../lib/leadId';

type Kind = 'buyer' | 'trade-in';

interface LeadDetail {
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
  status: LeadStatus;
  frozenStatus?: string | null;
  createdAt: string;
  // QA: customer-submitted qualifying answers. Buyer-only fields:
  state?: string | number | null;
  source?: string | number | null;
  budget?: string | number | null;
  financingNeeded?: string | number | boolean | null;
  tradeInInterest?: string | number | boolean | null;
  visitPreference?: string | number | null;
  bestTimeToCall?: string | number | null;
  lookingFor?: string | number | null;
  // Trade-in additional fields:
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
  accessoriesInstalled?: boolean | null;
  accessories?: string[];
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
}

interface Comment {
  id: string;
  body: string;
  authorName: string;
  authorRole: 'DEALER' | 'ADMIN';
  createdAt: string;
}

/** One row from the lead's audit history. The synthetic LEAD_CREATED anchor
 *  the API injects has actorRole='SYSTEM' and metadata=null. */
interface ActivityEntry {
  id: string;
  actorRole: 'DEALER' | 'ADMIN' | 'SYSTEM';
  action: string;
  metadata: { from?: LeadStatus; to?: LeadStatus; kind?: string } | null;
  createdAt: string;
}

const KIND_LABEL: Record<Kind, string> = {
  buyer: 'Buyer Lead',
  'trade-in': 'Seller Lead',
};

// Breadcrumb back-link copy — the dealer's queue tabs are labelled "Buyer
// Enquiries" / "Seller Enquiries" (matching the buyer-facing terminology),
// so the back link reads "← Back to Buyer Enquiries" rather than the
// internal "Lead" word.
const KIND_BACK_LABEL: Record<Kind, string> = {
  buyer: 'Buyer Enquiries',
  'trade-in': 'Seller Enquiries',
};

export function LeadDetailPage() {
  const navigate = useNavigate();
  const { kind: rawKind, id } = useParams<{ kind: string; id: string }>();
  const kind = (['buyer', 'trade-in'].includes(rawKind ?? '') ? rawKind : 'buyer') as Kind;
  const dealer = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ['lead', kind, id],
    queryFn: () => api<LeadDetail>(`/dealer/leads/${kind}/${id}/detail`),
    enabled: Boolean(id),
  });

  const comments = useQuery({
    queryKey: ['lead-comments', kind, id],
    queryFn: () => api<Comment[]>(`/dealer/leads/${kind}/${id}/comments`),
    enabled: Boolean(id),
  });

  // Pipeline activity — every status transition + the implicit Lead Created
  // anchor. Backed by the API-side AuditLog table; new entries land via the
  // moveStatus.onSuccess invalidation below.
  const activity = useQuery({
    queryKey: ['lead-activity', kind, id],
    queryFn: () => api<ActivityEntry[]>(`/dealer/leads/${kind}/${id}/activity`),
    enabled: Boolean(id),
  });

  const moveStatus = useMutation({
    mutationFn: (next: LeadStatus) =>
      api(`/dealer/leads/${kind}/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', kind, id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      // Pipeline activity gains a new row on every successful transition.
      qc.invalidateQueries({ queryKey: ['lead-activity', kind, id] });
      // The DealerShell sidebar uses its own cache key for the badge
      // counts; invalidating just `['leads']` left the sidebar showing
      // stale "N new" pills until manual refresh. Hit both buyer + seller
      // sidebar keys (cheap; React Query dedupes) so any status change
      // reflects in the nav immediately.
      qc.invalidateQueries({ queryKey: ['dealer-leads', 'buyer', 'sidebar'] });
      qc.invalidateQueries({ queryKey: ['dealer-leads', 'trade-in', 'sidebar'] });
    },
  });

  // ── Accessories state (seller leads only) ─────────────────────────────
  // Seeded from the lead detail once it loads; kept in component state so
  // the dealer can edit without re-fetching. `null` means "not yet answered".
  const [accInstalled, setAccInstalled] = useState<boolean | null>(null);
  const [accList, setAccList] = useState<string[]>([]);
  const [accInput, setAccInput] = useState('');
  const accInputRef = useRef<HTMLInputElement>(null);
  const [accSaved, setAccSaved] = useState(false);
  useEffect(() => {
    if (detail.data && detail.data.kind === 'trade-in') {
      setAccInstalled(detail.data.accessoriesInstalled ?? null);
      setAccList(detail.data.accessories ?? []);
    }
  }, [detail.data]);
  useEffect(() => {
    if (!accSaved) return;
    const t = window.setTimeout(() => setAccSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [accSaved]);

  const saveAccessories = useMutation({
    mutationFn: () =>
      api(`/dealer/leads/trade-in/${id}/accessories`, {
        method: 'PATCH',
        body: JSON.stringify({
          accessoriesInstalled: accInstalled ?? false,
          accessories: accList,
        }),
      }),
    onSuccess: () => {
      setAccSaved(true);
      qc.invalidateQueries({ queryKey: ['lead', kind, id] });
    },
  });

  const [draft, setDraft] = useState('');
  // Pipeline Activity collapse state (QA #1). Default to expanded so the
  // first view of a lead surfaces the full audit trail; collapse persists
  // for the lifetime of this mount only.
  const [activityExpanded, setActivityExpanded] = useState(true);
  // QA: COPY REF used to be silent. Track whether the copy just landed
  // so we can swap the button label to "Copied!" and surface a brief
  // toast confirmation. Auto-clears after 2s.
  const [copiedRef, setCopiedRef] = useState(false);
  useEffect(() => {
    if (!copiedRef) return;
    const t = window.setTimeout(() => setCopiedRef(false), 2000);
    return () => window.clearTimeout(t);
  }, [copiedRef]);
  const addComment = useMutation({
    mutationFn: () =>
      api(`/dealer/leads/${kind}/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: draft.trim() }),
      }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['lead-comments', kind, id] });
    },
  });

  if (detail.isLoading) {
    return (
      <div className="px-8 py-10 text-gray-500 text-sm">Loading lead…</div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div className="px-8 py-10">
        <p className="text-danger text-sm">Lead not found.</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate(-1)}>
          ← Back
        </Button>
      </div>
    );
  }

  const lead = detail.data;
  // Pipeline-aware UI — the progress bar and dropdown are derived from the
  // SAME `basePipeline` so they can never disagree. DEAD and LOST are
  // alt-terminals (not pipeline stages); when the lead is in either, we
  // surface a terminal banner above the bar instead of trying to render
  // them as numbered steps.
  const basePipeline =
    kind === 'buyer' ? BUYER_LEAD_PIPELINE : SELLER_LEAD_PIPELINE;
  const isTerminal = lead.status === 'DEAD' || lead.status === 'LOST';
  // QA: when the lead is in a terminal state (Not Interested), freeze
  // the pipeline display at the last stage reached BEFORE the terminal
  // transition — `frozenStatus` is captured by updateLeadStatus into
  // notes.frozenStatus. Falls back to NEW (idx 0) so we never render
  // a fully grey bar on legacy rows that pre-date the snapshot.
  const frozenStatus = (lead as { frozenStatus?: string | null }).frozenStatus ?? null;
  const currentIdx = isTerminal
    ? (frozenStatus ? basePipeline.indexOf(frozenStatus as never) : -1)
    : basePipeline.indexOf(lead.status as never);
  // Dropdown offers every stage on the pipeline. Dealers can walk a lead
  // backwards ("buyer came back after ghosting", "Closed by mistake") —
  // the API allows any transition within the kind's pipeline. Current
  // status sits first so the select reads "<current>" by default and a
  // cancelled change reverts cleanly. Legacy DEAD/LOST rows keep their
  // status displayed (the badge still renders) but the UI no longer
  // offers them as new options.
  const dropdownStatuses: LeadStatus[] = [
    lead.status,
    ...basePipeline.filter((s) => s !== lead.status),
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* QA: transient toast confirming COPY REF succeeded. Fixed to the
          bottom-right so it stays out of the dealer's reading flow while
          still giving an unmissable confirmation. */}
      {copiedRef && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-hd-black text-hd-white px-4 py-3 shadow-lg font-subhead uppercase tracking-subhead text-xs flex items-center gap-2"
        >
          <Icon path="M5 12l5 5L20 7" />
          Reference ID copied
        </div>
      )}
      <Link
        to={`/enquiries/${kind}`}
        className="inline-flex items-center text-xs font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition border border-gray-300 px-3 py-1.5"
      >
        ← Back to {KIND_BACK_LABEL[kind]}
      </Link>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 mt-6">
        {/* Main column */}
        <div className="space-y-6 min-w-0">
          {/* Lead header */}
          <header className="bg-hd-white border border-gray-200 p-6">
            <div className="flex flex-wrap items-baseline gap-3 text-xs">
              <span className="font-mono text-text-on-light">
                {formatLeadId(kind as LeadKind, lead.id, lead.createdAt)}
              </span>
              <span className="font-subhead uppercase tracking-subhead text-gray-500">
                {KIND_LABEL[kind]}
              </span>
              <StatusBadge status={lead.status} />
            </div>
            <h1 className="font-headline text-3xl tracking-headline uppercase mt-3">
              {lead.name}
            </h1>
            <dl className="mt-4 grid sm:grid-cols-3 gap-4 text-sm">
              <Field label="Phone">
                <a
                  href={`tel:${lead.phone.replace(/\s+/g, '')}`}
                  className="font-mono text-xs text-text-on-light hover:text-hd-orange"
                >
                  {lead.phone}
                </a>
              </Field>
              <Field label="Email">
                <a
                  href={`mailto:${lead.email}`}
                  className="font-mono text-xs text-text-on-light hover:text-hd-orange break-all"
                >
                  {lead.email}
                </a>
              </Field>
              <Field label="City">{lead.city ?? '—'}</Field>
            </dl>

            {/* Quick action row — click-to-call, click-to-email, copy-ref */}
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={`tel:${lead.phone.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1.5 bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 hover:brightness-110 transition"
              >
                <Icon path="M3 5a2 2 0 012-2h2.5a1 1 0 011 .76l1 4a1 1 0 01-.27.95l-1.5 1.5a11 11 0 005 5l1.5-1.5a1 1 0 01.95-.27l4 1a1 1 0 01.76 1V19a2 2 0 01-2 2A18 18 0 013 5z" />
                Call
              </a>
              <a
                href={`mailto:${lead.email}?subject=Re: Your H-D Certified Enquiry ${formatLeadId(kind as LeadKind, lead.id, lead.createdAt)}`}
                className="inline-flex items-center gap-1.5 border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 hover:bg-hd-black hover:text-hd-white transition"
              >
                <Icon path="M3 7l9 6 9-6M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l2-2h14l2 2" />
                Email
              </a>
              <button
                type="button"
                onClick={async () => {
                  const ref = formatLeadId(kind as LeadKind, lead.id, lead.createdAt);
                  try {
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(ref);
                    } else {
                      // Legacy fallback for non-secure contexts or older
                      // browsers — keeps the action working anywhere.
                      const ta = document.createElement('textarea');
                      ta.value = ref;
                      ta.setAttribute('readonly', '');
                      ta.style.position = 'absolute';
                      ta.style.left = '-9999px';
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                    }
                    setCopiedRef(true);
                  } catch {
                    /* swallow — user can still copy manually */
                  }
                }}
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 border font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 transition ${
                  copiedRef
                    ? 'border-success text-success'
                    : 'border-gray-300 text-gray-700 hover:border-hd-black hover:text-hd-black'
                }`}
              >
                {copiedRef ? (
                  <Icon path="M5 12l5 5L20 7" />
                ) : (
                  <Icon path="M8 4h10a2 2 0 012 2v10M16 8H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2z" />
                )}
                {copiedRef ? 'Copied!' : 'Copy Ref'}
              </button>
            </div>
          </header>

          {/* QA: dedicated Customer Details panel — surfaces every field
              the customer submitted on their enquiry / sell-bike form.
              For BUYER leads: contact + location + qualifying answers.
              For SELLER leads: also adds bike condition + commercials. */}
          <CustomerDetailsPanel lead={lead} kind={kind} />

          {/* Accessories — dealer-side section, seller leads only.
              Optional: dealers record whether accessories are installed
              and list them. Saved into lead notes JSON via PATCH. */}
          {kind === 'trade-in' && (
            <section className="bg-hd-white border border-gray-200 p-6">
              {accSaved && (
                <div
                  role="status"
                  aria-live="polite"
                  className="fixed bottom-6 right-6 z-50 bg-hd-black text-hd-white px-4 py-3 shadow-lg font-subhead uppercase tracking-subhead text-xs flex items-center gap-2"
                >
                  <Icon path="M5 12l5 5L20 7" />
                  Accessories saved
                </div>
              )}
              <h2 className="font-headline tracking-headline uppercase text-lg">Accessories</h2>
              <p className="text-xs text-gray-500 mt-1">
                Dealer assessment — are any accessories installed on this motorcycle?
              </p>

              {/* Yes / No toggle */}
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setAccInstalled(true)}
                  className={`px-5 py-2 font-subhead uppercase tracking-subhead text-[11px] border transition ${
                    accInstalled === true
                      ? 'bg-hd-orange border-hd-orange text-hd-white'
                      : 'border-gray-300 text-gray-700 hover:border-hd-black hover:text-hd-black'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccInstalled(false);
                    setAccList([]);
                  }}
                  className={`px-5 py-2 font-subhead uppercase tracking-subhead text-[11px] border transition ${
                    accInstalled === false
                      ? 'bg-hd-black border-hd-black text-hd-white'
                      : 'border-gray-300 text-gray-700 hover:border-hd-black hover:text-hd-black'
                  }`}
                >
                  No
                </button>
              </div>

              {/* Accessories list — shown only when installed = Yes */}
              {accInstalled === true && (
                <div className="mt-4 space-y-3">
                  {/* Add row */}
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const val = accInput.trim();
                      if (!val || accList.includes(val)) return;
                      setAccList((prev) => [...prev, val]);
                      setAccInput('');
                      accInputRef.current?.focus();
                    }}
                  >
                    <input
                      ref={accInputRef}
                      type="text"
                      value={accInput}
                      onChange={(e) => setAccInput(e.target.value)}
                      placeholder="e.g. Saddlebags, Windshield, Exhaust upgrade…"
                      maxLength={200}
                      className="flex-1 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
                    />
                    <button
                      type="submit"
                      disabled={!accInput.trim()}
                      className="bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 hover:brightness-110 transition disabled:opacity-40"
                    >
                      Add
                    </button>
                  </form>

                  {/* Tag list */}
                  {accList.length > 0 && (
                    <ul className="flex flex-wrap gap-2 mt-2">
                      {accList.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-subhead"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${item}`}
                            onClick={() => setAccList((prev) => prev.filter((a) => a !== item))}
                            className="text-gray-400 hover:text-danger transition leading-none"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {accList.length === 0 && (
                    <p className="text-xs text-gray-400">No accessories added yet.</p>
                  )}
                </div>
              )}

              {/* Save button — only visible once an answer is selected */}
              {accInstalled !== null && (
                <div className="mt-5 flex justify-end">
                  <Button
                    size="sm"
                    disabled={saveAccessories.isPending}
                    onClick={() => saveAccessories.mutate()}
                  >
                    {saveAccessories.isPending ? 'Saving…' : 'Save Accessories'}
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Pipeline */}
          <section className="bg-hd-white border border-gray-200 p-6">
            <h2 className="font-headline tracking-headline uppercase text-lg">Pipeline</h2>

            {/* Terminal banner — DEAD / LOST are not pipeline stages, so when
                the lead is in either we say so explicitly above the bar. The
                bar itself stays in its un-reached / pre-terminal state so the
                dealer can still see how far the lead got before being closed,
                and can reset the status from the dropdown below. */}
            {isTerminal && (
              <div className="mt-4 bg-danger/10 border border-danger/40 p-4">
                <p className="font-subhead uppercase tracking-subhead text-sm text-danger">
                  Lead marked {LEAD_STAGE_LABELS[lead.status]}
                </p>
                <p className="text-xs text-gray-700 mt-1">
                  This lead has been closed off the pipeline. Use{' '}
                  <span className="font-subhead">Move To</span> below to reopen
                  it at any stage if needed.
                </p>
              </div>
            )}

            {/* BUG-4: legacy status not in current pipeline — e.g.
                CONTACTED / IN_PROGRESS / CLOSED on old seller leads.
                Show a hint so the rep knows to move it to a valid stage. */}
            {currentIdx === -1 && !isTerminal && (
              <div className="mt-4 bg-warning/15 border-l-4 border-warning px-3 py-2 text-[11px] text-hd-black font-subhead uppercase tracking-subhead">
                ⚠ Legacy status "{LEAD_STAGE_LABELS[lead.status as keyof typeof LEAD_STAGE_LABELS] ?? lead.status}" — please move this lead to a current pipeline stage.
              </div>
            )}
            {/* Pipeline stage bar — buyer uses 6 stages, seller uses 7.
                On mobile we collapse to a 2-col grid so the circles are
                readable; wider viewports expand to match stage count.
                Long seller labels (e.g. "Legal Transfer & Documentation")
                wrap inside each cell rather than overflowing into
                neighbours — each <li> is flex-col with break-words. */}
            <ol
              className={`mt-5 grid gap-x-2 gap-y-4 ${
                kind === 'buyer'
                  ? 'grid-cols-3 sm:grid-cols-6'
                  : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-7'
              }`}
            >
              {basePipeline.map((stage, idx) => {
                const reached = currentIdx >= 0 && idx <= currentIdx;
                const isCurrent = stage === lead.status;
                return (
                  <li key={stage} className="flex flex-col items-center text-center gap-2 min-w-0">
                    <span
                      className={`inline-flex shrink-0 h-8 w-8 items-center justify-center rounded-full border-2 font-subhead text-xs ${
                        isCurrent
                          ? 'bg-hd-orange border-hd-orange text-hd-black'
                          : reached
                          ? 'bg-hd-orange/20 border-hd-orange text-hd-orange'
                          : 'bg-hd-white border-gray-300 text-gray-400'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className={`font-subhead uppercase tracking-subhead leading-tight break-words w-full ${
                        kind === 'buyer' ? 'text-[10px]' : 'text-[9px]'
                      } ${
                        isCurrent ? 'text-text-on-light' : reached ? 'text-gray-700' : 'text-gray-400'
                      }`}
                    >
                      {LEAD_STAGE_LABELS[stage]}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-subhead uppercase tracking-subhead text-xs text-gray-500">
                Move To:
              </span>
              <select
                value={lead.status}
                onChange={(e) => {
                  const next = e.target.value as LeadStatus;
                  // Terminal moves are one-way — confirm so a misclick
                  // doesn't bury an active lead. We require a non-empty
                  // reason so managers always have an audit trail; an
                  // empty / cancelled prompt aborts the whole transition
                  // (previously the status flipped anyway).
                  if (next === 'CLOSED') {
                    const why = window.prompt(
                      `Mark this lead as ${LEAD_STAGE_LABELS[next]}? This is a terminal status — write a short reason for the audit log.`,
                      '',
                    );
                    // null = user clicked Cancel; empty = clicked OK with
                    // no text. Both abort, and we revert the select so the
                    // UI stays consistent with the un-mutated status.
                    if (!why || !why.trim()) {
                      e.target.value = lead.status;
                      return;
                    }
                    // Post the reason as a comment first, then move the
                    // status. Comment failure is non-fatal — log and
                    // continue. We bypass the addComment mutation (which
                    // reads from the textarea draft state) and call the
                    // API directly with the typed-inline reason.
                    api(`/dealer/leads/${kind}/${id}/comments`, {
                      method: 'POST',
                      body: JSON.stringify({ body: `[${next}] ${why.trim()}` }),
                    })
                      .then(() => qc.invalidateQueries({ queryKey: ['lead-comments', kind, id] }))
                      .catch(() => {
                        /* swallow — status move is the source of truth */
                      });
                  }
                  moveStatus.mutate(next);
                }}
                disabled={moveStatus.isPending}
                className="border border-gray-300 rounded px-2 py-1.5 font-subhead uppercase tracking-subhead text-xs"
              >
                {dropdownStatuses.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Pipeline Activity — append-only audit trail of status moves.
              Collapsible per QA #1: long activity logs were eating screen
              real-estate on the lead-detail page; the dealer mostly cares
              about the current stage + comments. Default to expanded so
              first-time viewers see the full trail; clicking the chevron
              collapses to just the count. */}
          <section className="bg-hd-white border border-gray-200 p-6">
            <button
              type="button"
              onClick={() => setActivityExpanded((v) => !v)}
              aria-expanded={activityExpanded}
              aria-controls="pipeline-activity-body"
              className="w-full flex items-start justify-between gap-3 text-left group"
            >
              <span>
                <span className="block font-headline tracking-headline uppercase text-lg">
                  Pipeline Activity
                  {(activity.data?.length ?? 0) > 0 && (
                    <span className="ml-2 text-xs font-subhead tracking-subhead text-gray-500">
                      ({activity.data?.length})
                    </span>
                  )}
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  Every status change on this lead, oldest at the top.
                </span>
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-5 h-5 mt-1 shrink-0 text-gray-400 group-hover:text-text-on-light transition-transform ${activityExpanded ? 'rotate-180' : ''}`}
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div
              id="pipeline-activity-body"
              hidden={!activityExpanded}
              className="mt-5"
            >
              {activity.isLoading && (
                <p className="text-xs text-gray-500">Loading activity…</p>
              )}
              {!activity.isLoading &&
                (activity.data?.length ?? 0) === 0 && (
                  <p className="text-xs text-gray-500">
                    No activity yet — the first status move will appear here.
                  </p>
                )}
              {(activity.data?.length ?? 0) > 0 && (
                <ol className="space-y-3">
                  {activity.data?.map((entry) => {
                    const ts = new Date(entry.createdAt);
                    const isCreated = entry.action.startsWith('LEAD_CREATED');
                    const isStatus = entry.action === 'LEAD_STATUS_CHANGED';
                    const from = entry.metadata?.from;
                    const to = entry.metadata?.to;
                    return (
                      <li
                        key={entry.id}
                        className="grid grid-cols-[120px_1fr] gap-4 text-sm border-l-2 border-gray-200 pl-4 py-1"
                      >
                        <span className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 leading-tight pt-0.5">
                          {ts.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                          })}
                          <br />
                          <span className="text-gray-400">
                            {ts.toLocaleTimeString('en-IN', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </span>
                        </span>
                        <span className="text-text-on-light leading-snug">
                          {isCreated && (
                            <>
                              <span className="font-subhead">Lead created</span>
                              {entry.actorRole === 'DEALER' && (
                                <span className="text-gray-500"> · by dealer</span>
                              )}
                              {entry.actorRole === 'SYSTEM' && (
                                // QA BUG-011: previously hardcoded
                                // "via buyer enquiry" for every SYSTEM-
                                // created lead, including trade-in
                                // (seller) leads. Switch on `kind` so the
                                // copy matches the origin channel.
                                <span className="text-gray-500">
                                  {kind === 'trade-in'
                                    ? ' · via seller enquiry'
                                    : ' · via buyer enquiry'}
                                </span>
                              )}
                            </>
                          )}
                          {isStatus && (
                            <>
                              <span className="font-subhead">
                                {from ? LEAD_STAGE_LABELS[from] : '—'}
                              </span>
                              <span className="text-gray-400 mx-1.5">→</span>
                              <span className="font-subhead text-hd-orange">
                                {to ? LEAD_STAGE_LABELS[to] : '—'}
                              </span>
                              <span className="text-gray-500 text-xs">
                                {' '}· {entry.actorRole.toLowerCase()}
                              </span>
                            </>
                          )}
                          {!isCreated && !isStatus && (
                            <span className="text-gray-600">
                              {entry.action.replace(/_/g, ' ').toLowerCase()}
                              <span className="text-gray-500">
                                {' '}· {entry.actorRole.toLowerCase()}
                              </span>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>

          {/* Comments */}
          <section className="bg-hd-white border border-gray-200 p-6">
            <h2 className="font-headline tracking-headline uppercase text-lg">Comments</h2>

            <div className="mt-4 space-y-3">
              {comments.isLoading && <p className="text-xs text-gray-500">Loading…</p>}
              {!comments.isLoading && comments.data?.length === 0 && (
                <p className="text-xs text-gray-500">
                  No comments yet — start the conversation.
                </p>
              )}
              {comments.data?.map((c) => (
                <article
                  key={c.id}
                  className="border border-gray-200 p-4 bg-surface-light"
                >
                  <header className="flex items-center justify-between text-xs">
                    <span className="font-subhead uppercase tracking-subhead text-text-on-light">
                      {c.authorName}{' '}
                      <span className="text-gray-500 normal-case">· {c.authorRole}</span>
                    </span>
                    <span className="text-gray-500">
                      {new Date(c.createdAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </header>
                  <p className="text-sm mt-2 whitespace-pre-line">{c.body}</p>
                </article>
              ))}
            </div>

            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) addComment.mutate();
              }}
            >
              <textarea
                rows={3}
                placeholder="Add a comment…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!draft.trim() || addComment.isPending}
                >
                  {addComment.isPending ? 'Posting…' : 'Post'}
                </Button>
              </div>
            </form>
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-6">
          <Panel title="Lead Info">
            <Field label="Created">
              {new Date(lead.createdAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </Field>
            <Field label="Type">{KIND_LABEL[kind].toUpperCase()}</Field>
            <Field label="OTP Verified">✓ Yes</Field>
          </Panel>

          <Panel title="Assigned Dealer">
            {/* QA: City line was rendering `lead.city` (buyer's city) on
                this dealer-side card, which is wrong — it should be the
                dealer's own location. Dealer name already includes the
                city (e.g. "Capital Harley-Davidson Gurgaon") so the
                separate City line is redundant and was misleading. */}
            <Field label="Dealership">{dealer?.name ?? '—'}</Field>
          </Panel>

          {lead.listing && (
            <Panel title="Interested Listing">
              {lead.listing.images?.[0] && (
                <img
                  src={lead.listing.images[0]}
                  alt=""
                  className="w-full aspect-[16/10] object-cover"
                />
              )}
              <div className="mt-3">
                <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
                  #{lead.listing.id.slice(0, 8)}…
                </p>
                <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light mt-1">
                  {lead.listing.modelName} · {lead.listing.year}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {lead.listing.kmsDriven.toLocaleString()} km · {lead.listing.colour}
                </p>
                <p className="font-headline tracking-headline text-lg text-hd-orange mt-2">
                  ₹ {lead.listing.price.toLocaleString('en-IN')}
                </p>
              </div>
            </Panel>
          )}

          {(lead.message || lead.bikeModel) && (
            <Panel title={kind === 'trade-in' ? 'Seller Profile' : 'Buyer Profile'}>
              {lead.bikeModel && <Field label="Motorcycle">{lead.bikeModel}</Field>}
              {lead.vin && (
                <Field label="VIN">
                  <span className="font-mono text-xs">{lead.vin}</span>
                </Field>
              )}
              {lead.message && (
                <div className="pt-3 border-t border-gray-200 mt-3">
                  <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
                    Message
                  </p>
                  <p className="text-sm text-text-on-light mt-1 whitespace-pre-line">
                    {lead.message}
                  </p>
                </div>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
        {label}
      </dt>
      <dd className="text-sm text-text-on-light mt-0.5">{children}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-hd-white border border-gray-200 p-5">
      <h3 className="font-headline tracking-headline uppercase text-base text-text-on-light">
        {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
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

function Icon({ path }: { path: string }) {
  return (
    <svg
      className="w-3.5 h-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

// ─── Customer Details panel ──────────────────────────────────────────────
// Shows every field the customer submitted on their enquiry form so the
// rep doesn't have to bounce between systems. Hides any field that's
// null/empty so older leads (which may not carry all the new fields) just
// show the data they have. Buyer and trade-in have different field sets;
// branching keeps the markup tight without duplicating the panel chrome.
function CustomerDetailsPanel({ lead, kind }: { lead: LeadDetail; kind: Kind }) {
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  };
  const has = (v: unknown) => v !== null && v !== undefined && v !== '';

  return (
    <section className="bg-hd-white border border-gray-200 p-6">
      <h2 className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mb-4">
        Customer Details
      </h2>

      {/* Contact + location — always shown */}
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
          {/* Buyer interest + qualification — fields are nullable; show
              only what the buyer actually answered. */}
          {(has(lead.lookingFor) ||
            has(lead.source) ||
            has(lead.budget) ||
            has(lead.financingNeeded) ||
            has(lead.tradeInInterest) ||
            has(lead.visitPreference) ||
            has(lead.bestTimeToCall)) && (
            <>
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
            </>
          )}
        </>
      ) : (
        <>
          {/* Trade-in / seller specifics — Bike + Commercials groups. */}
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

      {/* Free-text message — show last so it doesn't push tabular data
          off the fold. Shown only when populated. */}
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
  );
}
