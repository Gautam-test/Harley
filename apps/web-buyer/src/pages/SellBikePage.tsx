import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useSellBikeStore } from '../store/sellBike';

// Backward compat: the old /sell-bike standalone route now redirects to home
// and opens the SellBikeModal so deep links from emails/SEO still work. The
// canonical entry point is the "Sell Your Bike" button in the site header.
export function SellBikePage() {
  const openSellBike = useSellBikeStore((s) => s.openSellBike);
  useEffect(() => {
    openSellBike();
  }, [openSellBike]);
  return <Navigate to="/" replace />;
}
