import { Link } from 'react-router-dom';

const LINKS: { to: string; label: string }[] = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/cookies', label: 'Cookie Policy' },
  // Client feedback #8: Terms & Conditions link added. /terms route
  // is already wired in App.tsx to StaticPage contentKey="terms".
  { to: '/terms', label: 'Terms & Conditions' },
];

export function SiteFooter() {
  return (
    <footer className="bg-hd-black border-t border-surface-2 mt-16">
      {/* Brand Guidelines p.63-65: RIDE wordmark footer band — orange, ALL CAPS */}
      <div className="border-b border-surface-2 py-4 text-center">
        <p
          className="font-headline font-bold uppercase tracking-headline text-hd-orange leading-none select-none"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          aria-hidden="true"
        >
          RIDE.
        </p>
      </div>

      <div className="max-w-container mx-auto px-6 py-6 md:py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Brand marks — Bar & Shield + H-D Certified wordmark */}
        <Link
          to="/"
          aria-label="H-D Certified — home"
          className="flex items-center gap-3 shrink-0 opacity-90 hover:opacity-100 transition"
        >
          <img
            src="/brand/hd-bar-shield.svg"
            alt="Harley-Davidson"
            className="h-[36px] w-auto"
            width={48}
            height={36}
            decoding="async"
          />
          <img
            src="/brand/hd-certified-wordmark-light.svg"
            alt="H-D Certified™"
            className="h-[22px] w-auto"
            width={308}
            height={22}
            decoding="async"
          />
        </Link>

        <div className="flex flex-col gap-3 md:items-end">
          {/* Inline link row */}
          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[13px] text-hd-white">
              {LINKS.map((l, i) => (
                <li key={l.to} className="inline-flex items-center gap-x-3">
                  <Link to={l.to} className="hover:text-hd-orange transition">
                    {l.label}
                  </Link>
                  {i < LINKS.length - 1 && (
                    <span aria-hidden className="text-hd-white/40">|</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          {/* Brand Guidelines p.72: Harley-Davidson name + copyright */}
          <p className="font-body text-[12px] text-hd-white/50">
            &copy; 2026 Harley-Davidson Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
