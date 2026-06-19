import type { ReactNode } from 'react';

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
  // QA BUG_UI_027 #1: brand-supplied "background" SVG — multi-bike
  // shot in front of industrial shipping containers, with the dark
  // overlay gradient baked into the asset itself (90% black-to-
  // transparent vertical gradient). Replaces the prior single-bike-
  // by-water JPG. The SVG is large (~3.5 MB) because it embeds the
  // raster; HTTP gzip + browser cache amortise it after first visit.
  searchStock: '/heros/search-stock-bg.svg',
  sellBike: '/heros/sell-bike.jpg',
  // QA BUG_UI_043: brand-supplied Track.svg — outdoor scenic mountain
  // trail landscape backdrop with the dark overlay baked in. Replaces
  // the panAmerica studio shot the Track Enquiry hero was using as a
  // placeholder while the brand asset was pending.
  track: '/heros/track-bg.svg',
  // QA latest (About page): brand-supplied About.svg — wide scenic
  // outdoor adventure route with twin touring motorcycles parked by
  // water. Replaces the iron883 indoor studio shot used as the
  // placeholder. Same dark-gradient bake as the other hero assets so
  // the headline stays legible.
  about: '/heros/about-bg.svg',

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
  /** Optional content rendered below the headline (e.g. a search form). */
  children?: ReactNode;
  /** Optional desktop pixel height override (Figma-spec heroes that
   *  must be locked to an exact canvas height — e.g. Track Enquiry
   *  380px per BUG_UI_043). Mobile still flows naturally. */
  heightPx?: number;
  /** Optional desktop headline size override (e.g. Track Enquiry
   *  needs 56px per BUG_UI_043; the 'sm' default jumps to 60px). */
  titlePx?: number;
  /** Skip the background photo entirely and render a flat solid
   *  black banner (Cookie Notice / future legal pages — QA spec
   *  flagged the scenic image as off-brand for legal headers). */
  solidBlack?: boolean;
}

export function PageHero({
  title,
  emphasis,
  subtitle,
  image = HERO.streetGlide,
  size = 'md',
  children,
  heightPx,
  titlePx,
  solidBlack,
}: PageHeroProps) {
  const padY =
    size === 'lg' ? 'py-24 md:py-28' : size === 'sm' ? 'py-14 md:py-16' : 'py-20 md:py-24';
  // QA latest: BOTH "lg" (Search Stock marquee) and "sm" (Track
  // Enquiry compact hero) headlines hit exactly 60px on desktop per
  // Figma. The visual difference is in vertical padding (sm = py-14,
  // lg = py-24+), not in the headline size itself. `titlePx` overrides
  // when a specific page (e.g. Track Enquiry 56px) needs a different
  // desktop size without falling out of the standard scaling ladder —
  // applied via inline style below (Tailwind JIT can't synthesise
  // `text-[${px}px]` from a runtime template literal).
  const titleSize = titlePx
    ? 'text-[26px] sm:text-4xl md:text-5xl'
    : size === 'lg'
    ? 'text-[30px] sm:text-5xl md:text-[56px] lg:text-[60px]'
    : size === 'sm'
    ? 'text-[28px] sm:text-4xl md:text-5xl lg:text-[60px]'
    : 'text-3xl sm:text-4xl md:text-6xl';

  // When a hard height is requested, drop the symmetric padY (the
  // wrapper centres content via flex below) so we hit the Figma
  // pixel-perfect canvas. Mobile still gets a sensible min-height.
  const heightStyle = heightPx
    ? { minHeight: `${heightPx}px`, height: `${heightPx}px` }
    : undefined;

  return (
    <section
      className="relative bg-hd-black overflow-hidden"
      style={heightStyle}
    >
      {/* QA BUG_UI_027: the brand-supplied search-stock-bg.svg has its
          own dark gradient baked in (90% opacity), so we removed the
          previous `opacity-50` photo dimming + softened the overlay so
          the bikes + containers are visible behind the headline.
          When `solidBlack` is set the photo + overlay layers are
          skipped entirely — the bg-hd-black section fill is the only
          paint (Cookie Notice / legal-pages spec). */}
      {!solidBlack && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${image}")` }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.55) 100%)',
            }}
            aria-hidden
          />
        </>
      )}
      <div
        className={`relative max-w-container mx-auto px-6 text-center ${
          heightPx ? 'h-full flex flex-col items-center justify-center py-8' : padY
        }`}
      >
        <h1
          className={`font-subhead font-bold ${titleSize} tracking-subhead uppercase text-hd-white leading-[0.95]`}
          // Apply the lg+ pixel override via inline media-query-free
          // style so Tailwind JIT doesn't need to know about it. On
          // mobile/tablet the `titleSize` classes (text-[26px] /
          // sm:text-4xl / md:text-5xl) still drive the scaling.
          style={
            titlePx
              ? ({ fontSize: 'clamp(26px, 4.5vw, ' + titlePx + 'px)' } as React.CSSProperties)
              : undefined
          }
        >
          {title} <span className="text-hd-orange">{emphasis}</span>
        </h1>
        {subtitle && (
          // QA BUG_UI_027: subtitle exactly 16px (text-base) per Figma.
          // Title Case casing controlled by the caller string. Brightened
          // colour from text-secondary to text-hd-white/85 so it reads
          // clearly against the dark hero.
          <p className="font-body text-base text-hd-white/85 mt-5 max-w-3xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
