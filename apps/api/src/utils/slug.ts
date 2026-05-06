// PRD §6.1.2 AC4 — slug-based URLs for SEO: /listings/{year}-{model-slug}-{shortId}
export function buildListingSlug(year: number, modelName: string, vin: string): string {
  const modelSlug = modelName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const shortId = vin.slice(-6).toLowerCase();
  return `${year}-${modelSlug}-${shortId}`;
}
