/**
 * H-D CPO Marketplace — Tailwind preset
 *
 * Source of truth: Harley-Davidson 2026 Brand Guidelines (Feb 2026 edition),
 * pages 67 (Our Colors) and 70-71 (our typographic style).
 *
 * COLOURS (page 67, "harley-davidson colors")
 *   harley-davidson orange  PMS 165C    #FF6600   used in small amounts, for emphasis
 *   harley-davidson black   PMS Black 6c #000000  dominates
 *   bright white                         #FFFFFF  used in moderation
 *
 * Note: there is a separate "Factory Racing" palette (PMS 179c orange #E34D1E,
 * PMS 293c blue #0F3682, PMS 185c red #C31919). These are reserved for racing
 * campaigns and championship celebrations only — NOT used in this marketplace.
 *
 * TYPEFACE (page 70, "1903" custom typeface, designed in 2022)
 *   1903 Sans Condensed (Italic / Bold / Bold Italic) — Headlines
 *   1903 Sans           (Italic / Bold / Bold Italic) — Subheads + Body
 *   1903 Serif          (Italic / Bold / Bold Italic) — Body alt for text-heavy
 *
 * TYPE STYLE RULES (page 71)
 *   Headlines: 1903 Bold Condensed, ALL CAPS, DO NOT track out, leading TIGHT.
 *   Subheads:  1903 Bold,           ALL CAPS, letter spacing may be opened slightly.
 *   Body:      1903 Regular, normal letter spacing and leading, sentence case.
 *   Body alt:  1903 Serif,  for text-intensive applications (magazines / captions).
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // ─── Brand core (page 67) ───
        'hd-orange': '#FF6600', // PMS 165C
        'hd-black': '#000000', // PMS Black 6c
        'hd-white': '#FFFFFF', // Bright White

        // ─── App-only neutrals (not from brand book; used for surfaces) ───
        surface: {
          0: '#000000', // hero / masthead
          1: '#111111',
          2: '#1A1A1A',
          light: '#F5F5F5', // off-white page wash for content sections
        },
        text: {
          primary: '#FFFFFF', // text on dark surfaces
          secondary: '#B3B3B3',
          'on-light': '#000000', // text on light surfaces
        },

        // ─── Semantic UI states (not brand colours; restricted to status messages) ───
        success: '#16A34A',
        warning: '#FACC15',
        danger: '#DC2626',
        info: '#555555',
      },

      fontFamily: {
        // The licensed "1903" family is proprietary (PRD Open Question 9). When the
        // foundry-supplied web fonts arrive, drop them into apps/web-*/public/fonts/
        // and add the @font-face declarations in packages/ui/src/styles.css under
        // the `1903 Sans Condensed`, `1903 Sans`, `1903 Serif` family names — this
        // cascade picks them up automatically. Until then, Bebas Neue (display) and
        // Inter (body) are the documented fallbacks.
        headline: ['"1903 Sans Condensed"', '"Bebas Neue"', 'Oswald', 'Impact', 'sans-serif'],
        subhead: ['"1903 Sans"', '"1903 Sans Condensed"', '"Bebas Neue"', 'Inter', 'sans-serif'],
        body: ['"1903 Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"1903 Serif"', 'Georgia', '"Times New Roman"', 'serif'],
        // QA BUG-021: override Tailwind's default `sans` so the preflight
        // cascade (`html { font-family: theme('fontFamily.sans') }`) and
        // any accidental `font-sans` utility use lands on the brand body
        // chain — NOT the OS sans stack. Form controls inherit from this
        // via Tailwind's `font-family: inherit` preflight on buttons/
        // inputs/selects/textareas, so the whole UI stays on 1903 Sans
        // without per-component declarations.
        sans: ['"1903 Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },

      letterSpacing: {
        // Brand rule (p. 71): "Do not track out" headlines — keep them at 0
        // (or fractionally tighter) so the condensed weight stays poster-tight.
        headline: '0',
        // Brand rule (p. 71): subheads "may be opened up slightly".
        subhead: '0.05em',
      },

      lineHeight: {
        // Brand rule (p. 71): headline leading should be "relatively tight".
        headline: '0.95',
        subhead: '1.15',
      },

      borderRadius: {
        DEFAULT: '0.25rem',
        card: '0.5rem',
      },

      boxShadow: {
        'hd-glow': '0 0 0 2px #FF6600',
      },

      maxWidth: {
        // Standard content cap — works for 1366 / 1440 / 1600 laptops.
        container: '1280px',
        // Wider cap for marketing surfaces (hero, dealer locator) on
        // 1920+ displays so the content doesn't look orphaned in a
        // narrow column with vast side margins.
        'container-wide': '1440px',
      },
      screens: {
        // Tailwind defaults: sm 640, md 768, lg 1024, xl 1280, 2xl 1536.
        // Adding a custom "3xl" 1920 breakpoint so we can tune type
        // / layout for ultra-wide displays separately from 2xl.
        '3xl': '1920px',
      },
    },
  },
  plugins: [],
};
