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
   *  at the top-left of the active image (QA spec — VDP). White
   *  background per Figma so it pops against the dark bike photo. */
  certificationStatus?: 'CPO' | 'AS_IS' | null;
}) {
  const [active, setActive] = useState(0);
  const safe = images.length > 0 ? images : [FALLBACK];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] bg-surface-2 overflow-hidden">
        <img
          src={safe[active]}
          alt={alt}
          className={`w-full h-full object-cover ${sold ? 'grayscale-[35%]' : ''}`}
          // First image loads eagerly per PRD §6.1.3 AC2; thumbnails are small.
          fetchPriority="high"
          onError={onImgError}
        />
        {/* QA latest (VDP Detail.png): H-D CERTIFIED / AS-IS badge
            overlaid on the top-left of the active image with a clean
            #FFFFFF background per Figma. Previously the only
            certification chip was in the title row below the gallery
            (and rendered black) — QA wants the chip on the photo
            itself with a white plate so it reads as a brand stamp
            against the photo. */}
        {certificationStatus === 'CPO' && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-hd-white text-hd-black font-subhead font-bold uppercase tracking-subhead text-[11px] px-3 py-1.5 shadow-sm">
            <span>H-D</span>
            <span aria-hidden className="inline-block h-[2px] w-2 bg-hd-orange" />
            <span>CERTIFIED</span>
          </span>
        )}
        {certificationStatus === 'AS_IS' && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-hd-white text-hd-black font-subhead font-bold uppercase tracking-subhead text-[11px] px-3 py-1.5 shadow-sm">
            <span>AS</span>
            <span aria-hidden className="inline-block h-[2px] w-2 bg-hd-orange" />
            <span>IS</span>
          </span>
        )}
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
      </div>
      {safe.length > 1 && (
        // QA latest: thumbnail grid is exactly 4 wide-aspect cells per
        // Figma. Capped at 4 even when more images exist; any extra
        // thumbs are dropped (rarely happens — dealers upload 1-6).
        <div className="grid grid-cols-4 gap-2">
          {safe.slice(0, 4).map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-[4/3] overflow-hidden border-2 transition ${
                i === active ? 'border-hd-orange' : 'border-surface-2 hover:border-text-secondary'
              }`}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className={`w-full h-full object-cover ${sold ? 'grayscale-[35%]' : ''}`}
                onError={onImgError}
              />
              {sold && (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center pointer-events-none -rotate-12 bg-danger/80 text-hd-white font-headline tracking-headline uppercase text-[10px]"
                >
                  Sold
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
