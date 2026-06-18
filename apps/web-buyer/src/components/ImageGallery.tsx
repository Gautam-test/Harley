import { useState } from 'react';

const FALLBACK = '/brand/listing-placeholder.svg';

// Local SVG fallback used when the listing has zero images OR a specific
// image URL 404s mid-render. Inlined as a static asset so it works on
// air-gapped networks and doesn't depend on placehold.co's uptime.
function onImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.dataset.fellBack) {
    img.dataset.fellBack = '1';
    img.src = FALLBACK;
  }
}

export function ImageGallery({
  images,
  alt,
  sold = false,
  certificationStatus,
}: {
  images: string[];
  alt: string;
  /** When true, overlay a "SOLD" watermark on the active image and
   *  desaturate it slightly. Used during the 1-hour visibility window
   *  after a dealer marks the bike sold. */
  sold?: boolean;
  /** When 'CPO' / 'AS_IS', overlay the matching certification badge
   *  at the top-left of the active image (QA spec — VDP Detail.png).
   *  White background per Figma so it pops against the bike photo. */
  certificationStatus?: 'CPO' | 'AS_IS' | null;
}) {
  const [active, setActive] = useState(0);
  const safe = images.length > 0 ? images : [FALLBACK];
  const hasMany = safe.length > 1;
  const go = (delta: number) =>
    setActive((a) => (a + delta + safe.length) % safe.length);

  return (
    <div className="relative aspect-[16/10] bg-surface-2 overflow-hidden group">
      {/* All images rendered stacked & preloaded so the browser caches every
          one on first paint. Only the active image is opaque; the rest sit
          underneath at opacity-0. Result: clicking prev/next is instant
          (no network round-trip), with a subtle cross-fade for polish. */}
      {safe.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt={i === active ? alt : ''}
          aria-hidden={i !== active}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
            i === active ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${sold ? 'grayscale-[35%]' : ''}`}
          // First image loads eagerly per PRD §6.1.3 AC2; the rest load
          // immediately too so prev/next clicks paint without waiting.
          fetchPriority={i === 0 ? 'high' : 'auto'}
          loading="eager"
          decoding="async"
          onError={onImgError}
        />
      ))}

      {/* No corner plate on the gallery — the title-row "H-D CERTIFIED"
          chip below, the 110 PT inspection banner, and the certificate
          card already carry the same signal. Stacking a 4th instance on
          top of the hero photo read as noisy + orphan-y during image
          load. AS-IS bikes also stay plate-free. */}

      {sold && (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span className="-rotate-12 select-none bg-danger/90 text-hd-white font-headline tracking-headline uppercase text-5xl sm:text-6xl px-12 py-3 border-4 border-hd-white shadow-2xl">
            Sold
          </span>
        </div>
      )}

      {/* Slider controls — prev/next arrows overlaid on the hero, plus an
          image counter pill bottom-right. Hidden when there's only one
          image. Arrows fade in on hover at lg+ (touch devices always see
          them). Keyboard-accessible via standard tab order. */}
      {hasMany && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-10 h-10 bg-hd-white/85 hover:bg-hd-white text-hd-black shadow-md transition lg:opacity-0 group-hover:opacity-100"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-10 h-10 bg-hd-white/85 hover:bg-hd-white text-hd-black shadow-md transition lg:opacity-0 group-hover:opacity-100"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <span className="absolute bottom-3 right-3 z-10 bg-hd-black/70 text-hd-white text-[11px] font-subhead uppercase tracking-subhead px-2.5 py-1">
            {active + 1} / {safe.length}
          </span>
        </>
      )}
    </div>
  );
}
