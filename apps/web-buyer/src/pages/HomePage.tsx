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
          className="inline-block bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead px-7 py-3 hover:brightness-110 transition rounded-card"
        >
          View All Approved Used Stock
        </Link>
      </div>

      <FeaturedCertified />
      <DealerLocator />
    </>
  );
}
