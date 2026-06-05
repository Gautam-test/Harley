import { Link } from 'react-router-dom';

// QA BUG-014: static 404 page. Renders no data, fires no API calls, and
// does NOT redirect to /dashboard (which would silently trigger every
// dashboard query for a clearly invalid URL). Dealer sees a deterministic
// "this page doesn't exist" instead of a dashboard load happening behind
// the scenes.
export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">
        404
      </p>
      <h1 className="font-headline text-4xl tracking-headline text-text-on-light mt-2">
        Page Not Found
      </h1>
      <p className="text-sm text-gray-600 mt-3 max-w-md">
        The page you requested doesn’t exist. Use the sidebar to navigate
        to a valid section.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex items-center bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 hover:brightness-110 transition"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
