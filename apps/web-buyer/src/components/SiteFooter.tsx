import { Link } from 'react-router-dom';

export function SiteFooter() {
  return (
    <footer className="bg-hd-black border-t border-surface-2 mt-16">
      <div className="max-w-container mx-auto px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="font-headline text-xl tracking-headline text-hd-white mb-3">
            H-D <span className="text-hd-orange">CERTIFIED</span>
          </div>
          <p className="text-text-secondary leading-relaxed">
            Approved Used Bikes, exclusively from authorised Harley-Davidson dealers.
          </p>
        </div>
        <div>
          <h3 className="font-subhead text-text-primary mb-3">Marketplace</h3>
          <ul className="space-y-2 text-text-secondary">
            <li><Link to="/search" className="hover:text-hd-orange">Search Stock</Link></li>
            <li><Link to="/sell-bike" className="hover:text-hd-orange">Sell Your Bike</Link></li>
            <li><Link to="/track" className="hover:text-hd-orange">Track Enquiry</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-subhead text-text-primary mb-3">Information</h3>
          <ul className="space-y-2 text-text-secondary">
            <li><Link to="/about" className="hover:text-hd-orange">About</Link></li>
            <li><Link to="/faq" className="hover:text-hd-orange">FAQ</Link></li>
            <li><Link to="/contact" className="hover:text-hd-orange">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-subhead text-text-primary mb-3">Legal</h3>
          <ul className="space-y-2 text-text-secondary">
            <li><Link to="/terms" className="hover:text-hd-orange">Terms &amp; Conditions</Link></li>
            <li><Link to="/privacy" className="hover:text-hd-orange">Privacy Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-surface-2">
        <div className="max-w-container mx-auto px-6 py-4 text-xs text-text-secondary flex justify-between">
          <span>&copy; {new Date().getFullYear()} H-D Certified Marketplace</span>
          <span>Harley-Davidson&reg; is a registered trademark.</span>
        </div>
      </div>
    </footer>
  );
}
