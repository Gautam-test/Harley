import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button } from '@hd-cpo/ui';
import { api } from '../lib/api';

interface AdminListingDetail {
  id: string;
  slug: string;
  vin: string;
  modelFamily: string;
  modelName: string;
  year: number;
  colour: string;
  price: number;
  kmsDriven: number;
  description: string | null;
  images: string[];
  certificationStatus: 'CPO' | 'AS_IS';
  inspectionReportUrl: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  publishedAt: string | null;
  createdAt: string;
  dealer: {
    id: string;
    name: string;
    city: string;
    pincode: string;
    phone: string | null;
  };
}

interface DrawerProps {
  listingId: string | null;
  onClose: () => void;
  onPublish: (id: string) => void;
  onDeactivate: (id: string) => void;
  onRemove: (id: string) => void;
  publishing?: boolean;
}

export function ListingPreviewDrawer({
  listingId,
  onClose,
  onPublish,
  onDeactivate,
  onRemove,
  publishing,
}: DrawerProps) {
  const open = listingId !== null;

  // Close on Esc — small affordance reviewers expect from a side drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data, isLoading, error } = useQuery({
    enabled: open,
    queryKey: ['admin-listing-detail', listingId],
    queryFn: () => api<AdminListingDetail>(`/admin/listings/${listingId}`),
    // Force fresh-from-server on every drawer open. The dealer can edit
    // the listing between the admin opening this drawer the first time
    // and reopening it after asking for changes — without this, the
    // global staleTime: 30_000 served stale price/description/cert from
    // before the dealer's PATCH (QA #1 "updates not reflected on admin
    // side"). The cost is one extra GET per drawer open, which is
    // acceptable for a low-traffic admin review surface.
    refetchOnMount: 'always',
    staleTime: 0,
  });

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[680px] bg-hd-white shadow-2xl border-l border-gray-200 transform transition-transform overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {open && (
          <>
            <div className="sticky top-0 bg-hd-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-headline text-2xl tracking-headline text-text-on-light">
                Listing Preview
              </h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-text-on-light text-2xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {isLoading && <div className="p-6 text-gray-500">Loading…</div>}
            {error && <div className="p-6 text-danger">Failed to load listing.</div>}
            {data && <DrawerBody listing={data} />}

            {data && (
              <div className="sticky bottom-0 bg-hd-white border-t border-gray-200 px-6 py-4 flex flex-wrap gap-2 justify-end">
                {data.status === 'DRAFT' && (
                  <Button onClick={() => onPublish(data.id)} disabled={publishing}>
                    {publishing ? 'Publishing…' : 'Publish'}
                  </Button>
                )}
                {(data.status === 'ACTIVE' || data.status === 'DRAFT') && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Take "${data.year} ${data.modelName}" offline? Buyers will no longer see it on search.`,
                          )
                        ) {
                          onDeactivate(data.id);
                        }
                      }}
                    >
                      Deactivate
                    </Button>
                    <Button variant="ghost" onClick={() => onRemove(data.id)}>
                      Remove
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function DrawerBody({ listing }: { listing: AdminListingDetail }) {
  const [activeImg, setActiveImg] = useState(0);
  const img = listing.images[activeImg] ?? listing.images[0] ?? null;
  return (
    <div className="px-6 py-5 space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h3 className="font-headline text-3xl tracking-headline text-text-on-light">
            {listing.year} {listing.modelName}
          </h3>
          <StatusBadge status={listing.status} />
        </div>
        <p className="text-sm text-gray-600">
          {listing.modelFamily} · {listing.colour} · {listing.kmsDriven.toLocaleString('en-IN')} km
        </p>
        <div className="flex items-center gap-3 mt-2">
          {listing.certificationStatus === 'CPO' ? (
            <Badge variant="cpo">CPO</Badge>
          ) : (
            <Badge variant="as-is">As-Is</Badge>
          )}
          <span className="font-headline text-2xl text-hd-orange">
            ₹{listing.price.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      <div>
        <div className="aspect-[16/10] bg-gray-100 overflow-hidden rounded">
          {img ? (
            <img src={img} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              No images uploaded
            </div>
          )}
        </div>
        {listing.images.length > 1 && (
          <div className="grid grid-cols-6 gap-2 mt-2">
            {listing.images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setActiveImg(i)}
                className={`aspect-[4/3] overflow-hidden border-2 ${
                  i === activeImg ? 'border-hd-orange' : 'border-transparent'
                }`}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Section label="Description">
        {listing.description ? (
          <p className="text-sm text-text-on-light whitespace-pre-wrap leading-relaxed">
            {listing.description}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">No description provided.</p>
        )}
      </Section>

      <Section label="Specs">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <SpecRow k="VIN" v={<span className="font-mono text-xs">{listing.vin}</span>} />
          <SpecRow k="Slug" v={<span className="font-mono text-xs">{listing.slug}</span>} />
          <SpecRow k="Year" v={listing.year} />
          <SpecRow k="Colour" v={listing.colour} />
          <SpecRow k="KMs Driven" v={`${listing.kmsDriven.toLocaleString('en-IN')} km`} />
          <SpecRow k="Family" v={listing.modelFamily} />
          <SpecRow k="Created" v={new Date(listing.createdAt).toLocaleString('en-IN')} />
          <SpecRow
            k="Published"
            v={listing.publishedAt ? new Date(listing.publishedAt).toLocaleString('en-IN') : '—'}
          />
        </dl>
      </Section>

      <Section label="Inspection Report">
        {listing.inspectionReportUrl ? (
          <a
            href={listing.inspectionReportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-hd-orange hover:underline text-sm"
          >
            Open inspection PDF ↗
          </a>
        ) : (
          <p className="text-sm text-danger">⚠ No inspection report attached.</p>
        )}
      </Section>

      <Section label="Dealer">
        <div className="text-sm text-text-on-light">
          <div className="font-subhead">{listing.dealer.name}</div>
          <div className="text-gray-600">
            {[listing.dealer.city, listing.dealer.pincode].filter(Boolean).join(' · ')}
          </div>
          {listing.dealer.phone && <div className="text-gray-600">{listing.dealer.phone}</div>}
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="font-subhead uppercase tracking-subhead text-xs text-gray-500 mb-2">
        {label}
      </h4>
      {children}
    </section>
  );
}

function SpecRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-500">{k}</dt>
      <dd className="text-text-on-light">{v}</dd>
    </>
  );
}

function StatusBadge({ status }: { status: AdminListingDetail['status'] }) {
  const tone =
    status === 'ACTIVE'
      ? 'success'
      : status === 'DRAFT'
      ? 'info'
      : status === 'SOLD'
      ? 'warning'
      : status === 'DEACTIVATED'
      ? 'warning'
      : 'danger'; // REMOVED
  return (
    <Badge variant="status" tone={tone}>
      {status}
    </Badge>
  );
}
