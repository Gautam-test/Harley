import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { HeroSearch } from '../components/HeroSearch';
import { BenefitsSection } from '../components/BenefitsSection';

// Client feedback (items #6 + #7): the "Featured Listings" grid and the
// home "Find Your Dealer" locator are both removed end-to-end from the
// customer portal. The underlying /api/v1/dealers endpoint is retained
// because the Search Stock distance filter + dealer-picker modals
// (InfoGateModal, SellBikeModal) still depend on it.
//
// Frozen Figma reference is now: hero → search band → benefits intro →
// "Overview" bullets → 6 alternating feature rows → "View all" CTA.
export function HomePage() {
  return (
    <>
      <Helmet>
        <title>H-D Certified — Approved Used Harley-Davidson Motorcycles</title>
        <meta
          name="description"
          content="Discover Certified Pre-Owned Harley-Davidson motorcycles from authorised dealers. 110-point inspection, kilometre verification, 12-month guarantee."
        />
      </Helmet>
      <HeroSearch />

      {/* Brand Guidelines p.58, 63-65: the RIDE wordmark is "the central
          expression of our brand platform" and must appear on brand
          communications. Rendered as a bold typographic band between the
          hero and the benefits content. "RIDE" is always orange, ALL CAPS,
          followed by a period per p.63. */}
      <section className="bg-hd-black py-10 md:py-14 text-center" aria-label="RIDE brand statement">
        <div className="max-w-container mx-auto px-6">
          <p
            className="font-headline font-bold uppercase tracking-headline leading-headline text-hd-orange select-none"
            style={{ fontSize: 'clamp(5rem, 14vw, 10rem)' }}
            aria-hidden="true"
          >
            RIDE.
          </p>
          <p className="font-subhead font-bold uppercase tracking-subhead text-hd-white text-sm md:text-base mt-2 opacity-70">
            Harley-Davidson&reg; Certified Pre-Owned
          </p>
        </div>
      </section>

      <BenefitsSection />

      <div className="bg-hd-white py-14 text-center">
        <Link
          to="/search"
          className="inline-flex items-center gap-3 bg-hd-orange text-hd-white font-subhead font-bold uppercase tracking-subhead px-7 py-3 hover:brightness-110 transition"
        >
          <span>View All Approved Used Stock</span>
          <span aria-hidden className="text-lg leading-none">&rsaquo;</span>
        </Link>
      </div>
    </>
  );
}
