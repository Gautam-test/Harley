// PDP trust block — short, scannable reassurance just below the description.
// Reinforces the same six benefits as the home page but in a denser format.

const ITEMS = [
  { v: '110', l: 'Inspection points' },
  { v: '12mo', l: 'Mech & elec guarantee' },
  { v: '✓', l: 'KM verified' },
  { v: 'HOG', l: 'Membership eligible' },
];

export function WhyCertified() {
  return (
    <section className="mt-10 border-t border-gray-200 pt-8">
      <div className="bg-surface-light border border-gray-200 rounded-card p-6 lg:p-7">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-subhead uppercase tracking-subhead text-xs text-hd-orange">
            Why H-D Certified
          </span>
          <span className="text-gray-500 text-xs">Sold only through authorised dealers</span>
        </div>
        <h3 className="font-subhead uppercase tracking-subhead text-text-on-light mt-2">
          Buy with the same confidence as a new motorcycle
        </h3>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          This motorcycle has passed H-D&rsquo;s 110-point pre-delivery inspection, has a verified
          kilometre history, and ships with a 12-month mechanical &amp; electrical guarantee.
        </p>
        <ul className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ITEMS.map((it) => (
            <li
              key={it.l}
              className="bg-hd-white border border-gray-200 px-3 py-3 text-center rounded-card"
            >
              <div className="font-headline text-2xl text-hd-orange">{it.v}</div>
              <div className="font-subhead text-[10px] uppercase tracking-subhead text-gray-600 mt-1 leading-tight">
                {it.l}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
