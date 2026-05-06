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

interface PageHeroProps {
  /** Words rendered in white before the orange emphasis word. */
  title: string;
  /** The single word rendered in H-D orange. */
  emphasis: string;
  /** Optional copy under the headline (rendered uppercase / tracked). */
  subtitle?: string;
  /** Background image URL — pick from `HERO`. */
  image?: string;
  /** Vertical scale: tighter for utility pages, taller for marketing. */
  size?: 'sm' | 'md' | 'lg';
  /** Optional content rendered below the headline (e.g. a search form). */
  children?: ReactNode;
}

export function PageHero({
  title,
  emphasis,
  subtitle,
  image = HERO.streetGlide,
  size = 'md',
  children,
}: PageHeroProps) {
  const padY =
    size === 'lg' ? 'py-24 md:py-28' : size === 'sm' ? 'py-14 md:py-16' : 'py-20 md:py-24';
  const titleSize =
    size === 'lg' ? 'text-5xl md:text-7xl' : size === 'sm' ? 'text-3xl md:text-5xl' : 'text-4xl md:text-6xl';

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
        <h1
          className={`font-headline ${titleSize} tracking-headline uppercase text-hd-white leading-[0.95]`}
        >
          {title} <span className="text-hd-orange">{emphasis}</span>
        </h1>
        {subtitle && (
          <p className="font-subhead uppercase tracking-subhead text-xs md:text-sm text-text-secondary mt-5 max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
