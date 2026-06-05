/* eslint-disable no-console */
//
// Extra-data seeder — fills the marketplace with 13 additional H-D dealerships
// across India + 3-4 listings each. Idempotent (uses upsert on dealer username
// and listing VIN), so re-running is safe.
//
// Run: pnpm --filter @hd-cpo/api prisma:seed-extra
//
// Each dealer gets a torqueDealerId of the form `TQ-DEALER-NNNN`. The Torque
// mock client returns `dealerId = 'TQ-DEALER-' + vin.slice(-4)`, so every
// VIN we mint here ends in the matching dealer's 4-digit slug. That keeps
// the VIN-to-dealer ownership check in createListing happy if anyone later
// re-creates these listings via the dealer wizard.
//
// Data is intentionally varied: 5 model families, 9+ models, prices 8L-25L,
// years 2019-2024, kms 1.5k-30k, mix of CPO (~75%) + As-Is (~25%).

import {
  PrismaClient,
  CertStatus,
  ListingStatus,
  DealerStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const img = (id: string, w = 1600, h = 1200) =>
  `https://images.medialinksonline.com/${id}x${w}x${h}xFFFFFFxH.jpg`;

// Image groups by model — pulled from the existing seed's verified asset IDs.
const IMG = {
  streetGlideSpecial: [img('8825026'), img('8822168'), img('8825056')],
  fatBoy114: [img('8822481'), img('7779234'), img('7804764')],
  roadKingSpecial: [img('8825087'), img('8830705')],
  panAmerica1250: [img('8825071'), img('8613849')],
  sportsterS: [img('8825049')],
  heritageClassic114: [img('8225108'), img('8374924'), img('7779193')],
  lowRiderS: [img('8757963'), img('8374925')],
  iron883: [img('8374923'), img('7779211')],
  streetBob114: [img('8825065')],
};

interface DealerSeed {
  username: string;
  name: string;
  legalName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  /** 4-digit slug used both for torqueDealerId and as VIN suffix on listings. */
  slug: string;
}

const DEALERS: DealerSeed[] = [
  {
    username: 'bengaluru-hd',
    name: 'Indi-an Harley-Davidson Bengaluru',
    legalName: 'Indi-an Motorcycles Pvt Ltd',
    email: 'sales@bengaluru-hd.example.in',
    phone: '+918041234567',
    address: '14 Residency Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560025',
    latitude: 12.9716,
    longitude: 77.5946,
    slug: '0003',
  },
  {
    username: 'hyderabad-hd',
    name: 'Pegasus Harley-Davidson Hyderabad',
    legalName: 'Pegasus Motorcycles Pvt Ltd',
    email: 'sales@hyderabad-hd.example.in',
    phone: '+914023453456',
    address: 'Jubilee Hills Road No 36',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500033',
    latitude: 17.3850,
    longitude: 78.4867,
    slug: '0004',
  },
  {
    username: 'chennai-hd',
    name: 'Coastal Harley-Davidson Chennai',
    legalName: 'Coastal Motorcycles Pvt Ltd',
    email: 'sales@chennai-hd.example.in',
    phone: '+914428345678',
    address: 'Mount Road, Anna Salai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600002',
    latitude: 13.0827,
    longitude: 80.2707,
    slug: '0005',
  },
  {
    username: 'pune-hd',
    name: 'Seven Islands Harley-Davidson Pune',
    legalName: 'Seven Islands Motorcycles Pvt Ltd',
    email: 'sales@pune-hd.example.in',
    phone: '+912026123344',
    address: 'Senapati Bapat Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411016',
    latitude: 18.5204,
    longitude: 73.8567,
    slug: '0006',
  },
  {
    username: 'kolkata-hd',
    name: 'Eastern Harley-Davidson Kolkata',
    legalName: 'Eastern Motorcycles Pvt Ltd',
    email: 'sales@kolkata-hd.example.in',
    phone: '+913340234567',
    address: 'Park Street',
    city: 'Kolkata',
    state: 'West Bengal',
    pincode: '700016',
    latitude: 22.5726,
    longitude: 88.3639,
    slug: '0007',
  },
  {
    username: 'chandigarh-hd',
    name: 'Northern Trails Harley-Davidson Chandigarh',
    legalName: 'Northern Trails Motorcycles Pvt Ltd',
    email: 'sales@chandigarh-hd.example.in',
    phone: '+911724567890',
    address: 'Sector 17-C',
    city: 'Chandigarh',
    state: 'Chandigarh',
    pincode: '160017',
    latitude: 30.7333,
    longitude: 76.7794,
    slug: '0008',
  },
  {
    username: 'ahmedabad-hd',
    name: 'Sterling Harley-Davidson Ahmedabad',
    legalName: 'Sterling Motorcycles Pvt Ltd',
    email: 'sales@ahmedabad-hd.example.in',
    phone: '+917940345678',
    address: 'SG Highway',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380015',
    latitude: 23.0225,
    longitude: 72.5714,
    slug: '0009',
  },
  {
    username: 'jaipur-hd',
    name: 'Pink City Harley-Davidson Jaipur',
    legalName: 'Pink City Motorcycles Pvt Ltd',
    email: 'sales@jaipur-hd.example.in',
    phone: '+911412345678',
    address: 'Tonk Road, Jaipur',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302015',
    latitude: 26.9124,
    longitude: 75.7873,
    slug: '0010',
  },
  {
    username: 'lucknow-hd',
    name: 'Awadh Harley-Davidson Lucknow',
    legalName: 'Awadh Motorcycles Pvt Ltd',
    email: 'sales@lucknow-hd.example.in',
    phone: '+915222345678',
    address: 'Hazratganj',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226001',
    latitude: 26.8467,
    longitude: 80.9462,
    slug: '0011',
  },
  {
    username: 'indore-hd',
    name: 'Heart of India Harley-Davidson Indore',
    legalName: 'Heart of India Motorcycles Pvt Ltd',
    email: 'sales@indore-hd.example.in',
    phone: '+917312345678',
    address: 'AB Road',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452001',
    latitude: 22.7196,
    longitude: 75.8577,
    slug: '0012',
  },
  {
    username: 'kochi-hd',
    name: 'Backwaters Harley-Davidson Kochi',
    legalName: 'Backwaters Motorcycles Pvt Ltd',
    email: 'sales@kochi-hd.example.in',
    phone: '+914843456789',
    address: 'MG Road, Kochi',
    city: 'Kochi',
    state: 'Kerala',
    pincode: '682035',
    latitude: 9.9312,
    longitude: 76.2673,
    slug: '0013',
  },
  {
    username: 'goa-hd',
    name: 'Coastline Harley-Davidson Goa',
    legalName: 'Coastline Motorcycles Pvt Ltd',
    email: 'sales@goa-hd.example.in',
    phone: '+918322345678',
    address: 'Panaji-Margao Highway',
    city: 'Panaji',
    state: 'Goa',
    pincode: '403001',
    latitude: 15.4909,
    longitude: 73.8278,
    slug: '0014',
  },
  {
    username: 'dehradun-hd',
    name: 'Doon Valley Harley-Davidson Dehradun',
    legalName: 'Doon Valley Motorcycles Pvt Ltd',
    email: 'sales@dehradun-hd.example.in',
    phone: '+911352345678',
    address: 'Rajpur Road',
    city: 'Dehradun',
    state: 'Uttarakhand',
    pincode: '248001',
    latitude: 30.3165,
    longitude: 78.0322,
    slug: '0015',
  },
  {
    username: 'nagpal.gautam@orangemantra.in',
    name: 'Gautam nagpal',
    legalName: 'Gautam Nagpal (Orange Mantra)',
    email: 'nagpal.gautam@orangemantra.in',
    phone: '+919999999991',
    address: 'Orange Mantra Office',
    city: 'Gurgaon',
    state: 'Haryana',
    pincode: '122001',
    latitude: 28.4595,
    longitude: 77.0266,
    slug: '0016',
  },
  {
    username: 'jindal.shibesh@orangemantra.in',
    name: 'Shibesh Jindal',
    legalName: 'Shibesh Jindal (Orange Mantra)',
    email: 'jindal.shibesh@orangemantra.in',
    phone: '+919999999992',
    address: 'Orange Mantra Office',
    city: 'Gurgaon',
    state: 'Haryana',
    pincode: '122001',
    latitude: 28.4595,
    longitude: 77.0266,
    slug: '0017',
  },
];

interface ListingTemplate {
  modelFamily: string;
  modelName: string;
  year: number;
  colour: string;
  price: number;
  kmsDriven: number;
  description: string;
  images: string[];
  certificationStatus: CertStatus;
  /** 5-char prefix that we splice with the dealer slug to make a unique 17-char VIN. */
  vinSegment: string;
}

const LISTING_TEMPLATES: ListingTemplate[] = [
  {
    modelFamily: 'Grand American Touring',
    modelName: 'Street Glide Special',
    year: 2023,
    colour: 'Vivid Black',
    price: 2895000,
    kmsDriven: 8400,
    description:
      'Flagship grand American tourer in single-owner condition. Milwaukee-Eight 114, Boom! Box GTS, premium audio. 110-point inspection complete.',
    images: IMG.streetGlideSpecial,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'KHM18',
  },
  {
    modelFamily: 'Cruiser',
    modelName: 'Fat Boy 114',
    year: 2024,
    colour: 'Vivid Black',
    price: 1950000,
    kmsDriven: 3200,
    description:
      'The icon. 2024 Fat Boy 114 with Milwaukee-Eight 114, Lakester wheels, original chrome. Both keys, full service records.',
    images: IMG.fatBoy114,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'FBV13',
  },
  {
    modelFamily: 'Cruiser',
    modelName: 'Heritage Classic 114',
    year: 2022,
    colour: 'Black Denim',
    price: 1850000,
    kmsDriven: 14200,
    description:
      'Soft tail Heritage Classic with leather saddlebags, whitewall tyres, classic floorboards. Perfect Sunday cruiser.',
    images: IMG.heritageClassic114,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'FXX11',
  },
  {
    modelFamily: 'Adventure Touring',
    modelName: 'Pan America 1250 Special',
    year: 2024,
    colour: 'Pearl White',
    price: 2295000,
    kmsDriven: 5600,
    description:
      'Adventure-ready Pan America 1250S with Adaptive Ride Height + 150 hp Revolution Max. Crash bars and top case included.',
    images: IMG.panAmerica1250,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'RA1A5',
  },
  {
    modelFamily: 'Sport',
    modelName: 'Sportster S',
    year: 2023,
    colour: 'Industrial Yellow',
    price: 1575000,
    kmsDriven: 7800,
    description:
      'Revolution Max 1250T, ride modes, traction control, aggressive bobber stance. Yellow-on-black.',
    images: IMG.sportsterS,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'HX212',
  },
  {
    modelFamily: 'Cruiser',
    modelName: 'Low Rider S',
    year: 2024,
    colour: 'Vivid Black',
    price: 1825000,
    kmsDriven: 2800,
    description:
      'Performance cruiser with Milwaukee-Eight 117, mid controls, drag bars, blacked-out finish. Practically new.',
    images: IMG.lowRiderS,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'FBM18',
  },
  {
    modelFamily: 'Sport',
    modelName: 'Iron 883',
    year: 2021,
    colour: 'Denim Black',
    price: 895000,
    kmsDriven: 18400,
    description:
      'Everyday Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Second owner, well-maintained.',
    images: IMG.iron883,
    certificationStatus: CertStatus.AS_IS,
    vinSegment: 'XL211',
  },
  {
    modelFamily: 'Cruiser',
    modelName: 'Street Bob 114',
    year: 2023,
    colour: 'Redline Red',
    price: 1450000,
    kmsDriven: 9700,
    description:
      'Stripped-down soft-tail bobber with M-8 114. Mini-ape bars, single seat, 19" front. Originally sold by us.',
    images: IMG.streetBob114,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'FBR1X',
  },
  {
    modelFamily: 'Grand American Touring',
    modelName: 'Road King Special',
    year: 2022,
    colour: 'Vivid Black',
    price: 2275000,
    kmsDriven: 16500,
    description:
      'Stripped-back tourer with mini-ape handlebars, blacked-out powertrain, hard saddlebags. Authorised dealer service history.',
    images: IMG.roadKingSpecial,
    certificationStatus: CertStatus.CPO,
    vinSegment: 'KEM13',
  },
  {
    modelFamily: 'Sport',
    modelName: 'Iron 883',
    year: 2019,
    colour: 'Vivid Black',
    price: 695000,
    kmsDriven: 28100,
    description:
      'Older but well-loved Iron 883. As-Is listing — sold without certification. Great budget entry into the H-D family.',
    images: IMG.iron883,
    certificationStatus: CertStatus.AS_IS,
    vinSegment: 'XL299',
  },
];

function buildVin(template: ListingTemplate, dealerSlug: string): string {
  // 17 chars total: 4 (1HD1) + 5 (model code) + 4 (random) + 4 (dealer slug)
  // Pad with a deterministic but unique middle so two dealers picking the
  // same template don't collide on VIN.
  const middle = (template.vinSegment + dealerSlug.slice(0, 1) + 'B' + 'X')
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, 'X')
    .slice(0, 8);
  const vin = ('1HD1' + middle.padEnd(8, 'X') + dealerSlug).toUpperCase();
  return vin.slice(0, 17).padEnd(17, 'X');
}

