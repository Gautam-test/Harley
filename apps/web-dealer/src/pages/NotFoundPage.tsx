import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

// BUG-057: 404 page is now a STANDALONE public layout — no DealerShell
// sidebar, no profile chip, no leak of protected route names when the
// visitor isn't authenticated. The route is mounted OUTSIDE the shell
// in App.tsx so /dealer/random-garbage shows this page only.
//
// Auth-aware behaviour:
//   - Authed dealer → "Back to Dashboard" + quick-jump rail.
//   - Unauthed visitor → "Go to Dealer Login" only; helper links
//     suppressed (would either bounce through /login or disclose
//     protected URLs).
export function NotFoundPage() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));

  return (
    <div className="min-h-screen bg-surface-light flex flex-col">
      {/* Minimal standalone header — H-D DEALER PORTAL wordmark, no nav. */}
      <header className="border-b border-gray-200 bg-hd-white px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <span className="font-subhead uppercase tracking-subhead text-sm text-hd-orange">
            Dealer Portal
          </span>
          <span className="ml-3 font-headline text-xl tracking-headline text-text-on-light">
            Harley-Davidson
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="font-subhead uppercase tracking-subhead text-[11px] text-hd-orange">
            Error 404
          </p>
          <h1 className="font-headline text-4xl tracking-headline text-text-on-light mt-2">
            Page Not Found
          </h1>
          <p className="text-sm text-gray-600 mt-3">
            The page you requested doesn&rsquo;t exist or has moved.
          </p>

          {isAuthed ? (
            <>
              <Link
                to="/dashboard"
                className="mt-6 inline-flex items-center bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 hover:brightness-110 transition"
              >
                Back to Dashboard
              </Link>
              <div className="mt-8 pt-6 border-t border-gray-200 flex flex-wrap gap-x-6 gap-y-2 justify-center text-[11px]">
                <Link to="/listings" className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition">
                  My Listings
                </Link>
                <Link to="/listings/new" className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition">
                  Add Listing
                </Link>
                <Link to="/enquiries" className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition">
                  Enquiries
                </Link>
                <Link to="/profile" className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition">
                  Profile
                </Link>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              className="mt-6 inline-flex items-center bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 hover:brightness-110 transition"
            >
              Go to Dealer Login
            </Link>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-hd-white px-4 py-3 text-center">
        <span className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
          © 2026 Harley-Davidson · Authorized Dealer Access Only
        </span>
      </footer>
    </div>
  );
}
