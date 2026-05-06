import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';

// PRD §6.2.3 + Figma /Dealer/Halrey dealer_page-0002.jpg — single-page Add
// Listing form, four numbered sections stacked top-to-bottom:
//
//   STEP 1 — ENTER VIN              (pull vehicle from Torque DMS)
//   STEP 2 — DEALER INPUT           (price, KMs, owners, description, photos)
//   STEP 3 — INSPECTION & CERTIFICATION (PDF upload + CPO/As-Is toggle)
//   STEP 4 — CPO KIT DOCUMENTS      (auto-fetched from Torque, read-only status)
//
// Submit For Approval is enabled once the form is complete; until VIN is
// fetched, Steps 2-4 stay greyed-out so the dealer knows what to do first.

// Mirrors `packages/torque-client/src/types.ts` — the seven canonical Torque
// data fields (VIN, ENGINE, MODEL NAME, MODEL FAMILY, COLOR, CUSTOMER NAME,
// DATE OF INVOICE) plus operational dealer/status metadata.
interface TorqueVehicle {
  vin: string;
  engine: string;
  modelName: string;
  modelFamily: string;
  colour: string;
  customerName: string;
  dateOfInvoice: string;
  dealerId: string;
  status: string;
}

interface TorqueCpoKit {
  cpoCertUrl?: string;
  rsaUrl?: string;
  espUrl?: string;
  serviceHistoryUrl?: string;
  rcUrl?: string;
  deliveryNoteUrl?: string;
  hogUrl?: string;
  insuranceUrl?: string;
}

interface FormState {
  vin: string;
  torque: TorqueVehicle | null;
  price: string;
  kmsDriven: string;
  owners: string;
  description: string;
  images: string[];
  inspectionUrl: string;
  inspectionMeta: { originalName: string; size: number } | null;
  certificationStatus: 'CPO' | 'AS_IS';
}

const initial: FormState = {
  vin: '',
  torque: null,
  price: '',
  kmsDriven: '',
  owners: '1',
  description: '',
  images: [],
  inspectionUrl: '',
  inspectionMeta: null,
  certificationStatus: 'CPO',
};

