import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@hd-cpo/ui';
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
export function DealerLocator() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-dealers'],
    queryFn: () => api<DealerLocation[]>('/dealers?lat=20.5937&lng=78.9629&radius=500'),
  });

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
          Every certified bike is sold through an authorised H-D dealer. Tap a card to centre the map.
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
              {data?.map((d) => (
                <li key={d.id} className="border border-gray-200 p-4">
                  <div className="font-subhead text-text-on-light">{d.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {d.city} &middot; {d.pincode}
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/dealers" className="block">
              <Button className="mt-6 w-full" variant="secondary">
                View All Dealers
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
