import { Route, Routes } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { CookieBanner } from './components/CookieBanner';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { SellBikePage } from './pages/SellBikePage';
import { StaticPage } from './pages/StaticPage';
import { InfoPage } from './pages/InfoPage';
import { TrackPage } from './pages/TrackPage';
import { DealersPage } from './pages/DealersPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <div className="min-h-screen flex flex-col bg-hd-white text-text-on-light">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-hd-orange focus:text-hd-black focus:px-3 focus:py-2 focus:font-subhead focus:uppercase focus:tracking-subhead"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/listings/:slug" element={<ListingDetailPage />} />
          <Route path="/sell-bike" element={<SellBikePage />} />
          <Route path="/track" element={<TrackPage />} />
          <Route path="/dealers" element={<DealersPage />} />
          <Route path="/finance" element={<InfoPage variant="finance" />} />
          <Route path="/insurance" element={<InfoPage variant="insurance" />} />
          <Route path="/about" element={<StaticPage contentKey="about" />} />
          <Route path="/privacy" element={<StaticPage contentKey="privacy" />} />
          <Route path="/terms" element={<StaticPage contentKey="terms" />} />
          <Route path="/faq" element={<StaticPage contentKey="faq" />} />
          <Route path="/contact" element={<StaticPage contentKey="contact" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <SiteFooter />
      <CookieBanner />
    </div>
  );
}