export function AddListingPage() {
  const navigate = useNavigate();
  const [s, setS] = useState<FormState>(initial);
  const update = (patch: Partial<FormState>) => setS((p) => ({ ...p, ...patch }));

  const fetchVin = useMutation({
    mutationFn: (vin: string) => api<TorqueVehicle>(`/torque/vehicles/${vin}`),
    onSuccess: (vehicle) => update({ torque: vehicle }),
  });

  // CPO Kit auto-fetched as soon as Torque returns a vehicle AND the dealer
  // has tagged the listing as CPO. As-Is bikes don't carry the kit.
  const cpoKit = useQuery({
    queryKey: ['torque-cpo-kit', s.vin],
    queryFn: () =>
      api<TorqueCpoKit>(`/torque/vehicles/${encodeURIComponent(s.vin)}/cpo-kit`),
    enabled: Boolean(s.torque) && s.certificationStatus === 'CPO',
  });

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; slug: string }>('/dealer/listings', {
        method: 'POST',
        body: JSON.stringify({
          // Vehicle facts are read server-side from Torque against the VIN —
          // we no longer send them from the client.
          vin: s.vin,
          price: Number(s.price),
          kmsDriven: Number(s.kmsDriven),
          owners: Number(s.owners),
          description: s.description,
          images: s.images,
          inspectionReportUrl: s.inspectionUrl || null,
          certificationStatus: s.certificationStatus,
          cpoDocs:
            s.certificationStatus === 'CPO' ? cpoKit.data ?? null : null,
        }),
      }),
    onSuccess: () => navigate('/listings'),
  });

  const torqueLocked = !s.torque;
  // Inspection PDF is mandatory for CPO listings; As-Is bikes can skip it
  // entirely (the bike ships uncertified). PRD §6.2.3 AC4: CPO listings
  // require an attached inspection report.
  //
  // Build a human-readable list of what's still needed so the dealer sees
  // *why* Submit is disabled rather than staring at a greyed button. Each
  // entry corresponds to one form rule; ordering matches the section flow.
  const missing: string[] = [];
  if (!s.torque) missing.push('Fetch the VIN from Torque (Step 1)');
  if (!s.price || Number(s.price) <= 0) missing.push('Enter a Selling Price (Step 2)');
  if (!s.kmsDriven || Number.isNaN(Number(s.kmsDriven)))
    missing.push('Enter KMs Driven (Step 2)');
  if (!s.owners || Number(s.owners) < 1) missing.push('Pick the number of Owners (Step 2)');
  if (s.description.length < 20)
    missing.push(`Description needs ${20 - s.description.length} more characters (Step 2)`);
  if (s.images.length < 5)
    missing.push(`Add ${5 - s.images.length} more photo${5 - s.images.length === 1 ? '' : 's'} (Step 2 — minimum 5)`);
  if (s.certificationStatus === 'CPO' && !s.inspectionUrl)
    missing.push('Upload the 110-point inspection PDF (Step 3)');
  const formValid = missing.length === 0;

  return (
    <div className="px-8 py-8 lg:py-10">
      {/* Header row — title + back button */}
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline uppercase text-text-on-light">
          Add a <span className="text-hd-orange">Listing</span>
        </h1>
        <Link
          to="/listings"
          className="inline-flex items-center text-xs font-subhead uppercase tracking-subhead text-gray-700 hover:text-hd-orange transition border border-gray-300 px-3 py-1.5 rounded-card"
        >
          ← Back
        </Link>
      </div>

      <div className="space-y-5">
        {/* ─── STEP 1 — ENTER VIN ─────────────────────────────────────── */}
        <Section
          number={1}
          title="Enter VIN"
          highlight={!s.torque}
          dim={false}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^[A-HJ-NPR-Z0-9]{17}$/.test(s.vin)) fetchVin.mutate(s.vin);
            }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3"
          >
            <Input
              maxLength={17}
              placeholder="1HD1KB4197Y624381"
              className="font-mono text-base"
              value={s.vin}
              onChange={(e) =>
                update({ vin: e.target.value.toUpperCase(), torque: null })
              }
            />
            <Button
              type="submit"
              disabled={
                !/^[A-HJ-NPR-Z0-9]{17}$/.test(s.vin) || fetchVin.isPending
              }
            >
              {fetchVin.isPending ? 'Fetching…' : 'Fetch from Torque'}
            </Button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Vehicle details will be auto-fetched from the Torque DMS.
          </p>
          {fetchVin.error instanceof ApiError && (
            <div className="mt-3 bg-danger/10 border border-danger rounded-card p-3 text-sm text-text-on-light">
              <p className="font-subhead uppercase tracking-subhead text-[11px] text-danger">
                {fetchVin.error.code === 'VIN_NOT_ASSIGNED'
                  ? 'VIN not assigned to your dealership'
                  : fetchVin.error.code === 'TORQUE_VIN_NOT_FOUND'
                  ? 'VIN not in Torque'
                  : 'Could not fetch this VIN'}
              </p>
              <p className="mt-1 leading-snug">{fetchVin.error.message}</p>
            </div>
          )}
          {s.torque && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded p-4 space-y-3">
              <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
                Fetched from Torque DMS
              </p>
              <div className="grid sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <ReadOnly label="Engine" value={s.torque.engine} />
                <ReadOnly label="Model Name" value={s.torque.modelName} />
                <ReadOnly label="Model Family" value={s.torque.modelFamily} />
                <ReadOnly label="Color" value={s.torque.colour} />
                <ReadOnly label="Customer Name" value={s.torque.customerName} />
                <ReadOnly
                  label="Date of Invoice"
                  value={formatInvoiceDate(s.torque.dateOfInvoice)}
                />
              </div>
            </div>
          )}
        </Section>

        {/* ─── STEP 2 — DEALER INPUT ──────────────────────────────────── */}
        <Section number={2} title="Dealer Input" dim={torqueLocked}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Selling Price (₹)">
              <Input
                inputMode="numeric"
                placeholder="18,90,000"
                value={s.price}
                onChange={(e) =>
                  update({ price: e.target.value.replace(/[^0-9]/g, '') })
                }
                disabled={torqueLocked}
              />
            </Field>
            <Field label="KMs Driven">
              <Input
                inputMode="numeric"
                placeholder="8,240"
                value={s.kmsDriven}
                onChange={(e) =>
                  update({ kmsDriven: e.target.value.replace(/[^0-9]/g, '') })
                }
                disabled={torqueLocked}
              />
            </Field>
            <Field label="Owners">
              <Select
                value={s.owners}
                onChange={(e) => update({ owners: e.target.value })}
                disabled={torqueLocked}
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4+</option>
              </Select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              rows={3}
              placeholder="Single-owner Street Glide Special, full service history…"
              className="w-full bg-hd-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50 disabled:bg-gray-50 disabled:text-gray-400"
              value={s.description}
              onChange={(e) => update({ description: e.target.value })}
              disabled={torqueLocked}
            />
          </Field>

          <Field
            label={`Photos (min. 5)${
              s.images.length > 0 ? ` — ${s.images.length} added` : ''
            }`}
          >
            <ListingImagePicker
              images={s.images}
              onChange={(images) => update({ images })}
              disabled={torqueLocked}
            />
          </Field>
        </Section>

        {/* ─── STEP 3 — INSPECTION & CERTIFICATION ─────────────────────── */}
        <Section number={3} title="Inspection & Certification" dim={torqueLocked}>
          <p className="text-xs text-gray-600">
            Pick the certification tag first. CPO listings require the
            completed 110-point inspection report. As-Is listings can skip
            it — the bike ships without certification.
          </p>

          {/* Certification toggle — primary control for this step. Drives
              whether the inspection upload below is required or optional. */}
          <div className="mt-4">
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-2">
              Certification Tag
            </p>
            <CertToggle
              value={s.certificationStatus}
              onChange={(v) =>
                update({
                  certificationStatus: v,
                  // Switching to As-Is clears any uploaded inspection so we
                  // don't ship a PDF that contradicts the chosen tag.
                  ...(v === 'AS_IS'
                    ? { inspectionUrl: '', inspectionMeta: null }
                    : {}),
                })
              }
              disabled={torqueLocked}
            />
          </div>

          {/* Inspection PDF — visible for CPO; hidden for As-Is.
              Always-visible "Download Sample Format" button on the left,
              upload zone on the right (Figma /Dealer/Halrey dealer_page-0002.jpg
              "Step 1 → download / Step 2 → upload" pattern). */}
          {s.certificationStatus === 'CPO' ? (
            <div className="mt-5">
              <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-2">
                110-Point Inspection Report (Required)
              </p>
              <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-stretch">
                <a
                  href={`/api/v1/inspection/template.pdf?vin=${encodeURIComponent(
                    s.vin,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex sm:flex-col items-center sm:justify-center gap-3 sm:gap-2 bg-hd-orange/10 border border-hd-orange/40 hover:bg-hd-orange/20 transition rounded p-4 sm:w-48 text-left sm:text-center"
                >
                  <svg
                    className="w-6 h-6 text-hd-orange shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  <span>
                    <span className="block font-subhead uppercase tracking-subhead text-[11px] text-text-on-light">
                      Download Sample Format
                    </span>
                    <span className="block text-[10px] text-gray-600 mt-0.5">
                      Pre-filled with this VIN
                    </span>
                  </span>
                </a>
                <InspectionUploader
                  vin={s.vin}
                  currentUrl={s.inspectionUrl}
                  meta={s.inspectionMeta}
                  disabled={torqueLocked}
                  onUploaded={(url, meta) =>
                    update({ inspectionUrl: url, inspectionMeta: meta })
                  }
                />
              </div>
            </div>
          ) : (
            <div className="mt-5 bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-700">
              <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500">
                As-Is — Inspection Skipped
              </p>
              <p className="mt-1">
                As-Is listings ship without the 110-point inspection. The bike
                will be tagged <span className="font-subhead">As-Is</span> on
                the buyer site and won&rsquo;t carry the H-D Certified&trade;
                guarantee.
              </p>
              <p className="mt-2 text-[11px] text-gray-500">
                Changed your mind? Switch to <span className="font-subhead">CPO Certified</span> above
                — the upload field will reappear.
              </p>
            </div>
          )}
        </Section>

        {/* ─── STEP 4 — CPO KIT DOCUMENTS ─────────────────────────────── */}
        <Section
          number={4}
          title="CPO Kit Documents"
          eyebrow="Auto-fetched from Torque DMS"
          dim={torqueLocked || s.certificationStatus !== 'CPO'}
        >
          {s.certificationStatus === 'AS_IS' ? (
            <p className="text-xs text-gray-500">
              As-Is listings don&rsquo;t carry the CPO kit. Switch to CPO above
              if this bike passed the 110-point inspection.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-gray-500 mb-3">
                Tap any document below to preview the file Torque returned for
                this VIN.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <KitDoc
                  label="CPO Certificate"
                  url={cpoKit.data?.cpoCertUrl}
                  loading={cpoKit.isPending}
                />
                <KitDoc
                  label="RSA Documents"
                  url={cpoKit.data?.rsaUrl}
                  loading={cpoKit.isPending}
                />
                <KitDoc
                  label="ESP Documents"
                  url={cpoKit.data?.espUrl}
                  loading={cpoKit.isPending}
                />
                <KitDoc
                  label="Service History"
                  url={cpoKit.data?.serviceHistoryUrl}
                  loading={cpoKit.isPending}
                  value={cpoKit.data?.serviceHistoryUrl ? '✓ 3 records' : undefined}
                />
                <KitDoc
                  label="RC Copy"
                  url={cpoKit.data?.rcUrl}
                  loading={cpoKit.isPending}
                />
                <KitDoc
                  label="Insurance"
                  url={cpoKit.data?.insuranceUrl}
                  loading={cpoKit.isPending}
                />
                <KitDoc
                  label="Delivery Note"
                  url={cpoKit.data?.deliveryNoteUrl}
                  loading={cpoKit.isPending}
                />
                <KitDoc
                  label="HOG Membership"
                  url={cpoKit.data?.hogUrl}
                  loading={cpoKit.isPending}
                  value={cpoKit.data?.hogUrl ? '✓ Active' : undefined}
                />
              </div>
            </>
          )}
        </Section>

        {create.error instanceof ApiError && (
          <div className="text-danger text-sm bg-danger/10 border border-danger px-4 py-3 rounded">
            {create.error.message}
          </div>
        )}

        {/* Inline "what's missing" checklist — visible whenever the form
            isn't ready to submit. Tells the dealer *exactly* what to do
            next instead of staring at a greyed-out button. */}
        {!formValid && (
          <div className="bg-hd-orange/10 border-2 border-hd-orange rounded-card p-5">
            <p className="font-subhead uppercase tracking-subhead text-sm text-hd-orange">
              ⚠ {missing.length} item{missing.length === 1 ? '' : 's'} left before you can submit
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-text-on-light">
              {missing.map((m) => (
                <li key={m} className="flex items-start gap-2">
                  <span aria-hidden className="text-hd-orange leading-none mt-1">
                    ●
                  </span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer actions — Cancel + Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Link
            to="/listings"
            className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition rounded-card"
          >
            Cancel
          </Link>
          <Button
            onClick={() => create.mutate()}
            disabled={!formValid || create.isPending}
            title={formValid ? undefined : missing.join(' · ')}
          >
            {create.isPending
              ? 'Saving…'
              : formValid
              ? 'Submit for Approval'
              : `Submit for Approval (${missing.length} item${missing.length === 1 ? '' : 's'} left)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  number,
  title,
  eyebrow,
  highlight = false,
  dim,
  children,
}: {
  number: number;
  title: string;
  eyebrow?: string;
  highlight?: boolean;
  dim: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`bg-hd-white border border-gray-200 rounded-card p-5 sm:p-6 transition ${
        highlight ? 'border-l-4 border-l-hd-orange' : ''
      } ${dim ? 'opacity-60 pointer-events-none' : ''}`}
      aria-disabled={dim}
    >
      <header className="mb-4 flex items-baseline gap-3 flex-wrap">
        <span className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">
          Step {number}
        </span>
        <span className="text-gray-300">—</span>
        <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-base">
          {title}
        </h2>
        {eyebrow && (
          <span className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 sm:ml-2">
            {eyebrow}
          </span>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CertToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: 'CPO' | 'AS_IS';
  onChange: (v: 'CPO' | 'AS_IS') => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Certification tag"
      className="inline-flex border border-gray-300 rounded-card overflow-hidden text-xs font-subhead uppercase tracking-subhead w-full"
    >
      {(
        [
          { v: 'CPO', label: 'CPO Certified' },
          { v: 'AS_IS', label: 'As-Is' },
        ] as const
      ).map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.v)}
            className={`flex-1 py-3 transition ${
              active
                ? 'bg-hd-orange text-hd-white'
                : 'bg-hd-white text-gray-700 hover:text-text-on-light'
            } disabled:opacity-50`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// CPO kit document tile. When Torque returns a URL, the whole tile becomes a
// clickable link that opens the document in a new tab so the dealer can
// inspect the actual PDF (RC copy, HOG membership certificate, etc.) and
// not just trust a "✓ Fetched" badge. Missing docs render as a non-clickable
// placeholder so the dealer can see what Torque didn't return.
function KitDoc({
  label,
  url,
  loading,
  value,
}: {
  label: string;
  url: string | undefined;
  loading: boolean;
  value?: string;
}) {
  if (loading) {
    return (
      <div className="border border-gray-200 rounded p-3 bg-gray-50/50">
        <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-600">
          {label}
        </p>
        <p className="mt-1 font-subhead uppercase tracking-subhead text-xs text-gray-400">
          Loading…
        </p>
      </div>
    );
  }
  if (!url) {
    return (
      <div className="border border-gray-200 rounded p-3 bg-gray-50/50">
        <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-600">
          {label}
        </p>
        <p className="mt-1 font-subhead uppercase tracking-subhead text-xs text-warning">
          Missing
        </p>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block border border-gray-200 rounded p-3 hover:border-hd-orange hover:bg-orange-50/30 transition group"
      title={`View ${label}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-600">
            {label}
          </p>
          <p className="mt-1 font-subhead uppercase tracking-subhead text-xs text-hd-orange">
            {value ?? '✓ Fetched'}
          </p>
        </div>
        {/* External-link glyph — signals "click to open in new tab" */}
        <svg
          className="w-3.5 h-3.5 text-gray-400 group-hover:text-hd-orange shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
      <p className="text-[10px] text-gray-500 mt-1 truncate">View document</p>
    </a>
  );
}

function InspectionUploader(props: {
  vin: string;
  currentUrl: string;
  meta: { originalName: string; size: number } | null;
  disabled?: boolean;
  onUploaded: (url: string, meta: { originalName: string; size: number }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File too large (max 10 MB)');
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('PDF only');
      }
      const fd = new FormData();
      fd.append('file', file);
      const res = await api<{ url: string; originalName: string; size: number }>(
        '/inspection/upload',
        { method: 'POST', body: fd, formData: true },
      );
      props.onUploaded(res.url, { originalName: res.originalName, size: res.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <label
      className={`flex flex-col items-center justify-center text-center border-2 border-dashed p-8 cursor-pointer transition rounded ${
        uploading
          ? 'border-hd-orange bg-orange-50'
          : props.currentUrl
          ? 'border-success bg-success/5'
          : 'border-gray-300 hover:border-hd-orange hover:bg-orange-50/30'
      } ${props.disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={uploading || props.disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {uploading ? (
        <p className="font-subhead uppercase tracking-subhead text-sm text-hd-orange">
          Uploading…
        </p>
      ) : props.currentUrl ? (
        <>
          <span className="text-success font-subhead uppercase tracking-subhead text-sm">
            ✓ Inspection report uploaded
          </span>
          {props.meta && (
            <span className="text-xs text-gray-600 mt-1">
              {props.meta.originalName} · {(props.meta.size / 1024).toFixed(0)} KB
            </span>
          )}
          <a
            href={props.currentUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-hd-orange hover:underline mt-2"
          >
            Preview / replace file
          </a>
        </>
      ) : (
        <>
          <svg
            className="w-7 h-7 text-hd-orange"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light mt-2">
            Upload Inspection Report (PDF)
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Will sync back to Torque DMS · max 10 MB
          </p>
        </>
      )}
      {error && <p className="text-danger text-xs mt-2">{error}</p>}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-subhead uppercase tracking-subhead text-gray-500">
        {label}
      </dt>
      <dd className="text-text-on-light text-sm">{value}</dd>
    </div>
  );
}

// Torque returns the invoice date as ISO 8601 ("2023-04-12"); humanise for
// the dealer readout. Falls back to the raw string when parsing fails.
function formatInvoiceDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const MAX_IMAGES = 8;
const MIN_IMAGES = 5;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

// Slot hints from Figma — first photo is the cover; the next three suggest
// the standard angles a listing should include. Anything beyond is generic.
const SLOT_HINTS = ['Drop or click to upload', 'Main', 'Side', 'Engine', 'Rear'];

function isManagedUploadUrl(url: string) {
  return url.startsWith('/api/v1/uploads/listing-images/');
}
function filenameFromManagedUrl(url: string) {
  return url.split('/').pop() ?? '';
}

function ListingImagePicker({
  images,
  onChange,
  disabled = false,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setErrors([`Maximum ${MAX_IMAGES} photos`]);
      return;
    }
    const queue = Array.from(files).slice(0, room);
    setErrors([]);
    setUploading(true);
    const localErrors: string[] = [];
    const uploaded: string[] = [];
    for (const file of queue) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!ALLOWED_IMAGE_EXT.includes(ext)) {
        localErrors.push(`${file.name}: only JPG/PNG/WebP allowed`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        localErrors.push(`${file.name}: max 8 MB`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api<{ url: string }>('/uploads/listing-image', {
          method: 'POST',
          body: fd,
          formData: true,
        });
        uploaded.push(res.url);
      } catch (e) {
        localErrors.push(`${file.name}: ${e instanceof ApiError ? e.message : 'upload failed'}`);
      }
    }
    setUploading(false);
    if (uploaded.length) onChange([...images, ...uploaded]);
    if (localErrors.length) setErrors(localErrors);
  };

  const removeAt = async (idx: number) => {
    const url = images[idx];
    const next = images.filter((_, i) => i !== idx);
    onChange(next);
    if (url && isManagedUploadUrl(url)) {
      const filename = filenameFromManagedUrl(url);
      api(`/uploads/listing-images/${filename}`, { method: 'DELETE' }).catch(
        () => {
          /* swallow — orphan sweep will catch it */
        },
      );
    }
  };

  // Render exactly 4 slot tiles in a row (per Figma). Slots beyond the first 4
  // collapse into an "extras" row below — keeps the layout neat without
  // truncating uploads.
  const slots: { url: string | null; hint: string; index: number }[] = SLOT_HINTS.map(
    (hint, i) => ({
      url: images[i] ?? null,
      hint,
      index: i,
    }),
  );
  const extras = images.slice(SLOT_HINTS.length);

  return (
    <div className="space-y-3">
      <input
        id="listing-image-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {slots.map((slot) => (
          <PhotoSlot
            key={slot.index}
            slot={slot}
            uploading={uploading && slot.index === images.length}
            disabled={disabled}
            onRemove={() => removeAt(slot.index)}
          />
        ))}
      </div>

      {extras.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {extras.map((src, i) => (
            <div
              key={src}
              className="relative aspect-[4/3] overflow-hidden border border-gray-200 rounded group"
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(SLOT_HINTS.length + i)}
                className="absolute top-1 right-1 bg-danger text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-1.5 py-0.5 rounded"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>
          {images.length}/{MAX_IMAGES} added · minimum {MIN_IMAGES}
        </span>
        {errors.length > 0 && (
          <span className="text-danger">
            {errors.length === 1 ? errors[0] : `${errors.length} errors`}
          </span>
        )}
      </div>
    </div>
  );
}

function PhotoSlot({
  slot,
  uploading,
  disabled,
  onRemove,
}: {
  slot: { url: string | null; hint: string; index: number };
  uploading: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const empty = !slot.url;
  const isCoverSlot = slot.index === 0;
  return (
    <label
      htmlFor={empty ? 'listing-image-input' : undefined}
      className={`relative aspect-[4/3] flex flex-col items-center justify-center text-center border-2 rounded transition ${
        empty
          ? 'border-dashed border-gray-300 bg-gray-50/40 cursor-pointer hover:border-hd-orange hover:bg-orange-50/30'
          : 'border-gray-200 overflow-hidden'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''} ${
        uploading ? 'border-hd-orange bg-orange-50' : ''
      }`}
    >
      {empty ? (
        <>
          {isCoverSlot && (
            <svg
              className="w-6 h-6 text-hd-orange mb-1"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
          <span
            className={`font-subhead uppercase tracking-subhead text-[10px] leading-tight px-2 ${
              isCoverSlot ? 'text-text-on-light' : 'text-gray-400'
            }`}
          >
            {slot.hint}
          </span>
        </>
      ) : (
        <>
          <img
            src={slot.url ?? ''}
            alt=""
            className="w-full h-full object-cover"
          />
          {isCoverSlot && (
            <span className="absolute top-1 left-1 bg-hd-orange text-hd-black text-[10px] font-subhead uppercase tracking-subhead px-1.5 py-0.5 rounded">
              Cover
            </span>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onRemove();
              }}
              className="absolute top-1 right-1 bg-danger text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-1.5 py-0.5 rounded"
            >
              Remove
            </button>
          )}
        </>
      )}
    </label>
  );
}
