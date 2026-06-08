import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Select } from '@hd-cpo/ui';
import { PRICE_MAX, KMS_MAX } from '@hd-cpo/types';
import { api, ApiError } from '../lib/api';

// Edit-mode hydration shape — the GET /dealer/listings/:id response.
// Only the fields the wizard cares about; any extra columns are ignored.
interface ExistingListing {
  id: string;
  vin: string;
  slug: string;
  modelName: string;
  modelFamily: string;
  year: number;
  colour: string;
  price: number;
  kmsDriven: number;
  owners: number | null;
  description: string;
  images: string[];
  purchasePrice: number | null;
  refurbishmentPrice: number | null;
  ageingDays: number | null;
  finalSellingPrice: number | null;
  inspectionReportUrl: string | null;
  certificationStatus: 'CPO' | 'AS_IS';
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  adminFeedback: string | null;
  registrationNumber: string | null;
}

// Maps the `cause` field-name in a backend Zod field-error payload to the
// label the dealer recognises from the wizard. Keeps the validation error
// readout in plain English ("Selling Price: cannot exceed ₹1 crore")
// instead of leaking the schema field names ("price").
const FIELD_LABEL: Record<string, string> = {
  vin: 'VIN',
  price: 'Selling Price',
  kmsDriven: 'KMs Driven',
  owners: 'Owners',
  description: 'Description',
  images: 'Photos',
  inspectionReportUrl: 'Inspection Report',
  certificationStatus: 'Certification Tag',
  cpoDocs: 'CPO Documents',
  registrationNumber: 'Registration Number',
};

// Legacy auto-save key — earlier builds persisted in-progress wizard state to
// localStorage so a tab refresh wouldn't wipe the form. Dealers found this
// confusing because clicking "Add Listing" after a previous submit silently
// pre-filled the form with the old VIN / photos / description. We now start
// every Add Listing visit on a fresh form; this helper clears any draft a
// returning user might still have in their browser from the older build.
const DRAFT_STORAGE_KEY = 'hd-cpo:add-listing-draft';

function clearLegacyDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

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
  // QA: optional fuel-economy figure surfaced in Step 2. Until the API
  // gains a dedicated column, this is round-tripped via a `Mileage: NN
  // km/l — ` prefix on `description` (parsed back on edit).
  mileage: string;
  description: string;
  images: string[];
  // Dealer-internal pricing — not shown to buyers.
  purchasePrice: string;
  refurbishmentPrice: string;
  ageingDays: string;
  finalSellingPrice: string;
  inspectionUrl: string;
  inspectionMeta: { originalName: string; size: number } | null;
  certificationStatus: 'CPO' | 'AS_IS';
  registrationNumber: string;
}

const initial: FormState = {
  vin: '',
  torque: null,
  price: '',
  kmsDriven: '',
  owners: '1',
  mileage: '',
  description: '',
  images: [],
  purchasePrice: '',
  refurbishmentPrice: '',
  ageingDays: '',
  finalSellingPrice: '',
  inspectionUrl: '',
  inspectionMeta: null,
  certificationStatus: 'CPO',
  registrationNumber: '',
};

// Mileage round-trip helpers — until the API gets a first-class column,
// we store the value as a `Mileage: NN km/l — ` prefix on `description`.
// `extractMileage` peels it off when hydrating an edit; `withMileage`
// re-attaches it on save. The pattern is restrictive enough that it
// won't false-positive on a dealer-written description.
// Captures integer or decimal mileage (e.g. "18" or "18.5") followed by
// the km/l unit and the em-dash separator (or end-of-string).
const MILEAGE_PREFIX = /^Mileage:\s*(\d{1,3}(?:\.\d{1,2})?)\s*km\/l(?:\s*—\s*|\s*$)/;

function extractMileage(description: string | null | undefined): {
  mileage: string;
  description: string;
} {
  const text = description ?? '';
  const match = text.match(MILEAGE_PREFIX);
  if (!match) return { mileage: '', description: text };
  return { mileage: match[1] ?? '', description: text.slice(match[0].length) };
}

function withMileage(mileage: string, description: string): string {
  if (!mileage) return description;
  return description ? `Mileage: ${mileage} km/l — ${description}` : `Mileage: ${mileage} km/l`;
}

