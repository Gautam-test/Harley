import { Router } from 'express';
import { prisma } from '../../config/prisma.js';

interface SitemapRow {
  slug: string;
  updatedAt: Date;
}

export const seoRouter = Router();

const STATIC_PATHS = ['/', '/search', '/sell-bike', '/about', '/privacy', '/terms', '/faq', '/contact'];

function originFor(req: import('express').Request): string {
  // Prefer X-Forwarded-Host for proxied envs; fall back to Host header.
  const proto = (req.get('x-forwarded-proto') ?? 'https').split(',')[0]!.trim();
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost:5173').split(',')[0]!.trim();
  return `${proto}://${host}`;
}

// PRD §6 SEO requirement — sitemap.xml served from the API and pinged on listing
// publish. Buyer site reverse-proxies /sitemap.xml → here.
seoRouter.get('/sitemap.xml', async (req, res, next) => {
  try {
    const origin = originFor(req);
    const listings = (await prisma.listing.findMany({
      where: { status: 'ACTIVE' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    })) as unknown as SitemapRow[];

    const urls = [
      ...STATIC_PATHS.map((p) => ({ loc: `${origin}${p}`, lastmod: undefined as string | undefined })),
      ...listings.map((l) => ({
        loc: `${origin}/listings/${l.slug}`,
        lastmod: l.updatedAt.toISOString(),
      })),
    ];

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls
        .map(
          (u) =>
            `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`,
        )
        .join('\n') +
      '\n</urlset>\n';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (e) {
    next(e);
  }
});

seoRouter.get('/robots.txt', (req, res) => {
  const origin = originFor(req);
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /dealer/',
      'Disallow: /admin/',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n'),
  );
});
