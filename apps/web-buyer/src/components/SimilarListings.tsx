import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ListingCardItem, type ListingCardData } from './ListingCard';

interface SearchResponse {
  results: ListingCardData[];
  total: number;
}

interface Props {
  modelFamily: string;
  excludeSlug: string;
}

// Simple "you might also like" — pulls up to 4 listings in the same model family,
// excluding the current bike. Falls back to all-listings if family is empty.
export function SimilarListings({ modelFamily, excludeSlug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['similar', modelFamily],
    queryFn: () =>
      api<SearchResponse>(
        `/listings?modelFamily=${encodeURIComponent(modelFamily)}&pageSize=8`,
      ).catch(() => api<SearchResponse>('/listings?pageSize=8')),
  });

  const items = (data?.results ?? []).filter((l) => l.slug !== excludeSlug).slice(0, 4);
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="mt-12 border-t border-gray-200 pt-10">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <span className="font-subhead uppercase tracking-subhead text-xs text-hd-orange">
            Similar motorcycles
          </span>
          <h3 className="font-headline text-2xl tracking-headline text-text-on-light mt-1">
            More from the {modelFamily} family
          </h3>
        </div>
        <a
          href={`/search?modelFamily=${encodeURIComponent(modelFamily)}`}
          className="text-sm font-subhead uppercase tracking-subhead text-hd-orange hover:underline"
        >
          See all →
        </a>
      </div>
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map((l) => (
          <ListingCardItem key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}
