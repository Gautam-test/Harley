import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Reusable dark-with-photo hero band used across the buyer site so every page
// banner shares the same visual language (orange-emphasis headline, gradient
// overlay, fade-to-black bottom). Image URLs all hit the medialinksonline H-D
// CDN that the listing seed uses, so they are guaranteed to load.
//
// Usage:
//   <PageHero title="Search" emphasis="Stock" subtitle="…" image={HERO.fatBoy} />

// Local hero photographs (in public/heros/) — lifestyle / dealership shots that
// hold up well under the dark gradient overlay. Served by Vite straight from
// the app's public directory so banners aren't tied to an external CDN.
//   home         — H-D rider on a sunset highway (matches the home freeze)
//   searchStock  — H-D Sport Glide parked at sunset by water (matches Search)
//   sellBike     — H-D LiveWire urban (matches Sell Your Bike)
//
// The studio-shot fallbacks below are kept for non-marquee heroes (Track,
// Dealers, info pages, static pages) — those have darker overlays and the
// flat-white-background bike silhouette reads cleanly enough there.
export const HERO = {
  // Local lifestyle banners (preferred for the high-traffic pages).
  home: '/heros/home.jpg',
  searchStock: '/heros/search-stock.jpg',
  sellBike: '/heros/sell-bike.jpg',

  // CDN studio shots (per-bike, used for inner pages).
  streetGlide: 'https://images.medialinksonline.com/8825026x2200x1100xFFFFFFxH.jpg',
  fatBoy: 'https://images.medialinksonline.com/8822481x2200x1100xFFFFFFxH.jpg',
  panAmerica: 'https://images.medialinksonline.com/8825071x2200x1100xFFFFFFxH.jpg',
  roadKing: 'https://images.medialinksonline.com/8825087x2200x1100xFFFFFFxH.jpg',
  heritage: 'https://images.medialinksonline.com/8225108x2200x1100xFFFFFFxH.jpg',
  sportster: 'https://images.medialinksonline.com/8825049x2200x1100xFFFFFFxH.jpg',
  lowRider: 'https://images.medialinksonline.com/8757963x2200x1100xFFFFFFxH.jpg',
  streetBob: 'https://images.medialinksonline.com/8825065x2200x1100xFFFFFFxH.jpg',
  iron883: 'https://images.medialinksonline.com/8374923x2200x1100xFFFFFFxH.jpg',
} as const;

interface BreadcrumbItem {
  label: string;
  /** Route path. When omitted, renders as the current (terminal) crumb. */
  to?: string;
}

interface PageHeroProps {
  /** Words rendered in white before the orange emphasis word. */
  title: string;
  /** The single word rendered in H-D orange. */
  emphasis: string;
  /** Optional copy under the headline. By default rendered in Title Case
   *  (sentence-friendly), not uppercase — BUG_UI_008 #4 flagged the
   *  forced uppercase as a readability regression. */
  subtitle?: string;
  /** Background image URL — pick from `HERO`. */
  image?: string;
  /** Vertical scale: tighter for utility pages, taller for marketing. */
  size?: 'sm' | 'md' | 'lg';
  /** Optional breadcrumb trail rendered above the headline. Last item is
   *  always the current page (orange + non-link). */
  breadcrumbs?: BreadcrumbItem[];
  /** Optional content rendered below the headline (e.g. a search form). */
  children?: ReactNode;
}

export function PageHero({
  title,
  emphasis,
  subtitle,
  image = HERO.streetGlide,
  size = 'md',
  breadcrumbs,
  children,
}: PageHeroProps) {
  const padY =
    size === 'lg' ? 'py-24 md:py-28' : size === 'sm' ? 'py-14 md:py-16' : 'py-20 md:py-24';
  // Responsive headline scaling:
  //   sm (utility heroes / Track, Sell): 30 → 48 → 56 px
  //   md (info pages / 404):              36 → 56 → 64 px
  //   lg (marquee — Search Stock):        48 → 64 → 72 → 80 px (capped)
  // The lg variant was at lg:text-[88px] which broke layout under 1024px
  // and looked oversized on ultra-wide. Capping at 80px (xl) keeps
  // headlines proportionate across every breakpoint.
  const titleSize =
    size === 'lg'
      ? 'text-[30px] sm:text-5xl md:text-6xl lg:text-7xl xl:text-[80px]'
      : size === 'sm'
      ? 'text-[26px] sm:text-3xl md:text-5xl'
      : 'text-3xl sm:text-4xl md:text-6xl';

  return (
    <section className="relative bg-hd-black overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-50"
        style={{ backgroundImage: `url("${image}")` }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.92) 100%)',
        }}
        aria-hidden
      />
      <div className={`relative max-w-container mx-auto px-6 text-center ${padY}`}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="font-subhead font-medium uppercase tracking-[0.18em] text-[11px] md:text-xs mb-6"
          >
            <ol className="inline-flex items-center justify-center flex-wrap gap-x-2 text-hd-white">
              {breadcrumbs.map((bc, i) => {
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <li key={`${bc.label}-${i}`} className="inline-flex items-center gap-x-2">
                    {bc.to && !isLast ? (
                      <Link to={bc.to} className="hover:text-hd-orange transition">
                        {bc.label}
                      </Link>
                    ) : (
                      <span className={isLast ? 'text-hd-orange' : ''}>{bc.label}</span>
                    )}
                    {!isLast && <span aria-hidden className="text-hd-white/60">/</span>}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1
          className={`font-subhead font-bold ${titleSize} tracking-subhead uppercase text-hd-white leading-[0.95]`}
        >
          {title} <span className="text-hd-orange">{emphasis}</span>
        </h1>
        {subtitle && (
          // BUG_UI_008 #4: rendered in Title Case (not forced uppercase),
          // body face, slightly larger. Caller controls the literal casing
          // of the string they pass in; we no longer apply text-transform.
          <p className="font-body text-sm md:text-base text-text-secondary mt-5 max-w-3xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
