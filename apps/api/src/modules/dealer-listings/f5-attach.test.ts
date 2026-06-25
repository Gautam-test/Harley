import { describe, it, expect } from 'vitest';
import { gatherSoldDocAttachments } from './dealer-listings.service.js';

// F5: the attachment gatherer must (a) attach every reachable doc from both
// soldDocs (F3) and cpoDocs (F4), (b) skip unreachable ones gracefully, and
// (c) never throw on a bad URL.
describe('F5 — gatherSoldDocAttachments', () => {
  it('attaches reachable docs from soldDocs + cpoDocs and skips bad ones', async () => {
    const listing = {
      // Two reachable local endpoints stand in for uploaded files.
      soldDocs: [
        { id: '1', url: 'http://localhost:4001/api/v1/health', label: 'Invoice' },
      ],
      cpoDocs: {
        cpoCertUrl: 'http://localhost:4001/api/v1/health',
        rsaUrl: 'http://localhost:4001/does-not-exist-404', // skipped (404)
        warrantyUrl: '', // skipped (empty)
      },
    };
    const out = await gatherSoldDocAttachments(listing);
    // Invoice + cpoCert reachable (200) → 2 attachments; 404 + empty skipped.
    expect(out.length).toBe(2);
    expect(out.every((a) => a.content instanceof Buffer && a.content.length > 0)).toBe(true);
    expect(out.map((a) => a.filename)).toContain('Invoice.pdf');
  });

  it('returns empty array when there are no docs (no throw)', async () => {
    const out = await gatherSoldDocAttachments({ soldDocs: null, cpoDocs: null });
    expect(out).toEqual([]);
  });
});
