import { Link } from 'react-router-dom';
import { Button } from '@hd-cpo/ui';

// Branded buyer-portal 404. Renders zero API calls (no useQuery on
// this page) and offers multiple "safe" navigation entry points so
// the user can re-route to a valid flow without using the browser
// back button.
//
// Trigger paths: the wildcard `*` route in App.tsx maps every unknown
// URL here. Examples — /random-typo, deep links from old emails, etc.
export function NotFoundPage() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 py-20 bg-hd-white">
      <div className="max-w-xl text-center">
        {/* Orange 404 eyebrow + condensed headline + body copy in the
            same hierarchy as every other buyer page. Earlier version
            used text-hd-white on a white body — invisible — and only
            offered one Back to Home button. */}
        <p className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">
          Error 404
        </p>
        <h1 className="font-headline text-5xl sm:text-6xl tracking-headline uppercase text-text-on-light leading-tight mt-3">
          Page <span className="text-hd-orange">Not Found</span>
        </h1>
        <p className="text-base text-gray-600 mt-5 leading-relaxed">
          This road doesn&rsquo;t lead anywhere. The page you&rsquo;re
          looking for may have moved, been removed, or never existed.
        </p>

        {/* Primary CTA + secondary navigation links so the user has
            multiple ways out — search stock, sell their bike, track an
            enquiry, or contact support. Each is a Link (no API calls). */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/">
            <Button>Back to Home</Button>
          </Link>
          <Link
            to="/search"
            className="inline-flex items-center border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-xs px-6 py-3 hover:bg-hd-black hover:text-hd-white transition"
          >
            Browse Stock
          </Link>
        </div>

        {/* Client feedback #7: "Find a Dealer" quicklink dropped — grid
            collapsed from 4-col to 3-col (Sell / Track / Contact). */}
        <div className="mt-10 pt-6 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <Link
            to="/sell-bike"
            className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition"
          >
            Sell Your Bike
          </Link>
          <Link
            to="/track"
            className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition"
          >
            Track Enquiry
          </Link>
          <Link
            to="/contact"
            className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </main>
  );
}
