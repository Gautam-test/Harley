import { Link } from 'react-router-dom';

export interface ListingCardData {
  id: string;
  slug: string;
  vin: string;
  modelFamily: string;
  modelName: string;
  year: number;
  price: number;
  kmsDriven: number;
  primaryImage: string;
  certificationStatus: 'CPO' | 'AS_IS';
  dealerName: string;
  city: string;
  /** Dealer's 6-digit PIN code — surfaced on the card so buyers can gauge
   *  proximity without clicking into the detail page. */
  pincode: string;
  colour: string;
  /** Listing status — only ACTIVE and (within 1 hour) SOLD reach the
   *  buyer site. SOLD rows render a watermark overlay and the click is
   *  intercepted on the wrapper. */
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  soldAt: string | null;
}

// Card layout matches the frozen Figma design exactly:
//   ┌────────────────────────┐
//   │ [H-D CERTIFIED badge]  │  ← top-left over photo
//   │     bike photo         │
//   ├────────────────────────┤
//   │  STREET GLIDE SPECIAL  │  ← model, subhead caps
//   │  ⌖ Auckland Motors…    │  ← map-pin + dealer
//   │  C2UUC · 2023 · 8,240… │  ← stock code · year · km · colour
//   │  ₹ 18,90,000           │  ← price
//   │              View Details ›
//   └────────────────────────┘
export function ListingCardItem({ listing }: { listing: ListingCardData }) {
  const stockCode = listing.vin?.slice(-5).toUpperCase() || '';
  const isSold = listing.status === 'SOLD';
  return (
    <Link
      to={`/listings/${listing.slug}`}
      // Click-through still works for SOLD rows so buyers can see the
      // watermark + dealer info on the detail page; after the 1h window
      // the detail will 404, mirroring the search grid hiding the row.
      className={`group block bg-hd-white border border-gray-200 rounded-card overflow-hidden hover:border-hd-orange transition ${
        isSold ? 'opacity-90' : ''
      }`}
    >
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        <img
          src={listing.primaryImage || '/brand/listing-placeholder.svg'}
          alt={`${listing.year} ${listing.modelName}`}
          loading="lazy"
          className={`w-full h-full object-cover transition ${
            isSold ? 'grayscale-[35%]' : 'group-hover:scale-[1.02]'
          }`}
          onError={(e) => {
            // Dealer-uploaded URL 404'd (deleted, wrong path, transient
            // network) — swap to the local placeholder so the card
            // doesn't show the browser's broken-image glyph. Guard with
            // a data flag so an error on the placeholder itself doesn't
            // loop forever.
            const img = e.currentTarget;
            if (!img.dataset.fellBack) {
              img.dataset.fellBack = '1';
              img.src = '/brand/listing-placeholder.svg';
            }
          }}
        />
        {/* SOLD watermark — diagonal banner overlay rendered for the 1-
            hour visibility window after the dealer hits Mark Sold. After
            the window the row drops off the grid entirely (server-side
            filter), so this overlay is the only place a buyer ever sees
            "SOLD" on a card. */}
        {isSold && (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span className="-rotate-12 select-none bg-danger/90 text-hd-white font-headline tracking-headline uppercase text-3xl sm:text-4xl px-8 py-2 border-4 border-hd-white shadow-lg">
              Sold
            </span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          {listing.certificationStatus === 'CPO' ? (
            <span className="inline-block bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[10px] px-2.5 py-1 rounded-card">
              H-D Certified
            </span>
          ) : (
            <span className="inline-block bg-hd-black text-hd-white font-subhead uppercase tracking-subhead text-[10px] px-2.5 py-1 rounded-card">
              As-Is
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-subhead uppercase tracking-subhead text-base text-text-on-light leading-tight">
          {listing.modelName}
        </h3>
        {/* Dropped the italic + bumped to 13px / gray-600 — the H-D brand
            spec keeps body copy upright (italic is an emphasis cut, not a
            default secondary-text styling) and the previous gray-500 12px
            italic was borderline against the white card background. */}
        <p className="flex items-center gap-1.5 text-[13px] text-gray-600 mt-2">
          <MapPin />
          <span className="truncate">
            {listing.dealerName}
            {(listing.city || listing.pincode) && (
              <span className="text-gray-500">
                {' · '}
                {[listing.city, listing.pincode].filter(Boolean).join(' ')}
              </span>
            )}
          </span>
        </p>
        <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">
          {[stockCode, listing.year, `${listing.kmsDriven.toLocaleString('en-IN')} KM`, listing.colour.toUpperCase()]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div>
            <span className="font-headline text-xl text-text-on-light tracking-headline">
              ₹ {listing.price.toLocaleString('en-IN')}
            </span>
            {/* "Ex-showroom" caption — single line so the card stays
                compact. Full disclaimer about RTO / insurance / on-road
                surfaces on the listing detail price card. */}
            <span className="block text-[10px] text-gray-500 leading-tight mt-0.5">
              Indicative ex-showroom
            </span>
          </div>
          <span className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange group-hover:underline">
            View Details ›
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="bg-hd-white border border-gray-200 rounded-card overflow-hidden">
      <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-40 bg-gray-200 animate-pulse" />
        <div className="h-3 w-48 bg-gray-200 animate-pulse" />
        <div className="h-5 w-28 bg-gray-200 animate-pulse" />
      </div>
    </div>
  );
}

function MapPin() {
  return (
    <svg className="w-3 h-3 text-hd-orange shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
  );
}
