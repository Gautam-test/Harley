import { Link } from 'react-router-dom';

// BUG_UI_010 rebuild — the Figma footer is a minimalist single horizontal
// inline bar (NOT the multi-column fat footer the earlier BUG_UI_007
// iteration produced). This version supersedes that one:
//
//   Layout : flex row — brand wordmark on the far left, 4 pipe-separated
//            links on the right ("Privacy Policy | Cookie Policy |
//            About us | Contact Us"). Wraps to a stack on mobile so the
//            links don't overflow.
//   Brand  : "H-D CERTIFIED" in 1903 Sans (wide), solid white, with a
//            single orange dash glyph between "H" and "D" — no
//            "CERTIFIED" recolor.
//   Drops  : the entire copyright/trademark sub-bar (not in the Figma
//            spec per BUG_UI_010 #4).
//   Drops  : the "Cookie Policy" link was missing from the previous
//            build — added here. "About us" stays lowercase 'u'.
//   Drops  : the previous Search Stock / Sell Your Bike / Track
//            Enquiry / FAQ / Terms & Conditions links — not in the
//            Figma spec per BUG_UI_010 #3.
const LINKS: { to: string; label: string }[] = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/cookies', label: 'Cookie Policy' },
  // Client feedback #8: Terms & Conditions link added. /terms route
  // is already wired in App.tsx to StaticPage contentKey="terms".
  { to: '/terms', label: 'Terms & Conditions' },
  { to: '/about', label: 'About us' },
  { to: '/contact', label: 'Contact Us' },
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
