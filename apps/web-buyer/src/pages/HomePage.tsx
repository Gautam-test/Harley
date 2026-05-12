import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { HeroSearch } from '../components/HeroSearch';
import { BenefitsSection } from '../components/BenefitsSection';
import { FeaturedCertified } from '../components/FeaturedCertified';
import { DealerLocator } from '../components/DealerLocator';

// Mirrors the frozen Figma "Home" layout (PRD §6.1.1):
//   hero → search band → "What are the benefits" intro → "Overview" bullets
//   → 6 alternating image/text feature rows → "View all" CTA
//   → Featured Certified cards → Find Your Dealer
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
      <BenefitsSection />

      <div className="bg-hd-white py-10 text-center border-t border-gray-200">
        <Link
          to="/search"
          className="inline-flex items-center gap-2 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead px-7 py-3 hover:brightness-110 transition rounded-card group"
        >
          <span>View All Approved Used Stock</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>

      <FeaturedCertified />
      <DealerLocator />
    </>
  );
}
