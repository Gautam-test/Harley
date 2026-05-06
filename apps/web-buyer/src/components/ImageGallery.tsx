import { useState } from 'react';

export function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safe = images.length > 0 ? images : ['https://placehold.co/1200x900/000000/FF6600?text=H-D'];

  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] bg-surface-2 overflow-hidden">
        <img
          src={safe[active]}
          alt={alt}
          className="w-full h-full object-cover"
          // First image loads eagerly per PRD §6.1.3 AC2; thumbnails are small.
          fetchPriority="high"
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
              <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
