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
        {/* Figma /Customer/Home.png — section header is a 3-part block:
             tiny "APPROVED AND TESTED" preheader in subhead caps, then the
             big "FEATURED CERTIFIED" h2 with the second word in orange, then
             a body paragraph. The "View all" link sits in the top-right
             corner, aligned baseline with the h2 row. */}
        {/* BUG_UI_005 #1: header in 1903 Sans (font-subhead) at a wider,
            heavier cut — was font-headline Condensed which compressed
            "FEATURED CERTIFIED" vertically. The eyebrow stays orange caps.
            BUG_UI_005 #2: the View All link is now a proper outlined
            button (dark charcoal border, transparent fill, sharp corners)
            instead of a raw orange text link. */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="font-subhead font-bold uppercase tracking-subhead text-[11px] text-hd-orange">
              Approved and Tested
            </p>
            <h2 className="font-subhead font-bold tracking-subhead uppercase text-2xl md:text-3xl text-text-on-light mt-2">
              Featured <span className="text-hd-orange">Certified</span>
            </h2>
          </div>
          <Link
            to="/search"
            className="hidden sm:inline-flex items-center border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 hover:bg-hd-black hover:text-hd-white transition mt-7"
          >
            View All Approved Used Stock ›
          </Link>
        </div>
        {/* QA RE-OPEN: copy uses sentence case with a period after
            "Dealer Network." per Figma — was "dealer network —" with
            an em-dash. */}
        <p className="text-[15px] text-gray-700 max-w-3xl mb-8 leading-relaxed">
          Hand-picked Harley-Davidson&trade; motorcycles from our Authorised Dealer Network.
          Each one inspected, verified, and ready to ride.
        </p>

        {/* QA RE-OPEN: grid forces 4 columns on lg+ with equal-height
            cells via items-stretch, so each card matches its neighbour
            regardless of title length. First card receives a default
            highlighted state — orange box-shadow glow + orange border
            via [&>*:first-child]:ring-2 [&>*:first-child]:ring-hd-orange
            descendant selectors so we don't have to refactor
            ListingCardItem's props. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch [&>a:first-child]:ring-2 [&>a:first-child]:ring-hd-orange [&>a:first-child]:shadow-[0_0_24px_rgba(255,102,0,0.35)] [&>button:first-child]:ring-2 [&>button:first-child]:ring-hd-orange [&>button:first-child]:shadow-[0_0_24px_rgba(255,102,0,0.35)]">
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
