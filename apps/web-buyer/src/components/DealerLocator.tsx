import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface DealerLocation {
  id: string;
  name: string;
  city: string;
  pincode: string;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
}

// PRD §6.1.1 — dealer locator with map + list of nearest dealers.
//
// BUG_UI_006 rebuild:
//   • Heading switched to font-subhead (1903 Sans, wide cut) — was
//     font-headline Condensed, which read as compressed vertical block.
//   • First card is selected by DEFAULT on mount (orange background,
//     white text). Click any other card to swap selection.
//   • Each card carries name, multi-line address (street + city +
//     pincode), phone (tel: link), and distance ("4.5 KM AWAY") when
//     the API returns coords.
//   • "VIEW DETAILS →" link dropped — the card itself is the action.
//   • Sub-headline copy aligned with Figma: "authorized" (z), ® not ™,
//     and second sentence reads "Find the one closest to you."
//   • Map iframe re-points to the selected dealer's location on every
//     selection change so the pin always matches the active card.
const VISIBLE_DEALERS = 3;

export function DealerLocator() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-dealers'],
    queryFn: () => api<DealerLocation[]>('/dealers?lat=20.5937&lng=78.9629&radius=5000'),
  });
  // QA: enforce ascending-distance ordering on the CLIENT as well.
  // The API already sorts by distance but a regression there (or a
  // future caller passing in dealers already sorted alphabetically)
  // would still cause "663.8 KM AWAY" to render above a closer
  // dealer. Belt-and-braces: sort here too, push nulls to the back
  // (legacy seed without coords), then slice the top 3.
  const visible = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
    return sorted.slice(0, VISIBLE_DEALERS);
  }, [data]);

  // Default-select the first dealer once data arrives. Subsequent loads
  // keep the user's selection if it's still in the list, otherwise fall
  // back to the first row.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const first = visible[0];
    if (!first) return;
    if (!selectedId || !visible.some((d) => d.id === selectedId)) {
      setSelectedId(first.id);
    }
  }, [visible, selectedId]);

  const selected = visible.find((d) => d.id === selectedId) ?? visible[0] ?? null;

  // Map iframe URL — focuses on the selected dealer when we have one,
  // otherwise falls back to a country-level view. Using the lightweight
  // "?q=...&output=embed" form (no API key required) — the marker is the
  // single result for the query, so the chaotic global pin cluster from
  // the previous "Harley-Davidson India" search is gone.
  const mapSrc = selected
    ? `https://www.google.com/maps?q=${encodeURIComponent(
        `${selected.name} ${selected.address ?? ''} ${selected.city} ${selected.pincode}`,
      )}&output=embed`
    : 'https://www.google.com/maps?q=India&output=embed';

  return (
    <section
      className="bg-surface-light py-20 border-t border-gray-200"
      aria-labelledby="dealer-locator-heading"
    >
      <div className="max-w-container mx-auto px-6">
        <p className="font-subhead font-bold uppercase tracking-subhead text-[11px] text-hd-orange">
          The Dealer Network
        </p>
        <h2
          id="dealer-locator-heading"
          className="font-subhead font-bold tracking-subhead uppercase text-2xl md:text-3xl lg:text-[32px] text-text-on-light mt-2 leading-tight"
        >
          Find Your <span className="text-hd-orange">Dealer</span>
        </h2>
        {/* BUG_UI_006 #4: Figma copy uses "authorized" (z), the ®
            symbol (not ™), and "Find the one closest to you" as the
            second sentence. */}
        <p className="font-body text-gray-600 mt-4 max-w-2xl text-[15px] leading-relaxed">
          Every certified motorcycle is backed by an authorized Harley-Davidson&reg; dealer.
          Find the one closest to you.
        </p>

        <div className="mt-10 grid lg:grid-cols-2 gap-6 items-stretch">
          {/* Dealer list (left) */}
          <div className="bg-hd-white border border-gray-200 p-4 max-h-[28rem] overflow-y-auto">
            {isLoading && <p className="text-gray-600 text-sm px-2 py-1">Loading dealers…</p>}
            {!isLoading && data?.length === 0 && (
              <p className="text-gray-600 text-sm px-2 py-1">No dealers added yet.</p>
            )}
            <ul className="space-y-3">
              {visible.map((d) => {
                const isActive = d.id === selectedId;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      aria-pressed={isActive}
                      className={`w-full text-left p-4 border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-hd-orange ${
                        isActive
                          ? 'bg-hd-orange border-hd-orange text-hd-white'
                          : 'bg-hd-white border-gray-200 text-text-on-light hover:border-hd-orange'
                      }`}
                    >
                      <p
                        className={`font-subhead font-bold uppercase tracking-subhead text-[13px] leading-tight ${
                          isActive ? 'text-hd-white' : 'text-text-on-light'
                        }`}
                      >
                        {d.name}
                      </p>
                      {/* Multi-line address: street (if available) on one
                          line, city + pincode on the next. */}
                      {d.address && (
                        <p
                          className={`text-[12px] mt-1.5 leading-snug ${
                            isActive ? 'text-hd-white/90' : 'text-gray-700'
                          }`}
                        >
                          {d.address}
                        </p>
                      )}
                      <p
                        className={`text-[12px] mt-0.5 leading-snug ${
                          isActive ? 'text-hd-white/90' : 'text-gray-700'
                        }`}
                      >
                        {d.city} &middot; {d.pincode}
                      </p>

                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3">
                        {d.phone && (
                          // Active state: white on orange — hover stays
                          // white + underline (NOT orange — would fail
                          // WCAG AA contrast on the orange bg). Inactive
                          // state: orange link with hover-darken.
                          <a
                            href={`tel:${d.phone.replace(/\s+/g, '')}`}
                            onClick={(e) => e.stopPropagation()}
                            className={`font-body text-[12px] underline-offset-2 ${
                              isActive
                                ? 'text-hd-white hover:underline'
                                : 'text-hd-orange hover:brightness-90 hover:underline'
                            }`}
                          >
                            {d.phone}
                          </a>
                        )}
                        {d.distanceKm != null && (
                          <span
                            className={`font-subhead uppercase tracking-subhead text-[10px] ${
                              isActive ? 'text-hd-white' : 'text-gray-500'
                            }`}
                          >
                            {d.distanceKm} KM AWAY
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Map (right) — re-renders on selection change via the key
              prop so the iframe genuinely re-navigates rather than
              keeping its previous viewport. */}
          <div className="bg-hd-white border border-gray-200 min-h-80 overflow-hidden">
            <iframe
              key={selected?.id ?? 'fallback'}
              title={selected ? `Map of ${selected.name}` : 'Dealer locator map'}
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full min-h-80 border-0"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}
