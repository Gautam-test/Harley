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

export function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safe = images.length > 0 ? images : [FALLBACK];

  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] bg-surface-2 overflow-hidden">
        <img
          src={safe[active]}
          alt={alt}
          className="w-full h-full object-cover"
          // First image loads eagerly per PRD §6.1.3 AC2; thumbnails are small.
          fetchPriority="high"
          onError={onImgError}
        />
      </div>
      {safe.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {safe.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setActive(i)}
              className={`aspect-[4/3] overflow-hidden border-2 transition ${
                i === active ? 'border-hd-orange' : 'border-surface-2 hover:border-text-secondary'
              }`}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                onError={onImgError}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
