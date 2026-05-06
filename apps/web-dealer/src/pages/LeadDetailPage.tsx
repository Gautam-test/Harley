import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from '@hd-cpo/ui';
import { BUYER_LEAD_PIPELINE, leadStatus, type LeadStatus } from '@hd-cpo/types';
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
  pincode?: string | null;
  message?: string | null;
  bikeModel?: string;
  vin?: string;
  status: LeadStatus;
  createdAt: string;
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

const KIND_LABEL: Record<Kind, string> = {
  buyer: 'Buyer Lead',
  'trade-in': 'Seller Lead',
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

  const moveStatus = useMutation({
    mutationFn: (next: LeadStatus) =>
      api(`/dealer/leads/${kind}/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', kind, id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const [draft, setDraft] = useState('');
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
  const pipelineStatuses = leadStatus.options;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <Link
        to={`/leads/${kind}`}
        className="inline-flex items-center text-xs font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition border border-gray-300 px-3 py-1.5 rounded-card"
      >
        ← Back to {KIND_LABEL[kind]}s
      </Link>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 mt-6">
        {/* Main column */}
        <div className="space-y-6 min-w-0">
          {/* Lead header */}
          <header className="bg-hd-white border border-gray-200 rounded-card p-6">
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
                className="inline-flex items-center gap-1.5 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 rounded-card hover:brightness-110 transition"
              >
                <Icon path="M3 5a2 2 0 012-2h2.5a1 1 0 011 .76l1 4a1 1 0 01-.27.95l-1.5 1.5a11 11 0 005 5l1.5-1.5a1 1 0 01.95-.27l4 1a1 1 0 01.76 1V19a2 2 0 01-2 2A18 18 0 013 5z" />
                Call
              </a>
              <a
                href={`mailto:${lead.email}?subject=Re: Your H-D Certified Enquiry ${formatLeadId(kind as LeadKind, lead.id, lead.createdAt)}`}
                className="inline-flex items-center gap-1.5 border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 rounded-card hover:bg-hd-black hover:text-hd-white transition"
              >
                <Icon path="M3 7l9 6 9-6M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l2-2h14l2 2" />
                Email
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    formatLeadId(kind as LeadKind, lead.id, lead.createdAt),
                  );
                }}
                className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 rounded-card hover:border-hd-black hover:text-hd-black transition"
              >
                <Icon path="M8 4h10a2 2 0 012 2v10M16 8H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2z" />
                Copy Ref
              </button>
            </div>
          </header>

          {/* Pipeline */}
          <section className="bg-hd-white border border-gray-200 rounded-card p-6">
            <h2 className="font-headline tracking-headline uppercase text-lg">Pipeline</h2>
            <ol className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative">
              {BUYER_LEAD_PIPELINE.map((stage, idx) => {
                const currIdx = BUYER_LEAD_PIPELINE.indexOf(lead.status as never);
                const reached = currIdx >= 0 && idx <= currIdx;
                const isCurrent = stage === lead.status;
                return (
                  <li key={stage} className="flex flex-col items-center text-center">
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 font-subhead text-xs ${
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
                      className={`mt-2 font-subhead uppercase tracking-subhead text-[10px] leading-tight ${
                        isCurrent ? 'text-text-on-light' : reached ? 'text-gray-700' : 'text-gray-400'
                      }`}
                    >
                      {stage.replace(/_/g, ' ')}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-subhead uppercase tracking-subhead text-xs text-gray-500">
                Move To:
              </span>
              <select
                value={lead.status}
                onChange={(e) => {
                  const next = e.target.value as LeadStatus;
                  // Terminal moves are one-way — confirm so a misclick
                  // doesn't bury an active lead. Asking for a reason at
                  // the same time gives managers an audit trail without
                  // a separate flow.
                  if (next === 'LOST' || next === 'DEAD' || next === 'CLOSED') {
                    const why = window.prompt(
                      `Mark this lead as ${next}? This is a terminal status — write a short reason for the audit log.`,
                      '',
                    );
                    if (why === null) {
                      // User cancelled; revert select to current value.
                      e.target.value = lead.status;
                      return;
                    }
                    if (why.trim()) {
                      addComment.mutate(undefined, {
                        // Force the comment text without going through the
                        // "draft" textarea since the user typed it inline.
                        // Calling the API directly here is cleaner.
                      });
                      // Mirror the entered reason into the comments thread
                      // so the audit shows up on the lead detail page.
                      api(`/dealer/leads/${kind}/${id}/comments`, {
                        method: 'POST',
                        body: JSON.stringify({ body: `[${next}] ${why.trim()}` }),
                      }).then(() =>
                        qc.invalidateQueries({ queryKey: ['lead-comments', kind, id] }),
                      ).catch(() => {
                        /* swallow — comment is best-effort, status move is the source of truth */
                      });
                    }
                  }
                  moveStatus.mutate(next);
                }}
                disabled={moveStatus.isPending}
                className="border border-gray-300 rounded px-2 py-1.5 font-subhead uppercase tracking-subhead text-xs"
              >
                {pipelineStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Comments */}
          <section className="bg-hd-white border border-gray-200 rounded-card p-6">
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
                  className="border border-gray-200 rounded-card p-4 bg-surface-light"
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
            <Field label="Dealership">{dealer?.name ?? '—'}</Field>
            <Field label="City">{lead.city ?? '—'}</Field>
          </Panel>

          {lead.listing && (
            <Panel title="Interested Listing">
              {lead.listing.images?.[0] && (
                <img
                  src={lead.listing.images[0]}
                  alt=""
                  className="w-full aspect-[16/10] object-cover rounded-card"
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
              {lead.bikeModel && <Field label="Bike">{lead.bikeModel}</Field>}
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
    <section className="bg-hd-white border border-gray-200 rounded-card p-5">
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
      {status.replace(/_/g, ' ')}
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
