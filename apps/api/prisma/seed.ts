/* eslint-disable no-console */
import {
  PrismaClient,
  CertStatus,
  ListingStatus,
  DealerStatus,
  OrderStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptPii } from '../src/utils/crypto.js';

const prisma = new PrismaClient();

// Real H-D bike imagery from medialinksonline.com (the dealer image CDN used
// by the NZ reference portal h-dcertified.co.nz). Each ID is the asset ID of
// an actual Harley-Davidson motorcycle photo. URL pattern:
//   {ID}x{w}x{h}xFFFFFFxH.jpg   (H = horizontal, white background)
const img = (id: string, w = 1600, h = 1200) =>
  `https://images.medialinksonline.com/${id}x${w}x${h}xFFFFFFxH.jpg`;

interface SeedListing {
  vin: string;
  slug: string;
  modelFamily: string;
  modelName: string;
  year: number;
  colour: string;
  price: number;
  kmsDriven: number;
  description: string;
  images: string[];
  certificationStatus: CertStatus;
}

const LISTINGS: SeedListing[] = [
  {
    vin: '1HD1KHM18MB678901',
    slug: '2023-street-glide-special-678901',
    modelFamily: 'Grand American Touring',
    modelName: 'Street Glide Special',
    year: 2023,
    colour: 'Vivid Black',
    price: 2895000,
    kmsDriven: 8400,
    description:
      'A flagship grand American tourer in immaculate, single-owner condition. 110-point inspection complete. Milwaukee-Eight 114 engine, Boom! Box GTS infotainment, premium audio, batwing fairing. Always garaged, full service history attached.',
    images: [img('8825026'), img('8822168'), img('8825056')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1FBV13NB512347',
    slug: '2024-fat-boy-114-512347',
    modelFamily: 'Cruiser',
    modelName: 'Fat Boy 114',
    year: 2024,
    colour: 'Vivid Black',
    price: 1950000,
    kmsDriven: 3200,
    description:
      'The icon. 2024 Fat Boy 114 with the powerful Milwaukee-Eight 114, classic Lakester wheels, and that unmistakable solid-disc silhouette. Pristine original paint and chrome. Comes with original toolkit, both keys, and complete service records.',
    images: [img('8822481'), img('7779234'), img('7804764')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1KEM13PB445566',
    slug: '2023-road-king-special-445566',
    modelFamily: 'Grand American Touring',
    modelName: 'Road King Special',
    year: 2023,
    colour: 'Black Denim',
    price: 2475000,
    kmsDriven: 12500,
    description:
      'Stripped-back tourer with attitude. Mini-ape handlebars, blacked-out powertrain, hard saddlebags, and the M-8 114 doing the talking. Adult-owned, regularly serviced at the authorised dealer. Includes Harley-Davidson Genuine premium grips upgrade.',
    images: [img('8825087'), img('8830705')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1RA1A5RB778899',
    slug: '2024-pan-america-1250s-778899',
    modelFamily: 'Adventure Touring',
    modelName: 'Pan America 1250 Special',
    year: 2024,
    colour: 'Pearl White',
    price: 2295000,
    kmsDriven: 5600,
    description:
      'Adventure-ready Pan America 1250 Special with Adaptive Ride Height, semi-active suspension, and 150 hp Revolution Max powertrain. Crash bars, hand guards, and Givi top case included. Fully on-road documented.',
    images: [img('8825071'), img('8613849')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1HX212NB223344',
    slug: '2024-sportster-s-223344',
    modelFamily: 'Sport',
    modelName: 'Sportster S',
    year: 2024,
    colour: 'Industrial Yellow',
    price: 1675000,
    kmsDriven: 4100,
    description:
      'The all-new Sportster S — Revolution Max 1250T, ride modes, traction control, and aggressive bobber-style stance. Yellow on black. Single owner, dealer-maintained.',
    images: [img('8825049')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1FXX11PB334455',
    slug: '2023-heritage-classic-114-334455',
    modelFamily: 'Cruiser',
    modelName: 'Heritage Classic 114',
    year: 2023,
    colour: 'Vivid Black',
    price: 2150000,
    kmsDriven: 9200,
    description:
      'Soft tail Heritage Classic with the 114 engine and leather-trim saddlebags. Whitewall tyres, chrome fender accents, classic floorboards. A true cruiser for long Sunday rides.',
    images: [img('8225108'), img('8374924'), img('7779193')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1FBM18MB667788',
    slug: '2024-low-rider-s-667788',
    modelFamily: 'Cruiser',
    modelName: 'Low Rider S',
    year: 2024,
    colour: 'Vivid Black',
    price: 1825000,
    kmsDriven: 2800,
    description:
      'Performance cruiser. Milwaukee-Eight 117, mid-mount controls, drag-style bars, blacked-out finish. Less than 3,000 km — practically new.',
    images: [img('8757963'), img('8374925')],
    certificationStatus: CertStatus.CPO,
  },
  {
    vin: '1HD1XL211NB998877',
    slug: '2022-iron-883-998877',
    modelFamily: 'Sport',
    modelName: 'Iron 883',
    year: 2022,
    colour: 'Denim Black',
    price: 950000,
    kmsDriven: 14300,
    description:
      'The everyday iron-fist Sportster. 883cc Evolution V-twin, blacked-out everything, peanut tank. Excellent condition, second owner.',
    images: [img('8374923'), img('7779211')],
    certificationStatus: CertStatus.AS_IS,
  },
  {
    vin: '1HD1FBR1XPB001122',
    slug: '2024-street-bob-114-001122',
    modelFamily: 'Cruiser',
    modelName: 'Street Bob 114',
    year: 2024,
    colour: 'Redline Red',
    price: 1495000,
    kmsDriven: 6700,
    description:
      'Pure stripped-down soft-tail bobber attitude with the M-8 114. Mini-ape bars, single seat, fat front 19" wheel. Originally sold by us, now back for a second owner.',
    images: [img('8825065')],
    certificationStatus: CertStatus.CPO,
  },
];

async function main() {
  console.log('Seeding database…');

  const adminPasswordHash = await bcrypt.hash('Admin@123!', 12);
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@hd-cpo.local' },
    update: {},
    create: {
      email: 'admin@hd-cpo.local',
      passwordHash: adminPasswordHash,
      name: 'H-D Admin',
    },
  });
  console.log(`Admin: ${admin.email} / Admin@123!`);

  const dealerPasswordHash = await bcrypt.hash('Dealer@123!', 12);
  const dealer = await prisma.dealer.upsert({
    where: { username: 'gurgaon-hd' },
    update: {},
    create: {
      username: 'gurgaon-hd',
      passwordHash: dealerPasswordHash,
      name: 'Capital Harley-Davidson Gurgaon',
      legalName: 'Capital Motorcycles Pvt Ltd',
      email: 'sales@capital-hd.example.in',
      phone: '+911244567890',
      address: 'Plot 12, Sector 14',
      city: 'Gurgaon',
      state: 'Haryana',
      pincode: '122001',
      latitude: 28.4595,
      longitude: 77.0266,
      torqueDealerId: 'TQ-DEALER-0001',
      status: DealerStatus.ACTIVE,
    },
  });
  console.log(`Dealer: ${dealer.username} / Dealer@123!`);

  // Second dealer for the locator demo.
  await prisma.dealer.upsert({
    where: { username: 'mumbai-hd' },
    update: {},
    create: {
      username: 'mumbai-hd',
      passwordHash: dealerPasswordHash,
      name: 'Seven Islands Harley-Davidson Mumbai',
      legalName: 'Seven Islands Motorcycles Pvt Ltd',
      email: 'sales@7islands-hd.example.in',
      phone: '+912242233344',
      address: 'Linking Road, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      latitude: 19.0596,
      longitude: 72.8295,
      torqueDealerId: 'TQ-DEALER-0002',
      status: DealerStatus.ACTIVE,
    },
  });

  for (const [idx, l] of LISTINGS.entries()) {
    // BUG-047/053/059: every Download Certificate PDF QA report has
    // boiled down to "button hidden because registrationNumber is null
    // on every seed listing". The cert button is correctly gated per
    // BUG-043 — but with zero seed rows carrying the cert metadata, QA
    // could never see it. Backfill all CPO seed listings with realistic
    // certificate metadata so the button is visible by default on the
    // demo. AS_IS rows stay metadata-less because the cert isn't
    // applicable.
    const isCpo = l.certificationStatus === CertStatus.CPO;
    const certFields = isCpo
      ? {
          registrationNumber: `DL${String(10 + idx).padStart(2, '0')}HD${String(1000 + idx).padStart(4, '0')}`,
          inspectedBy: 'Authorised H-D Technician',
          certifiedOn: new Date(Date.now() - (30 + idx) * 24 * 60 * 60 * 1000),
        }
      : {};

    await prisma.listing.upsert({
      where: { vin: l.vin },
      update: {
        modelFamily: l.modelFamily,
        modelName: l.modelName,
        year: l.year,
        colour: l.colour,
        price: l.price,
        kmsDriven: l.kmsDriven,
        description: l.description,
        images: l.images,
        certificationStatus: l.certificationStatus,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date(),
        ...certFields,
      },
      create: {
        vin: l.vin,
        slug: l.slug,
        dealerId: dealer.id,
        modelFamily: l.modelFamily,
        modelName: l.modelName,
        year: l.year,
        colour: l.colour,
        price: l.price,
        kmsDriven: l.kmsDriven,
        description: l.description,
        images: l.images,
        certificationStatus: l.certificationStatus,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date(),
        ...certFields,
      },
    });
  }
  console.log(`Listings: ${LISTINGS.length} bikes`);

  const STATIC = [
    {
      key: 'about',
      title: 'About H-D Certified',
      bodyHtml:
        '<p>The H-D Certified programme brings the rigour of factory-grade inspection to every pre-owned Harley-Davidson sold through authorised dealers. Every bike passes a 110-point check, comes with a 12-month mechanical &amp; electrical guarantee, kilometre verification, and qualifies for H.O.G. membership.</p><p>Buy with confidence. Sell with ease. Always through an authorised dealer.</p>',
    },
    {
      key: 'faq',
      title: 'Frequently Asked Questions',
      bodyHtml:
        '<h2>What is H-D Certified?</h2><p>It is the official Harley-Davidson programme for pre-owned motorcycles. Every motorcycle has been inspected, verified and warranted by an authorised dealer.</p><h2>Can I trade in my existing motorcycle?</h2><p>Yes. Use the Sell Your Motorcycle form and an authorised dealer will reach out within 48 hours.</p><h2>How is my data handled?</h2><p>Your phone and email are encrypted at rest and only revealed to the dealer you enquire with. See our privacy policy for details.</p>',
    },
    {
      key: 'privacy',
      title: 'Privacy Policy',
      bodyHtml:
        '<p>We collect only the minimum information required to connect you with an authorised Harley-Davidson dealer: name, phone, email, city/pincode, and the bike(s) you enquire about.</p><h2>How we store data</h2><p>Phone and email are encrypted at rest using AES-256-GCM. Only the dealer to whom your lead is routed can see decrypted contact details.</p><h2>Sharing</h2><p>We do not share your data with third parties for marketing.</p>',
    },
    {
      key: 'terms',
      title: 'Terms &amp; Conditions',
      bodyHtml:
        '<p>The H-D Certified Marketplace acts as an intake platform connecting buyers and sellers with authorised Harley-Davidson dealers. We are not a party to any sale agreement, financing, or insurance contract.</p>',
    },
    {
      key: 'contact',
      title: 'Contact Us',
      bodyHtml:
        '<p>For questions about the H-D Certified Marketplace, email <a href="mailto:hello@hd-cpo.local">hello@hd-cpo.local</a>. For questions about a specific bike, contact the dealer listed on the bike\'s detail page.</p>',
    },
  ];
  for (const c of STATIC) {
    await prisma.staticContent.upsert({
      where: { key: c.key },
      update: { title: c.title, bodyHtml: c.bodyHtml },
      create: c,
    });
  }
  console.log(`Static content: ${STATIC.length} pages`);

  // Sample order so the public "Track Your Harley" page has something to show.
  // Matches the order ID shown in the frozen Figma design.
  const sampleOrderId = '9876543212345678';
  const existingOrder = await prisma.order.findUnique({
    where: { orderId: sampleOrderId },
    select: { id: true },
  });
  if (!existingOrder) {
    const sourceListing = await prisma.listing.findFirst({
      where: { dealerId: dealer.id },
      select: { id: true, year: true, modelName: true },
    });
    const order = await prisma.order.create({
      data: {
        orderId: sampleOrderId,
        buyerName: 'Rohit Anand',
        buyerPhoneEnc: encryptPii('+919810222313'),
        buyerEmailEnc: encryptPii('rohit.a@example.in'),
        bikeLabel: sourceListing
          ? `${sourceListing.year} Harley-Davidson ${sourceListing.modelName}`
          : '2022 Harley-Davidson Street Bob 114',
        listingId: sourceListing?.id,
        dealerId: dealer.id,
        status: OrderStatus.IN_TRANSIT,
        estimatedDelivery: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
    });
    // Backfill events showing the prior stages already complete.
    const baseDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stages: { status: OrderStatus; offsetDays: number; note: string }[] = [
      { status: OrderStatus.ORDER_CONFIRMED, offsetDays: 0, note: 'Order confirmed and being prepared.' },
      { status: OrderStatus.QUALITY_INSPECTION, offsetDays: 1, note: '110-point inspection completed successfully.' },
      { status: OrderStatus.DOCUMENTATION, offsetDays: 2, note: 'Registration and documentation in progress.' },
      { status: OrderStatus.IN_TRANSIT, offsetDays: 6, note: 'Bike has left dealership, on its way.' },
    ];
    for (const s of stages) {
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          status: s.status,
          occurredAt: new Date(baseDate.getTime() + s.offsetDays * 24 * 60 * 60 * 1000),
          note: s.note,
        },
      });
    }
    console.log(`Order: ${sampleOrderId} (Track Your Harley demo)`);
  } else {
    console.log(`Order: ${sampleOrderId} (already seeded)`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