export function AddListingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // /listings/:id/edit reuses the same component as /listings/new — the
  // presence of `:id` switches the wizard into edit mode (hydrate from
  // server, PATCH on submit) while /new stays the create flow (start
  // empty, POST on submit).
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);

  // Always start the create wizard on a clean form. Earlier builds restored
  // an in-progress draft from localStorage which surprised dealers on the
  // next visit — clicking Add Listing showed the previous bike's VIN, photos
  // and description still filled in. We now wipe the legacy key on mount and
  // mount the form from `initial`.
  const [s, setS] = useState<FormState>(initial);
  useEffect(() => {
    if (!isEditMode) clearLegacyDraft();
  }, [isEditMode]);

  // QA fix: when the user navigates Edit → Add Listing via the sidebar,
  // React Router KEEPS this component mounted (same route component, only
  // params change). Without this reset, the previous bike's `s` state
  // would persist — including the VIN, photos, and pricing — and the
  // VIN field would unlock (because isEditMode is now false) showing the
  // old bike's VIN as editable text. Whenever editId changes or
  // disappears, snap `s` back to `initial`.
  useEffect(() => {
    if (!isEditMode) setS(initial);
  }, [editId, isEditMode]);
  const update = (patch: Partial<FormState>) => setS((p) => ({ ...p, ...patch }));

  // Edit-mode hydration. Fetches the listing once on mount and seeds the
  // form. Read-back of the FormState happens via the standard `update`
  // path so derived `missing[]` re-runs on the seeded values. We also
  // synthesise a "torque" object from the saved listing fields so the
  // wizard doesn't gate Steps 2–4 behind a re-fetch.
  const existing = useQuery({
    queryKey: ['dealer-listing-edit', editId],
    queryFn: () => api<ExistingListing>(`/dealer/listings/${editId}`),
    enabled: isEditMode,
  });
  useEffect(() => {
    if (!existing.data) return;
    const e = existing.data;
    setS({
      vin: e.vin,
      torque: {
        vin: e.vin,
        engine: '',
        modelName: e.modelName,
        modelFamily: e.modelFamily,
        colour: e.colour,
        customerName: '',
        dateOfInvoice: '',
        dealerId: '',
        status: '',
      },
      price: String(e.price),
      kmsDriven: String(e.kmsDriven),
      owners: String(e.owners ?? 1),
      // Split the cached Mileage prefix off the description (no-op when
      // the listing was created before this field existed).
      ...(() => {
        const split = extractMileage(e.description);
        return { mileage: split.mileage, description: split.description };
      })(),
      images: e.images,
      purchasePrice: e.purchasePrice != null ? String(e.purchasePrice) : '',
      refurbishmentPrice: e.refurbishmentPrice != null ? String(e.refurbishmentPrice) : '',
      ageingDays: e.ageingDays != null ? String(e.ageingDays) : '',
      finalSellingPrice: e.finalSellingPrice != null ? String(e.finalSellingPrice) : '',
      inspectionUrl: e.inspectionReportUrl ?? '',
      inspectionMeta: null,
      certificationStatus: e.certificationStatus,
      registrationNumber: e.registrationNumber ?? '',
    });
    // Re-fetch from Torque so Engine, Customer Name and Date of Invoice
    // populate in the read-only "Fetched from Torque DMS" card — the
    // dealer listing row only persists the four Torque facts the
    // marketplace cares about (model, family, year, colour), so without
    // this the other three render as blank when a dealer opens an edit
    // (e.g. View / Restore on a Removed listing). `idempotent` guard:
    // fetchVin.mutate uses the same query key each call, and onSuccess
    // is description-preserving, so re-running is safe.
    if (e.vin && !fetchVin.isPending) {
      fetchVin.mutate(e.vin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  // beforeunload guard — only warns when the form is "dirty" (anything
  // beyond the initial empty shape). The browser shows its native confirm
  // dialog automatically when we set returnValue.
  useEffect(() => {
    const isDirty =
      Boolean(s.vin) ||
      Boolean(s.torque) ||
      Boolean(s.price) ||
      Boolean(s.kmsDriven) ||
      Boolean(s.description) ||
      s.images.length > 0 ||
      Boolean(s.inspectionUrl);
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [s]);

  const fetchVin = useMutation({
    mutationFn: (vin: string) => api<TorqueVehicle>(`/torque/vehicles/${vin}`),
    onSuccess: (vehicle) => {
      // Auto-fill the description from Torque fields the moment the VIN
      // resolves. The dealer can still edit; we only seed when the
      // textarea is empty so we never clobber typed-in copy. Per QA
      // sheet: "Description should be auto fetch from torque".
      update({ torque: vehicle });
      setS((prev) => {
        if (prev.description.trim().length > 0) return prev;
        const seed =
          `${vehicle.modelName} ${vehicle.modelFamily}` +
          ` in ${vehicle.colour}.` +
          ` Originally invoiced ${
            vehicle.dateOfInvoice
              ? new Date(vehicle.dateOfInvoice).toLocaleDateString('en-IN', {
                  month: 'long',
                  year: 'numeric',
                })
              : '—'
          }.` +
          ` ${vehicle.engine ? `${vehicle.engine}.` : ''}` +
          ` Inspected and certified by an authorised H-D dealer.` +
          ` Edit this copy to highlight the bike's condition, service history, and any add-ons.`;
        return { ...prev, description: seed };
      });
    },
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
    mutationFn: () => {
      if (isEditMode && editId) {
        // PATCH the existing draft with everything the wizard touches.
        // updateListingInput on the API side now accepts price /
        // kmsDriven / owners / description / images / certificationStatus
        // / inspectionReportUrl / cpoDocs. VIN + Torque-derived fields
        // (model name/family/year/colour) stay read-only post-creation.
        return api<{ id: string }>(`/dealer/listings/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            price: Number(s.price),
            kmsDriven: Number(s.kmsDriven),
            owners: Number(s.owners),
            description: withMileage(s.mileage, s.description),
            images: s.images,
            certificationStatus: s.certificationStatus,
            // Null when AS_IS so the server clears any stale PDF reference.
            inspectionReportUrl:
              s.certificationStatus === 'CPO' ? s.inspectionUrl || null : null,
            cpoDocs:
              s.certificationStatus === 'CPO' ? cpoKit.data ?? null : null,
            registrationNumber: s.registrationNumber || null,
            // Dealer-internal pricing — send null when blank so the server
            // stores NULL (not 0) and old listings don't get phantom zeros.
            purchasePrice: s.purchasePrice ? Number(s.purchasePrice) : null,
            refurbishmentPrice: s.refurbishmentPrice ? Number(s.refurbishmentPrice) : null,
            ageingDays: s.ageingDays ? Number(s.ageingDays) : null,
            finalSellingPrice: s.finalSellingPrice ? Number(s.finalSellingPrice) : null,
          }),
        });
      }
      return api<{ id: string; slug: string }>('/dealer/listings', {
        method: 'POST',
        body: JSON.stringify({
          // Vehicle facts are read server-side from Torque against the VIN —
          // we no longer send them from the client.
          vin: s.vin,
          price: Number(s.price),
          kmsDriven: Number(s.kmsDriven),
          owners: Number(s.owners),
          description: withMileage(s.mileage, s.description),
          images: s.images,
          inspectionReportUrl: s.inspectionUrl || null,
          certificationStatus: s.certificationStatus,
          cpoDocs:
            s.certificationStatus === 'CPO' ? cpoKit.data ?? null : null,
          registrationNumber: s.registrationNumber || null,
          purchasePrice: s.purchasePrice ? Number(s.purchasePrice) : null,
          refurbishmentPrice: s.refurbishmentPrice ? Number(s.refurbishmentPrice) : null,
          ageingDays: s.ageingDays ? Number(s.ageingDays) : null,
          finalSellingPrice: s.finalSellingPrice ? Number(s.finalSellingPrice) : null,
        }),
      });
    },
    onSuccess: () => {
      // Belt-and-braces: drop any legacy draft a previous build may have
      // left in localStorage so the next "Add Listing" click stays clean.
      if (!isEditMode) clearLegacyDraft();
      // Invalidate every consumer of /dealer/listings so the dashboard's
      // Listings Snapshot tile, the My Listings tab counts, the Leads
      // form's listing dropdown, and the sidebar badges all reflect the
      // new row immediately (QA: "Listing Snapshot count not updating").
      qc.invalidateQueries({ queryKey: ['dealer-listings'] });
      // Critical: invalidate the SINGLE-listing edit-hydrate query too
      // (key: ['dealer-listing-edit', editId]). Without this, re-opening
      // a just-edited listing renders the wizard from cached pre-edit
      // data — QA #1 "updated price/description/cert not reflected on
      // dealer side". The list-key invalidation above doesn't cover
      // single-listing keys because they're not prefix-matched.
      if (isEditMode && editId) {
        qc.invalidateQueries({ queryKey: ['dealer-listing-edit', editId] });
      }
      navigate('/listings');
    },
  });

  // Discard Draft — only meaningful in edit mode for a row that's still in
  // DRAFT (an ACTIVE / SOLD listing follows the table-level Remove flow).
  // Soft-removes via DELETE /dealer/listings/:id and bounces back to the
  // table; the listing surfaces under the "Removed" tab if the dealer
  // ever needs to recover the metadata.
  const discard = useMutation({
    mutationFn: () =>
      api(`/dealer/listings/${editId}`, { method: 'DELETE' }),
    onSuccess: () => {
      clearLegacyDraft();
      qc.invalidateQueries({ queryKey: ['dealer-listings'] });
      navigate('/listings');
    },
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
  else if (Number(s.price) > PRICE_MAX)
    missing.push(
      `Selling Price cannot exceed ₹${PRICE_MAX.toLocaleString('en-IN')} (₹1 crore) — please double-check the figure (Step 2)`,
    );
  if (!s.kmsDriven || Number.isNaN(Number(s.kmsDriven)))
    missing.push('Enter KMs Driven (Step 2)');
  else if (Number(s.kmsDriven) > KMS_MAX)
    missing.push(
      `KMs Driven cannot exceed ${KMS_MAX.toLocaleString('en-IN')} km — that's well past any plausible odometer reading (Step 2)`,
    );
  if (!s.owners || Number(s.owners) < 1) missing.push('Pick the number of Owners (Step 2)');
  if (s.description.length < 20)
    missing.push(`Description needs ${20 - s.description.length} more characters (Step 2)`);
  if (s.images.length < 5)
    missing.push(`Add ${5 - s.images.length} more photo${5 - s.images.length === 1 ? '' : 's'} (Step 2 — minimum 5)`);
  if (s.certificationStatus === 'CPO' && !s.registrationNumber)
    missing.push('Enter the Registration Number (Step 3)');
  if (s.certificationStatus === 'CPO' && !s.inspectionUrl)
    missing.push('Upload the 110-point inspection PDF (Step 3)');
  const formValid = missing.length === 0;

  // QA BUG-022: SOLD listings render the entire wizard in strict
  // read-only mode. The earlier fix (BUG-005) only swapped the Submit
  // button for a badge — every input/select/textarea/checkbox/file
  // upload below it stayed interactive. Wrapping the wizard body in
  // a <fieldset disabled> cascades the native `disabled` attribute
  // to every form descendant in one shot (HTML spec behaviour), so
  // dropdowns, image-management buttons, the Discard Draft action,
  // and even file inputs all freeze together. Cancel/Back link is
  // an <a> tag outside the fieldset, so the dealer can still leave.
  const isSoldReadOnly = isEditMode && existing.data?.status === 'SOLD';

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* Header row — title + back button */}
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
        <h1 className="font-headline text-3xl tracking-headline uppercase text-text-on-light">
          Add a <span className="text-hd-orange">Listing</span>
        </h1>
        <Link
          to="/listings"
          className="inline-flex items-center text-xs font-subhead uppercase tracking-subhead text-gray-700 hover:text-hd-orange transition border border-gray-300 px-3 py-1.5"
        >
          ← Back
        </Link>
      </div>

      {isSoldReadOnly && (
        // QA BUG-025: the previous banner used bg-surface-2 (#1A1A1A
        // near-black) with text-text-on-light (#000000 pure black) —
        // black-on-near-black, completely unreadable. Swap to the
        // amber attention pattern used elsewhere (matches the "stuck
        // lead" + "Awaiting Review" treatments): warning-tinted wash,
        // pure black body copy, hd-black header — WCAG AA on both.
        <div className="mb-5 bg-warning/15 border-l-4 border-hd-orange px-4 py-3 flex items-start gap-3">
          <span aria-hidden className="text-hd-orange text-lg leading-none mt-0.5">●</span>
          <div className="text-sm text-hd-black">
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">
              Listing Sold — Read Only
            </p>
            <p className="mt-1 leading-snug text-hd-black">
              This bike has been marked sold. All fields are locked to
              preserve historical record. Contact your H-D admin if you
              need to correct anything on this listing.
            </p>
          </div>
        </div>
      )}

      {/* QA BUG-022: native <fieldset disabled> cascades `disabled` to
          every input/select/textarea/button descendant when the
          listing is SOLD. opacity wash + cursor cue applied alongside
          so the read-only state is visually obvious. */}
      <fieldset
        disabled={isSoldReadOnly}
        className={`space-y-5 ${
          isSoldReadOnly ? 'opacity-75 [&_*]:cursor-not-allowed' : ''
        }`}
      >
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
              // Edit-mode never re-fetches Torque from a typed VIN — the
              // VIN is locked once a listing exists (PRD §6.2.4). The
              // initial hydration still fires fetchVin once on mount to
              // populate the read-only Torque card; that runs from the
              // existing.data effect, not from this form submit.
              if (isEditMode) return;
              if (/^[A-Z0-9]{17}$/.test(s.vin)) fetchVin.mutate(s.vin);
            }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3"
          >
            <Input
              maxLength={17}
              placeholder="1HD1KB4197Y624381"
              className="font-mono text-base"
              value={s.vin}
              // VIN is read-only in edit mode (PRD §6.2.4). updateListing
              // doesn't accept a vin field anyway, so a typed change
              // silently no-ops on submit — but a disabled input makes
              // the lock obvious instead of letting the dealer waste
              // time typing a new VIN they expected to take effect.
              disabled={isEditMode}
              onChange={(e) =>
                update({ vin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), torque: null })
              }
            />
            <Button
              type="submit"
              disabled={
                isEditMode ||
                !/^[A-Z0-9]{17}$/.test(s.vin) ||
                fetchVin.isPending
              }
            >
              {fetchVin.isPending ? 'Fetching…' : 'Fetch from Torque'}
            </Button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            {isEditMode
              ? 'VIN is locked once a listing exists. Remove and re-create the listing if you need to change it.'
              : 'Vehicle details will be auto-fetched from the Torque DMS.'}
          </p>
          {fetchVin.error instanceof ApiError && (
            <div className="mt-3 bg-danger/10 border border-danger p-3 text-sm text-text-on-light">
              <p className="font-subhead uppercase tracking-subhead text-[11px] text-danger">
                {fetchVin.error.code === 'VIN_NOT_ASSIGNED'
                  ? 'VIN not assigned to your dealership'
                  : fetchVin.error.code === 'TORQUE_VIN_NOT_FOUND'
                  ? 'VIN not found in Torque DMS'
                  : 'Could not fetch this VIN'}
              </p>
              {/* VIN_NOT_ASSIGNED: show a friendly explanation with the exact
                  dealer IDs from the server message so the rep knows what to
                  tell the H-D admin. Only fires in LIVE Torque mode — in mock
                  mode the dealer-assignment check is skipped entirely. */}
              {fetchVin.error.code === 'VIN_NOT_ASSIGNED' ? (
                <p className="mt-1 leading-snug">
                  {fetchVin.error.message}
                  <br />
                  <span className="text-gray-600 text-[11px]">
                    This error only appears when Torque is in live mode and the VIN's
                    assigned dealer in the DMS doesn't match your dealership account.
                    Ask your H-D Network Admin to update the assignment in Torque, or
                    pick a VIN from your own inventory.
                  </span>
                </p>
              ) : (
                <p className="mt-1 leading-snug">{fetchVin.error.message}</p>
              )}
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
          {/* QA: restructured from a single 3-col row into a balanced 2×2
              grid so the new Mileage field fits without squeezing the
              existing inputs. Order top-to-bottom, left-to-right:
              Selling Price · KMs Driven / Owners · Mileage (Optional). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Field label="Mileage (Optional)">
              <Input
                inputMode="decimal"
                placeholder="e.g. 18.5 km/l"
                value={s.mileage}
                onChange={(e) => {
                  // Allow digits + a single decimal point. Cap at 3 digits
                  // before the dot and 2 after so the value stays in the
                  // realistic km/l range without runaway precision.
                  let raw = e.target.value.replace(/[^0-9.]/g, '');
                  // Collapse multiple dots to just the first one.
                  const firstDot = raw.indexOf('.');
                  if (firstDot !== -1) {
                    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
                  }
                  const [intPart = '', decPart = ''] = raw.split('.');
                  const trimmed = raw.includes('.')
                    ? `${intPart.slice(0, 3)}.${decPart.slice(0, 2)}`
                    : intPart.slice(0, 3);
                  update({ mileage: trimmed });
                }}
                disabled={torqueLocked}
              />
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

          {/* ── Dealer-internal pricing fields ────────────────────────────
              These four figures are for dealership records only — they are
              stored on the listing row but never surfaced on the buyer
              portal or in any public API response. All four are optional
              so the dealer can submit without filling them. */}
          <div className="mt-2 pt-4 border-t border-gray-100">
            <p className="font-subhead uppercase tracking-subhead text-[11px] text-gray-500 mb-3">
              Internal Pricing (not shown to buyers)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Purchase Price (₹)">
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 14,00,000"
                  value={s.purchasePrice}
                  onChange={(e) =>
                    update({ purchasePrice: e.target.value.replace(/[^0-9]/g, '') })
                  }
                  disabled={torqueLocked}
                />
              </Field>
              <Field label="Refurbishment Price (₹)">
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 55,000"
                  value={s.refurbishmentPrice}
                  onChange={(e) =>
                    update({ refurbishmentPrice: e.target.value.replace(/[^0-9]/g, '') })
                  }
                  disabled={torqueLocked}
                />
              </Field>
              <Field label="Ageing Days">
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 45"
                  value={s.ageingDays}
                  onChange={(e) =>
                    update({ ageingDays: e.target.value.replace(/[^0-9]/g, '') })
                  }
                  disabled={torqueLocked}
                />
              </Field>
              <Field label="Final Selling Price (₹)">
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 16,50,000"
                  value={s.finalSellingPrice}
                  onChange={(e) =>
                    update({ finalSellingPrice: e.target.value.replace(/[^0-9]/g, '') })
                  }
                  disabled={torqueLocked}
                />
              </Field>
            </div>
          </div>
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

          {/* Registration Number — required for CPO certificate generation.
              QA BUG-002: once saved, this field is locked forever. The
              certificate PDF and 110-point inspection report both bake the
              registration number into their rendered output; allowing edits
              after creation would silently desync those artefacts from the
              listing record. Dealers must contact admin to correct typos. */}
          {s.certificationStatus === 'CPO' && (
            <Field label="Registration Number *">
              <Input
                placeholder="e.g. ABC123Y"
                value={s.registrationNumber}
                onChange={(e) => update({ registrationNumber: e.target.value.toUpperCase() })}
                maxLength={20}
                disabled={torqueLocked || (isEditMode && Boolean(existing.data?.registrationNumber))}
              />
              {isEditMode && (
                <p className="mt-1 text-[11px] text-gray-500">
                  Registration number is locked after listing creation to keep
                  the certificate and inspection report in sync. Contact admin
                  to request a correction.
                </p>
              )}
            </Field>
          )}

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
                {/* Download Sample Format — 110-point inspection
                    checklist template (blank, VIN pre-filled). The
                    dealer prints this, performs the inspection, scans
                    the filled copy, and uploads it via the right-hand
                    drop zone. The certificate (separate PDF on the
                    listing page) is auto-generated AFTER upload. */}
                <a
                  href={`/api/v1/inspection/template.pdf?vin=${encodeURIComponent(s.vin)}`}
                  download
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
                  slug={isEditMode ? existing.data?.slug ?? null : null}
                  currentUrl={s.inspectionUrl}
                  meta={s.inspectionMeta}
                  disabled={torqueLocked}
                  onUploaded={(url, meta) =>
                    update({ inspectionUrl: url, inspectionMeta: meta })
                  }
                />
              </div>

              {/* QA: certificate actions only — no inline preview render.
                  Earlier this section embedded the certificate PNG inline
                  which made Step 3 visually cluttered (large image taking
                  up the full step). Replaced with two compact CTA
                  buttons: View opens the PNG in a new tab; Download
                  pulls the PDF. Create-mode (no slug yet) still shows
                  the explanatory placeholder. */}
              {s.inspectionUrl && s.registrationNumber && (
                isEditMode && existing.data?.slug ? (
                  <div className="mt-4 border border-hd-orange/40 p-4">
                    <p className="font-subhead uppercase text-[11px] text-hd-orange mb-3">
                      H-D Certified Certificate
                    </p>
                    <p className="text-xs text-gray-600 mb-3 leading-snug">
                      Certificate auto-generated from this listing&rsquo;s
                      registration number, inspected-by, and certified-on
                      values.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/v1/listings/${existing.data.slug}/certificate.png`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 border border-hd-orange text-hd-orange font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 hover:bg-hd-orange hover:text-hd-black transition"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View Certificate
                      </a>
                      <a
                        href={`/api/v1/listings/${existing.data.slug}/certificate.pdf`}
                        download
                        className="inline-flex items-center gap-1.5 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-4 py-2 hover:brightness-110 transition"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download Certificate
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 border border-hd-orange/40 p-4 bg-orange-50/20 text-sm text-gray-700">
                    <p className="font-subhead uppercase text-[11px] text-hd-orange mb-1">
                      Certificate
                    </p>
                    <p className="text-xs text-gray-600">
                      Certificate will be generated after the listing is submitted and approved.
                    </p>
                  </div>
                )
              )}
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
            <p className="font-subhead uppercase tracking-subhead text-xs text-danger">
              {create.error.code === 'VALIDATION_ERROR'
                ? 'Some fields need attention'
                : create.error.message}
            </p>
            {/* Surface per-field Zod errors verbatim so the dealer sees
                "Selling price cannot exceed ₹1 crore" instead of the
                generic "Invalid request payload" headline. */}
            {create.error.details?.fieldErrors && (
              <ul className="mt-2 space-y-1 text-xs leading-snug">
                {Object.entries(create.error.details.fieldErrors).map(
                  ([field, msgs]) =>
                    msgs && msgs.length > 0 ? (
                      <li key={field}>
                        <span className="font-subhead">{FIELD_LABEL[field] ?? field}:</span>{' '}
                        {msgs.join(' · ')}
                      </li>
                    ) : null,
                )}
              </ul>
            )}
            {create.error.code === 'VALIDATION_ERROR' &&
              !create.error.details?.fieldErrors && (
                <p className="mt-1 text-xs">{create.error.message}</p>
              )}
          </div>
        )}

        {/* Inline "what's missing" checklist — visible whenever the form
            isn't ready to submit. Tells the dealer *exactly* what to do
            next instead of staring at a greyed-out button. */}
        {!formValid && (
          <div className="bg-hd-orange/10 border-2 border-hd-orange p-5">
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

        {/* Footer actions — Cancel · Discard Draft (edit only) · Submit */}
        <div className="flex justify-end gap-3 pt-2 flex-wrap">
          <Link
            to="/listings"
            className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition"
          >
            Cancel
          </Link>
          {isEditMode && existing.data?.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Discard this draft? The VIN, photos, and inspection PDF will be released and the next Add Listing visit will start fresh. The draft moves to the "Removed" tab and cannot be re-submitted.',
                  )
                ) {
                  discard.mutate();
                }
              }}
              disabled={discard.isPending}
              className="border border-danger px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-danger hover:bg-danger hover:text-hd-white transition disabled:opacity-50"
            >
              {discard.isPending ? 'Discarding…' : 'Discard Draft'}
            </button>
          )}
          {/* QA BUG-005: SOLD is terminal. No Submit/Resubmit affordance —
              page acts as read-only record. A small inline notice replaces
              the button so the dealer understands why the action is gone. */}
          {isEditMode && existing.data?.status === 'SOLD' ? (
            <span className="inline-flex items-center px-4 py-2.5 border border-gray-300 bg-surface-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-600">
              Listing sold — locked from edits
            </span>
          ) : (
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
          )}
        </div>
      </fieldset>
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
      className={`bg-hd-white border border-gray-200 p-5 sm:p-6 transition ${
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
      className="inline-flex border border-gray-300 overflow-hidden text-xs font-subhead uppercase tracking-subhead w-full"
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
                ? 'bg-hd-orange text-hd-black'
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
  slug?: string | null;
  currentUrl: string;
  meta: { originalName: string; size: number } | null;
  disabled?: boolean;
  onUploaded: (url: string, meta: { originalName: string; size: number }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Certificate preview modal — shows the H-D Certified certificate image
  // when the dealer clicks "Preview / replace file" after upload.
  const [certPreviewOpen, setCertPreviewOpen] = useState(false);

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
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCertPreviewOpen(true); }}
            className="text-xs text-hd-orange hover:underline mt-2"
          >
            Preview / replace file
          </button>
          {/* Certificate preview modal */}
          {certPreviewOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
              onClick={() => setCertPreviewOpen(false)}
            >
              <div
                className="bg-hd-white max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                  <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
                    H-D Certified Certificate Preview
                  </p>
                  <button
                    type="button"
                    onClick={() => setCertPreviewOpen(false)}
                    className="text-gray-400 hover:text-text-on-light text-xl leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                {/* Certificate image rendered via the API certificate PNG endpoint.
                    In create mode (no slug yet) show a friendly placeholder
                    since the listing doesn't exist in the DB yet. */}
                <div className="p-4">
                  {props.slug ? (
                    <>
                      <img
                        src={`/api/v1/listings/${props.slug}/certificate.png`}
                        alt="H-D Certified Certificate"
                        className="w-full border border-gray-200"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="flex gap-3 mt-4 justify-end">
                        <a
                          href={props.currentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-hd-orange hover:underline"
                        >
                          Open uploaded PDF ↗
                        </a>
                        <a
                          href={`/api/v1/listings/${props.slug}/certificate.pdf`}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-hd-orange hover:underline"
                        >
                          Download Certificate ↓
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="border border-gray-200 bg-gray-50 p-6 text-center">
                      <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light mb-2">
                        Certificate Not Yet Available
                      </p>
                      <p className="text-xs text-gray-600">
                        The H-D Certified certificate will be available once you submit this listing.
                      </p>
                      <div className="flex gap-3 mt-4 justify-center">
                        <a
                          href={props.currentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-hd-orange hover:underline"
                        >
                          Open uploaded PDF ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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

// The five canonical angles a listing must cover (per Figma /Dealer/Halrey
// dealer_page-0002.jpg). Each slot carries:
//   - `label`     short caption rendered inside the empty tile
//   - `cover`     true for the hero/cover photo (slot 0) — the first card
//                 image on the buyer site
//   - `instruction` one-line composition guidance the dealer sees both as
//                 a tooltip on the empty tile and in the bullet list above
//                 the picker. Keep these short and actionable; the goal is
//                 a quick prompt at upload time, not a photography tutorial.
interface PhotoSlotDef {
  label: string;
  instruction: string;
  cover?: boolean;
}
const PHOTO_SLOTS: PhotoSlotDef[] = [
  {
    label: 'Front',
    instruction:
      'Straight-on headlight + handlebar shot. Full bike in frame, level horizon, sun behind you.',
    cover: true,
  },
  {
    label: 'Side',
    instruction:
      'Drive-side (right) profile — full length of the bike, fuel tank centered, no clutter behind.',
  },
  {
    label: 'Rear',
    instruction:
      'Tail-light + exhaust + number plate, straight-on. Gives the buyer a clean back-end view.',
  },
  {
    label: 'Engine',
    instruction:
      'Close-up of the powertrain — cylinders, chrome, model badge. Wipe down before shooting.',
  },
  {
    label: 'Cockpit',
    instruction:
      'Rider point of view — speedometer, switchgear, mirrors, grips. Helps buyers picture the ride.',
  },
];

// Image specs surfaced in the Photos section so the dealer knows the rules
// before they open the file picker. Mirrors the validation in addFiles().
const IMAGE_SPECS = [
  `Upload at least ${MIN_IMAGES} photos, up to ${MAX_IMAGES} total.`,
  'Format: JPG, PNG, or WebP. Each file up to 8 MB.',
  'Landscape orientation looks best — buyers see a 4:3 thumbnail on the search grid.',
  'First photo becomes the cover; reorder by removing & re-uploading in order.',
];

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
  // QA BUG-001: clicking a filled thumbnail used to do nothing useful
  // (and dealers feared it would delete the image). Now it opens a
  // lightbox preview with click-to-zoom. Delete is restricted to the
  // red REMOVE button only.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Local blob-URL preview cache. The server URL goes into FormState
  // (it's what /dealer/listings POST will store), but rendering relies
  // on the local blob — the upload route's serve-side gate would 404
  // before the listing row exists, and a plain <img src=> can't send
  // a bearer token. The blob holds the same bytes, instant render, no
  // round-trip needed. Cleaned up on unmount and on remove.
  const [blobByUrl, setBlobByUrl] = useState<Record<string, string>>({});
  useEffect(() => {
    return () => {
      // Revoke every blob the picker made — leaving them alive keeps
      // the file bytes resident in memory until the page closes.
      Object.values(blobByUrl).forEach((b) => {
        try {
          URL.revokeObjectURL(b);
        } catch {
          /* ignore */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const newBlobs: Record<string, string> = {};
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
        // Mint a blob URL pointing at the original File so the picker
        // renders instantly without waiting for the server URL to
        // become reachable (it might 404 until the listing exists).
        newBlobs[res.url] = URL.createObjectURL(file);
      } catch (e) {
        localErrors.push(`${file.name}: ${e instanceof ApiError ? e.message : 'upload failed'}`);
      }
    }
    setUploading(false);
    if (uploaded.length) {
      setBlobByUrl((prev) => ({ ...prev, ...newBlobs }));
      onChange([...images, ...uploaded]);
    }
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

  // Render five slot tiles in a row (per Figma — Front · Side · Rear ·
  // Engine · Cockpit). Anything the dealer adds beyond those falls into
  // the "extras" row below.
  const slots: { url: string | null; def: PhotoSlotDef; index: number }[] =
    PHOTO_SLOTS.map((def, i) => ({ url: images[i] ?? null, def, index: i }));
  const extras = images.slice(PHOTO_SLOTS.length);

  return (
    <div className="space-y-4">
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

      {/* Spec card — file-format / size / count rules surface BEFORE the
          dealer opens the file picker so a wrong-format upload doesn't
          surprise them with a red error after the fact. */}
      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-[11px] text-gray-700">
        <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500 mb-1.5">
          Photo Requirements
        </p>
        <ul className="space-y-0.5 leading-relaxed">
          {IMAGE_SPECS.map((line) => (
            <li key={line} className="flex items-start gap-1.5">
              <span aria-hidden className="text-hd-orange leading-none mt-0.5">
                ●
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Per-slot composition guide — "Front: straight-on headlight…",
          "Side: drive-side profile…" — also rendered as a tooltip on each
          empty tile via title=. Helps non-photography-trained dealers
          take usable shots without bouncing back to a separate doc. */}
      <div className="bg-orange-50/30 border border-hd-orange/30 rounded p-3 text-[11px] text-text-on-light">
        <p className="font-subhead uppercase tracking-subhead text-[10px] text-hd-orange mb-1.5">
          Required Angles
        </p>
        <ol className="space-y-1 leading-snug">
          {PHOTO_SLOTS.map((slot, i) => (
            <li key={slot.label} className="flex gap-2">
              <span className="font-subhead inline-block min-w-[68px]">
                {i + 1}. {slot.label}
                {slot.cover ? (
                  <span className="text-[9px] text-hd-orange font-subhead uppercase tracking-subhead ml-1">
                    Cover
                  </span>
                ) : null}
              </span>
              <span className="text-gray-700">{slot.instruction}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {slots.map((slot) => (
          <PhotoSlot
            key={slot.index}
            slot={slot}
            // Prefer the local blob (instant render, no auth dance) when
            // the file was just uploaded in this session. Fall back to
            // the server URL on edit-mode hydration / page reload — by
            // then the listing exists OR the dealer has signed in.
            displayUrl={slot.url ? blobByUrl[slot.url] ?? slot.url : null}
            uploading={uploading && slot.index === images.length}
            disabled={disabled}
            onRemove={() => removeAt(slot.index)}
            onPreview={(url) => setLightbox(url)}
          />
        ))}
      </div>

      {extras.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {extras.map((src, i) => {
            const display = blobByUrl[src] ?? src;
            return (
              <div
                key={src}
                className="relative aspect-[4/3] overflow-hidden border border-gray-200 rounded group"
              >
                {/* QA BUG-001: thumbnail is a button that opens the
                    lightbox; the only delete affordance is the red
                    REMOVE button (stopPropagation so its click never
                    bubbles up to the preview-open button). */}
                <button
                  type="button"
                  onClick={() => setLightbox(display)}
                  aria-label="Preview photo"
                  className="block w-full h-full"
                >
                  <img
                    src={display}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(PHOTO_SLOTS.length + i);
                  }}
                  className="absolute top-1 right-1 bg-danger text-hd-white text-[10px] font-subhead uppercase tracking-subhead px-1.5 py-0.5 rounded"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox preview — opens on thumbnail click. Click backdrop or
          press Escape to close; click the image to toggle zoom. */}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}

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
  displayUrl,
  uploading,
  disabled,
  onRemove,
  onPreview,
}: {
  slot: { url: string | null; def: PhotoSlotDef; index: number };
  /** What goes into <img src=>. Usually blob URL for fresh uploads or
      the server URL for hydrated edits. Null for empty slots. */
  displayUrl: string | null;
  uploading: boolean;
  disabled: boolean;
  onRemove: () => void;
  /** QA BUG-001: thumbnail click opens a lightbox preview (not delete).
      Passed only the resolved display URL so the parent can render the
      lightbox without re-resolving blob URLs. */
  onPreview: (url: string) => void;
}) {
  const empty = !slot.url;
  const isCoverSlot = !!slot.def.cover;
  return (
    <label
      htmlFor={empty ? 'listing-image-input' : undefined}
      // Tooltip carries the full one-line composition guidance — visible
      // on hover even after the slot is filled, so a dealer who wants to
      // re-shoot can refresh on what the angle was meant to capture.
      title={`${slot.def.label} — ${slot.def.instruction}`}
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
          {/* Upload arrow on every empty tile (not just the cover slot) so
              the affordance is visually consistent across Front · Side ·
              Rear · Engine · Cockpit. The cover slot still gets a darker
              label below to flag its primacy. */}
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
          <span
            className={`font-subhead uppercase tracking-subhead text-[10px] leading-tight px-2 ${
              isCoverSlot ? 'text-text-on-light' : 'text-gray-500'
            }`}
          >
            {slot.def.label}
          </span>
          {/* Two-line abbreviated instruction inside the empty tile so the
              dealer doesn't have to scroll back up to the bullet list while
              they're holding a phone over the bike. */}
          <span className="block text-[9px] text-gray-500 leading-tight mt-1 px-2 line-clamp-2">
            {slot.def.instruction}
          </span>
        </>
      ) : (
        <>
          {/* QA BUG-001: image is a button → click opens lightbox.
              preventDefault stops the parent <label> from also focusing
              the file input (defence in depth). The red REMOVE button
              below stopPropagations so its click never bubbles up here. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              const url = displayUrl ?? slot.url;
              if (url) onPreview(url);
            }}
            aria-label={`Preview ${slot.def.label} photo`}
            className="block w-full h-full"
          >
            <img
              src={displayUrl ?? slot.url ?? ''}
              alt=""
              className="w-full h-full object-cover"
            />
          </button>
          {isCoverSlot && (
            <span className="absolute top-1 left-1 bg-hd-orange text-hd-black text-[10px] font-subhead uppercase tracking-subhead px-1.5 py-0.5 rounded pointer-events-none">
              Cover
            </span>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
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

// QA BUG-001: lightbox modal for previewing uploaded photos. Mounted by
// ListingImagePicker when a thumbnail is clicked. Backdrop + ESC close;
// clicking the image toggles a 2× zoom. Body scroll is locked while open
// so the wizard underneath doesn't drift when the user pans on mobile.
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 overflow-auto"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close preview"
        className="absolute top-4 right-4 bg-hd-white text-hd-black text-xs font-subhead uppercase tracking-subhead px-3 py-1.5 rounded"
      >
        Close ✕
      </button>
      <img
        src={src}
        alt="Listing photo preview"
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
        className={
          zoomed
            ? 'transition-transform duration-200 cursor-zoom-out scale-150'
            : 'transition-transform duration-200 cursor-zoom-in max-h-[90vh] max-w-[90vw] object-contain'
        }
      />
    </div>
  );
}
