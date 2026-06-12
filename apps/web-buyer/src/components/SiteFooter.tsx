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
      <div className="max-w-container mx-auto px-6 py-6 md:py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand wordmark — same SVG file and height as the SiteHeader so
            the logo is pixel-identical in both positions. The light variant
            (white fill) is correct here because the footer background is
            hd-black, matching the dark header. */}
        <Link
          to="/"
          aria-label="H-D Certified — home"
          className="shrink-0 opacity-90 hover:opacity-100 transition"
        >
          <img
            src="/brand/hd-certified-wordmark-light.svg"
            alt="H-D Certified™"
            className="h-4 w-auto"
            width={225}
            height={16}
            decoding="async"
          />
        </Link>

        {/* Inline link row. Pipe dividers between items. On mobile the
            row wraps and the pipes are hidden via the last:hidden
            sibling rule. */}
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
      </div>
    </footer>
  );
}
