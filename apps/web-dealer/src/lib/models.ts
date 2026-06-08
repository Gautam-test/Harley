// Canonical H-D model catalog — duplicated from apps/web-buyer/src/lib/
// models.ts so the dealer portal can show the same approved master
// list without taking a runtime dependency on the buyer SPA. If this
// list ever grows / drifts it should be promoted to packages/types
// and consumed by both apps.

export interface ModelFamily {
  family: string;
  models: string[];
}

export const HD_MODEL_CATALOG: ModelFamily[] = [
  {
    family: 'Grand American Touring',
    models: [
      'Street Glide',
      'Street Glide Special',
      'Road Glide',
      'Road Glide Special',
      'Road King',
      'Road King Special',
      'Electra Glide Highway King',
      'Ultra Limited',
      'CVO Street Glide',
      'CVO Road Glide',
    ],
  },
  {
    family: 'Cruiser',
    models: [
      'Fat Boy 114',
      'Heritage Classic 114',
      'Low Rider S',
      'Low Rider ST',
      'Street Bob 114',
      'Softail Standard',
      'Breakout 117',
      'Sport Glide',
      'Slim',
    ],
  },
  {
    family: 'Sport',
    models: [
      'Sportster S',
      'Nightster',
      'Nightster Special',
      'Iron 883',
      'Iron 1200',
      'Forty-Eight',
    ],
  },
  {
    family: 'Adventure Touring',
    models: ['Pan America 1250', 'Pan America 1250 Special'],
  },
  {
    family: 'Street',
    models: ['Street 750', 'Street Rod'],
  },
  {
    family: 'Harley-Davidson X',
    models: ['X 350', 'X 500'],
  },
];

// Flat list — every approved model, sorted A→Z, for searchable dropdowns.
export const HD_MODELS_FLAT: string[] = HD_MODEL_CATALOG.flatMap((g) => g.models).sort(
  (a, b) => a.localeCompare(b),
);
