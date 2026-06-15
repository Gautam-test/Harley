import { useState } from 'react';
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
  // QA BUG_UI_031: Stock ID restored — derive a 5-char tail from the
  // VIN (the same shorthand the dealer + admin tables use). Falls back
  // to empty string if the listing is missing a VIN somehow.
  const stockCode = listing.vin?.slice(-5).toUpperCase() || '';
  const isSold = listing.status === 'SOLD';
  // SOLD cards stay in the grid for the 1-hour visibility window so a
  // buyer who was tracking this bike sees what happened, but the link is
  // blocked — the detail page now hard-404s for non-ACTIVE statuses, so
  // routing to it would only land on NotFound. Instead, clicking a SOLD
  // card pops a small "This Bike Is Sold" modal explaining the state.
  const [showSoldModal, setShowSoldModal] = useState(false);
  const Tag = (isSold ? 'button' : Link) as React.ElementType;
  const linkProps = isSold
    ? {
        type: 'button' as const,
        'aria-haspopup': 'dialog' as const,
        onClick: () => setShowSoldModal(true),
      }
    : { to: `/listings/${listing.slug}` };
  return (
    <>
    {/* BUG_UI_005 #3: sharp 90° corners — drops the rounded-card
        treatment that gave the cards a "bubbly" feel. Border stays for
        definition; hover orange-border is preserved. */}
    <Tag
      {...linkProps}
      data-testid="listing-card"
      data-listing-status={listing.status}
      className={`group block text-left w-full bg-hd-white border border-gray-200 overflow-hidden transition h-full flex flex-col ${
        isSold ? 'opacity-90 cursor-pointer' : 'hover:border-hd-orange'
      }`}
    >
      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden">
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
        {/* QA BUG_UI_047: badges are now the brand-supplied SVG vector
            assets (geometric black plate with the wordmark + internal
            orange dash). Rendered as <img> directly so the typography,
            kerning, and orange dash are pixel-identical to Figma —
            previously the inline HTML version slipped on letter
            spacing + dash positioning. SVGs:
              • hd-certified-badge.svg — 152×20 black plate, "H-D" + orange dash + "CERTIFIED"
              • as-is-badge.svg        — 52×27 black plate, "AS" + orange dash + "IS" */}
        {/* Only CPO bikes get a corner badge — AS-IS stays plate-free
            per client request so the photo reads cleaner. */}
        {listing.certificationStatus === 'CPO' && (
          <div className="absolute top-3 left-3">
            <img
              src="/brand/badges/hd-certified-badge.svg"
              alt="H-D Certified"
              className="h-5 w-auto"
              width={152}
              height={20}
              decoding="async"
            />
          </div>
        )}
      </div>
      {/* QA BUG_UI_031: card body rebuilt per latest Figma —
            • Title in bold 1903 Sans (kept)
            • Dealer location row with orange pin icon + dealer name
            • Metadata 4-up: [Stock ID] · [Year] · [KM] · [Color Family]
            • Horizontal gray separator between metadata + price
            • Price in wide 1903 Sans (font-subhead font-bold, NOT
              the condensed headline cut that was distorting it)
            • Title-case "View Details >" with plain > chevron
          More generous vertical padding (p-5) so the card breathes. */}
      {/* QA latest: card body is now a flex column with the price
          row pinned to the bottom via mt-auto, so a one-line title
          ("STREET GLIDE SPECIAL") and a two-line title ("PAN AMERICA
          1250 SPECIAL") land their price + View Details on identical
          baselines across the grid. h-full on the wrapper above
          handles the outer height equalisation; the flex-1 spacer
          here absorbs any extra slack inside. */}
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-headline tracking-headline uppercase text-base text-text-on-light leading-tight">
          {listing.modelName}
        </h3>

        {/* Price in orange directly below name — matches NZ reference layout */}
        <p className="font-subhead font-bold text-lg text-hd-orange tracking-subhead mt-1.5">
          ₹ {listing.price.toLocaleString('en-IN')}
        </p>

        {/* Dealer row */}
        <p className="flex items-center gap-1.5 text-[12px] text-gray-600 mt-2">
          <img
            src="/brand/map-pin.svg"
            alt=""
            aria-hidden
            className="w-4 h-4 shrink-0"
            width={16}
            height={16}
            decoding="async"
          />
          <span className="truncate">{listing.dealerName}</span>
        </p>

        {/* Labeled detail rows — font-subhead sets 1903 Sans Condensed
            (same family as title/price). Labels drop to font-normal (400)
            for visual contrast; values stay bold (700) via font-subhead. */}
        <div className="mt-3 space-y-1 text-[12px] font-subhead">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 font-normal">Year:</span>
            <span className="text-gray-800">{listing.year}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 font-normal">Mileage:</span>
            <span className="text-gray-800">{listing.kmsDriven.toLocaleString('en-IN')} KM</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500 font-normal">Location:</span>
            <span className="text-gray-800">{listing.city}</span>
          </div>
          {listing.colour && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-500 font-normal">Colour:</span>
              <span className="text-gray-800 text-right">{listing.colour}</span>
            </div>
          )}
        </div>

        {/* View Details pinned to bottom */}
        {!isSold && (
          <div className="mt-auto pt-3">
            <span className="font-body text-[12px] text-hd-orange group-hover:underline">
              View Details &gt;
            </span>
          </div>
        )}
      </div>
    </Tag>

    {/* "This bike is sold" modal — surfaces when a buyer clicks a SOLD
        card on the search grid. The detail page hard-404s for non-ACTIVE
        rows so click-through doesn't help; this gives a clear explanation
        instead of a silent dead-click. */}
    {isSold && showSoldModal && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`sold-modal-${listing.id}`}
        className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center px-4 py-8 overflow-y-auto"
        onClick={() => setShowSoldModal(false)}
      >
        <div
          className="bg-hd-white border-t-4 border-hd-orange max-w-sm w-full p-5 sm:p-6 shadow-xl my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-baseline justify-between">
            <h2
              id={`sold-modal-${listing.id}`}
              className="font-subhead uppercase tracking-subhead text-text-on-light text-base"
            >
              This Motorcycle Is Sold
            </h2>
            <button
              type="button"
              onClick={() => setShowSoldModal(false)}
              aria-label="Close"
              className="text-gray-500 hover:text-text-on-light text-sm"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-700 mt-3 leading-relaxed">
            The {listing.year} {listing.modelName} has been sold and is no
            longer available. Browse the rest of our approved used stock to
            find another ride.
          </p>
          <div className="flex justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={() => setShowSoldModal(false)}
              className="border border-gray-300 px-5 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition"
            >
              OK
            </button>
            <Link
              to="/search"
              onClick={() => setShowSoldModal(false)}
              className="bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-5 py-2 hover:brightness-110 transition"
            >
              Browse Stock →
            </Link>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export function ListingCardSkeleton() {
  // Matches ListingCardItem: sharp corners (no rounded-card) per BUG_UI_005 #3.
  return (
    <div className="bg-hd-white border border-gray-200 overflow-hidden">
      <div className="aspect-[16/10] bg-gray-200 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-40 bg-gray-200 animate-pulse" />
        <div className="h-3 w-48 bg-gray-200 animate-pulse" />
        <div className="h-5 w-28 bg-gray-200 animate-pulse" />
      </div>
    </div>
  );
}

// MapPin glyph removed along with the location row (BUG_UI_005 #5).
