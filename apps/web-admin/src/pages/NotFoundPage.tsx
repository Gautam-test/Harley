import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

// BUG-057: 404 page now renders as a STANDALONE public layout — no
// AdminShell sidebar, no profile chip, no quick-jump links to
// protected pages when the visitor isn't authenticated. The route is
// mounted OUTSIDE the shell in App.tsx so an unauthed user typing
// /admin/random-garbage sees this page and only this page.
//
// Auth-aware behaviour:
//   - Authed admin → primary CTA goes back to /dashboard, helper links
//     under the divider stay so a misclick is one tap from recovery.
//   - Unauthed visitor → primary CTA is "Go to Admin Login", helper
//     links suppressed (they would either bounce through /login or
//     reveal the protected route names — better to disclose nothing).
export function NotFoundPage() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));

  return (
    <div className="min-h-screen bg-surface-light flex flex-col">
      {/* Minimal standalone header — H-D ADMIN wordmark only. No nav,
          no user chip. Matches the LoginPage shell so an unauthed
          visitor sees a consistent "you're not signed in" frame. */}
      <header className="border-b border-gray-200 bg-hd-white px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <span className="font-headline text-xl tracking-headline text-text-on-light">
            H-D <span className="text-hd-orange">ADMIN</span>
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
                className="mt-6 inline-flex items-center bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 hover:brightness-110 transition"
              >
                Back to Dashboard
              </Link>
              <div className="mt-8 pt-6 border-t border-gray-200 flex flex-wrap gap-x-6 gap-y-2 justify-center text-[11px]">
                <Link to="/dealers" className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition">
                  Dealers
                </Link>
                <Link to="/listings" className="font-subhead uppercase tracking-subhead text-gray-600 hover:text-hd-orange transition">
                  Listings
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
              className="mt-6 inline-flex items-center bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-[11px] px-5 py-2.5 hover:brightness-110 transition"
            >
              Go to Admin Login
            </Link>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-hd-white px-4 py-3 text-center">
        <span className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
          © 2026 Harley-Davidson · Authorized Admin Access Only
        </span>
      </footer>
    </div>
  );
}
