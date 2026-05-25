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
  { to: '/about', label: 'About us' },
  { to: '/contact', label: 'Contact Us' },
];

export function SiteFooter() {
  return (
    <footer className="bg-hd-black border-t border-surface-2 mt-16">
      <div className="max-w-container mx-auto px-6 py-6 md:py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand wordmark to match the SiteHeader. The bar-and-shield
            variant was introduced in an earlier iteration but the latest
            Figma reverts both header AND footer to the wordmark. */}
        <Link
          to="/"
          aria-label="H-D Certified — home"
          className="inline-flex items-center font-subhead font-bold uppercase tracking-[0.18em] text-base md:text-lg text-hd-white hover:text-hd-white/80 transition"
        >
          <span>H</span>
          <span aria-hidden className="inline-block w-3 h-[3px] bg-hd-orange mx-2 align-middle" />
          <span>D Certified</span>
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
