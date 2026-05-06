// 110-point inspection checklist — categories must sum to exactly 110.
// Mirrors a standard H-D Certified pre-delivery inspection scope.

export interface ChecklistSection {
  title: string;
  points: string[];
}

export const CHECKLIST: ChecklistSection[] = [
  {
    title: 'Engine & Powertrain',
    points: [
      'Engine starts smoothly (cold)',
      'Engine idle stable',
      'Engine oil leak inspection',
      'Transmission oil leak inspection',
      'Primary case oil leak inspection',
      'Oil pressure within spec',
      'Spark plug condition',
      'Air filter condition',
      'Fuel filter condition',
      'Fuel injection / carburettor function',
      'Throttle body / cable response',
      'Engine mounting bolts torqued',
      'Exhaust system secure',
      'Heat shields secure',
      'Engine bay paint / chrome condition',
    ],
  },
  {
    title: 'Transmission & Drive',
    points: [
      'Clutch lever feel',
      'Clutch hydraulic fluid level',
      'Clutch cable adjustment',
      'Gear shift smoothness (1-6)',
      'Neutral indicator function',
      'Transmission oil level',
      'Primary chain / belt tension',
      'Final drive belt tension and wear',
    ],
  },
  {
    title: 'Brakes',
    points: [
      'Front brake pad thickness',
      'Rear brake pad thickness',
      'Front brake disc thickness / runout',
      'Rear brake disc thickness / runout',
      'Front brake fluid level',
      'Rear brake fluid level',
      'Brake hose condition',
      'ABS function (if equipped)',
      'Hand brake lever feel',
      'Foot brake pedal feel',
    ],
  },
  {
    title: 'Suspension & Steering',
    points: [
      'Front fork seal condition',
      'Front fork travel',
      'Rear shock absorber condition',
      'Rear suspension travel',
      'Steering head bearing condition',
      'Steering smoothness lock-to-lock',
      'Front wheel bearings',
      'Rear wheel bearings',
    ],
  },
  {
    title: 'Wheels & Tyres',
    points: [
      'Front tyre tread depth',
      'Rear tyre tread depth',
      'Front tyre sidewall condition',
      'Rear tyre sidewall condition',
      'Front wheel rim condition',
      'Rear wheel rim condition',
      'Front spoke tension (if applicable)',
      'Rear spoke tension (if applicable)',
    ],
  },
  {
    title: 'Electrical & Lighting',
    points: [
      'Battery voltage / load test',
      'Battery terminal corrosion',
      'Charging system output',
      'Headlight low beam',
      'Headlight high beam',
      'Tail light',
      'Brake light',
      'Indicator (left)',
      'Indicator (right)',
      'Horn',
      'Speedometer function',
      'Tachometer function (if equipped)',
    ],
  },
  {
    title: 'Frame & Body',
    points: [
      'Frame straightness / damage',
      'Fuel tank dent / scratch',
      'Front fender condition',
      'Rear fender condition',
      'Side cover condition',
      'Saddlebags (if equipped)',
      'Windscreen / fairing condition',
      'Mirrors (left + right)',
    ],
  },
  {
    title: 'Controls',
    points: [
      'Throttle action smooth',
      'Brake lever pivot',
      'Clutch lever pivot',
      'Foot peg secure (left + right)',
      'Hand grip condition',
      'Switch gear function',
    ],
  },
  {
    title: 'Documentation',
    points: [
      'Original RC book',
      'Tax token paid',
      'Insurance policy verified',
      'Service history book',
      'Owner\'s manual present',
      'Original keys (both)',
      'Sale agreement signed',
      'KYC documents collected',
    ],
  },
  {
    title: 'Cleanliness & Aesthetics',
    points: [
      'Paint condition (overall)',
      'Chrome condition',
      'Rubber parts (grips, foot pegs)',
      'Seat condition (cosmetic)',
      'Seat structural (foam, frame)',
      'Engine bay cleanliness',
      'Underbody cleanliness',
    ],
  },
  {
    title: 'Test Ride',
    points: [
      'Cold start',
      'Hot start',
      'Acceleration smoothness',
      'Braking pull (front)',
      'Braking pull (rear)',
      'Vibration at speed',
      'Top-speed sustained run',
      'Idle stability post-ride',
    ],
  },
  {
    title: 'Final Sign-Off',
    points: [
      'Engine number matches RC',
      'Chassis number matches RC',
      'Owner verification complete',
      'Service interval reset',
      'Defects logged in workbook',
      'Customer test ride offered',
      'Warranty card stamped',
      'Roadside assistance card issued',
      'H.O.G. membership form provided',
      'Final cleaning complete',
      'Photographer documented gallery',
      'Dealer principal sign-off',
    ],
  },
];

export const TOTAL_POINTS = CHECKLIST.reduce((s, sec) => s + sec.points.length, 0);
