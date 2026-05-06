import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ListingCardItem, ListingCardSkeleton, type ListingCardData } from './ListingCard';

interface SearchResponse {
  results: ListingCardData[];
  total: number;
}

// "Featured Certified" — first 4 ACTIVE CPO listings as a teaser strip on the
// home page, mirroring the freeze layout (4 cards + a bottom CTA).
export function FeaturedCertified() {
  const { data, isLoading } = useQuery({
    queryKey: ['featured-certified'],
    queryFn: () => api<SearchResponse>('/listings?cert=CPO&pageSize=4'),
  });

  return (
    <section className="bg-hd-white py-14 md:py-16 border-t border-gray-200">
      <div className="max-w-container mx-auto px-6">
        <div className="flex items-center justify-between gap-4 mb-8">
          <h2 className="font-headline tracking-headline uppercase text-2xl md:text-3xl text-text-on-light">
            Featured <span className="text-hd-orange">Certified</span>
          </h2>
          <Link
            to="/search"
            className="hidden sm:inline-flex font-subhead uppercase tracking-subhead text-xs text-hd-orange hover:underline"
          >
            View All Approved Used Stock →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          {!isLoading &&
            data?.results.map((l) => <ListingCardItem key={l.id} listing={l} />)}
        </div>

        {!isLoading && (data?.results.length ?? 0) === 0 && (
          <p className="text-center text-gray-500 text-sm py-8">
            No featured listings available right now.
          </p>
        )}
      </div>
    </section>
  );
}
