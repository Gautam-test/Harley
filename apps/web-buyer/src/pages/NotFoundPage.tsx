import { Link } from 'react-router-dom';
import { Button } from '@hd-cpo/ui';

export function NotFoundPage() {
  return (
    <div className="max-w-container mx-auto px-6 py-24 text-center">
      <h1 className="font-headline text-6xl tracking-headline text-hd-white">404</h1>
      <p className="text-text-secondary mt-4">This road doesn&rsquo;t lead anywhere.</p>
      <Link to="/" className="inline-block mt-8">
        <Button>Back to Home</Button>
      </Link>
    </div>
  );
}