function buildSlug(template: ListingTemplate, vin: string): string {
  const modelKebab = template.modelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${template.year}-${modelKebab}-${vin.slice(-6).toLowerCase()}`;
}

async function main() {
  console.log('Adding extra dealers + listings…');

  const dealerPasswordHash = await bcrypt.hash('Dealer@123!', 12);

  let createdDealers = 0;
  let createdListings = 0;
  let updatedListings = 0;

  for (const d of DEALERS) {
    const dealer = await prisma.dealer.upsert({
      where: { username: d.username },
      update: {
        // Refresh fields in case the seed evolved between runs.
        name: d.name,
        legalName: d.legalName,
        email: d.email,
        phone: d.phone,
        address: d.address,
        city: d.city,
        state: d.state,
        pincode: d.pincode,
        latitude: d.latitude,
        longitude: d.longitude,
        torqueDealerId: `TQ-DEALER-${d.slug}`,
      },
      create: {
        username: d.username,
        passwordHash: dealerPasswordHash,
        name: d.name,
        legalName: d.legalName,
        email: d.email,
        phone: d.phone,
        address: d.address,
        city: d.city,
        state: d.state,
        pincode: d.pincode,
        latitude: d.latitude,
        longitude: d.longitude,
        torqueDealerId: `TQ-DEALER-${d.slug}`,
        status: DealerStatus.ACTIVE,
      },
    });
    createdDealers += 1;

    // 3-4 listings per dealer — pick deterministically from the templates so
    // re-runs produce the same VINs (so the upsert path keeps working).
    const pickCount = 3 + (parseInt(d.slug, 10) % 2); // alternates 3/4
    const offset = parseInt(d.slug, 10) % LISTING_TEMPLATES.length;
    for (let i = 0; i < pickCount; i++) {
      const template = LISTING_TEMPLATES[(offset + i) % LISTING_TEMPLATES.length]!;
      const vin = buildVin(template, d.slug);
      const slug = buildSlug(template, vin);
      const existing = await prisma.listing.findUnique({ where: { vin } });
      if (existing) {
        await prisma.listing.update({
          where: { vin },
          data: {
            modelFamily: template.modelFamily,
            modelName: template.modelName,
            year: template.year,
            colour: template.colour,
            price: template.price,
            kmsDriven: template.kmsDriven,
            description: template.description,
            images: template.images,
            certificationStatus: template.certificationStatus,
            status: ListingStatus.ACTIVE,
            publishedAt: existing.publishedAt ?? new Date(),
          },
        });
        updatedListings += 1;
      } else {
        await prisma.listing.create({
          data: {
            vin,
            slug,
            dealerId: dealer.id,
            modelFamily: template.modelFamily,
            modelName: template.modelName,
            year: template.year,
            colour: template.colour,
            price: template.price,
            kmsDriven: template.kmsDriven,
            description: template.description,
            images: template.images,
            certificationStatus: template.certificationStatus,
            status: ListingStatus.ACTIVE,
            publishedAt: new Date(),
            // owners column added in migration 20260506100000.
            ...({ owners: 1 + (i % 3) } as Record<string, unknown>),
          },
        });
        createdListings += 1;
      }
    }
  }

  console.log(
    `Done. Dealers upserted: ${createdDealers}, listings created: ${createdListings}, listings refreshed: ${updatedListings}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
