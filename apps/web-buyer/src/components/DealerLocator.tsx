import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface DealerLocation {
  id: string;
  name: string;
  city: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

// PRD §6.1.1 — dealer locator with map + list of nearest dealers.
// Map is an embed (Google Maps Embed API); a real Maps JS integration with
// markers + clustering wires once GOOGLE_MAPS_API_KEY is provided.
//
// Shows the THREE nearest dealers. The API endpoint sorts by haversine
// distance from the supplied lat/lng (we use the India centroid since the
// buyer hasn't shared their location at this point in the journey), so
// slicing top 3 gives the geographically closest dealerships. Buyers who
// want the full list can use the search-page filter sidebar's pincode +
// distance fields.
const VISIBLE_DEALERS = 3;

export function DealerLocator() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-dealers'],
    queryFn: () => api<DealerLocation[]>('/dealers?lat=20.5937&lng=78.9629&radius=5000'),
  });
  const visible = data?.slice(0, VISIBLE_DEALERS) ?? [];

  // Centre on India by default; recentre client-side with geolocation in Sprint 6.
  const mapSrc =
    'https://www.google.com/maps?q=Harley-Davidson+India&output=embed';

  return (
    <section className="bg-surface-light py-20 border-t border-gray-200" aria-labelledby="dealer-locator-heading">
      <div className="max-w-container mx-auto px-6">
        <h2 id="dealer-locator-heading" className="font-headline text-3xl md:text-5xl tracking-headline text-text-on-light">
          Find Your <span className="text-hd-orange">Nearest Dealer</span>
        </h2>
        <p className="font-body text-gray-600 mt-4 max-w-2xl">
          Every certified bike is sold through an authorised H-D dealer.
          {data && data.length > 0 && (
            <>
              {' '}Showing the <span className="font-subhead text-text-on-light">3 closest</span> of {data.length} dealerships.
            </>
          )}
        </p>
        <div className="mt-10 grid lg:grid-cols-2 gap-8 items-stretch">
          <div className="bg-hd-white border border-gray-200 min-h-80 overflow-hidden">
            <iframe
              title="Dealer locator map"
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full min-h-80 border-0"
              allowFullScreen
            />
          </div>
          <div className="bg-hd-white border border-gray-200 p-6 max-h-[28rem] overflow-y-auto">
            <h3 className="font-subhead uppercase tracking-subhead text-text-on-light">
              Authorised Dealers
            </h3>
            {isLoading && <p className="text-gray-600 mt-6 text-sm">Loading…</p>}
            {data?.length === 0 && (
              <p className="text-gray-600 mt-6 text-sm">No dealers added yet.</p>
            )}
            <ul className="mt-6 space-y-4">
              {visible.map((d) => (
                <li key={d.id} className="border border-gray-200 p-4 hover:border-hd-orange transition">
                  <div className="font-subhead text-text-on-light">{d.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {d.city} &middot; {d.pincode}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
