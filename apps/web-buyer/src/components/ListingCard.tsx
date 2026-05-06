import { Link } from 'react-router-dom';

export interface ListingCardData {
  id: string;
  slug: string;
  vin: string;
  modelFamily: string;
  modelName: string;
  year: number;
  price: number;
  kmsDriven: number;
  primaryImage: string;
  certificationStatus: 'CPO' | 'AS_IS';
  dealerName: string;
  city: string;
  colour: string;
}

// Card layout matches the frozen Figma design exactly:
//   ┌────────────────────────┐
//   │ [H-D CERTIFIED badge]  │  ← top-left over photo
//   │     bike photo         │
//   ├────────────────────────┤
//   │  STREET GLIDE SPECIAL  │  ← model, subhead caps
//   │  ⌖ Auckland Motors…    │  ← map-pin + dealer
//   │  C2UUC · 2023 · 8,240… │  ← stock code · year · km · colour
//   │  ₹ 18,90,000           │  ← price
//   │              View Details ›
//   └────────────────────────┘
export function ListingCardItem({ listing }: { listing: ListingCardData }) {
  const stockCode = listing.vin?.slice(-5).toUpperCase() || '';
  return (
    <Link
      to={`/listings/${listing.slug}`}
      className="group block bg-hd-white border border-gray-200 rounded-card overflow-hidden hover:border-hd-orange transition"
    >
      <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
        <img
          src={listing.primaryImage || 'https://placehold.co/600x450/000000/FF6600?text=H-D'}
          alt={`${listing.year} ${listing.modelName}`}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-[1.02] transition"
        />
        <div className="absolute top-3 left-3">
          {listing.certificationStatus === 'CPO' ? (
            <span className="inline-block bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[10px] px-2.5 py-1 rounded-card">
              H-D Certified
            </span>
          ) : (
            <span className="inline-block bg-hd-black text-hd-white font-subhead uppercase tracking-subhead text-[10px] px-2.5 py-1 rounded-card">
              As-Is
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-subhead uppercase tracking-subhead text-base text-text-on-light leading-tight">
          {listing.modelName}
        </h3>
        <p className="flex items-center gap-1.5 text-xs text-gray-500 italic mt-2">
          <MapPin />
          {listing.dealerName}
        </p>
        <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">
          {[stockCode, listing.year, `${listing.kmsDriven.toLocaleString('en-IN')} KM`, listing.colour.toUpperCase()]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="font-headline text-xl text-text-on-light tracking-headline">
            ₹ {listing.price.toLocaleString('en-IN')}
          </span>
          <span className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange group-hover:underline">
            View Details ›
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="bg-hd-white border border-gray-200 rounded-card overflow-hidden">
      <div className="aspect-[4/3] bg-gray-200 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="h-3 w-40 bg-gray-200 animate-pulse" />
        <div className="h-3 w-48 bg-gray-200 animate-pulse" />
        <div className="h-5 w-28 bg-gray-200 animate-pulse" />
      </div>
    </div>
  );
}

function MapPin() {
  return (
    <svg className="w-3 h-3 text-hd-orange shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
  );
}
