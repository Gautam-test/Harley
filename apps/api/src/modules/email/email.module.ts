import { getEnv } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Provider-agnostic email interface (PRD §4.1, Open Question 11).
// Mock prints to logs in dev; SendGrid / SES implementations slot in here.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

class MockEmailProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<void> {
    logger.info({ to: msg.to, subject: msg.subject }, '✉️ [MOCK EMAIL]');
  }
}

let cached: EmailProvider | null = null;
export function emailProvider(): EmailProvider {
  if (cached) return cached;
  const env = getEnv();
  switch (env.EMAIL_PROVIDER) {
    case 'mock':
    default:
      cached = new MockEmailProvider();
  }
  return cached;
}

// PRD §6.2.8 — branded notification templates. Kept inline at v1; pull into
// a templating engine (handlebars / mjml) in a later sprint if volume grows.
export function dealerLeadEmail(opts: {
  dealerName: string;
  leadType: 'BUYER' | 'TRADE_IN';
  buyerName: string;
  buyerCity?: string;
  contextLine?: string;
}): EmailMessage {
  const subjectMap = {
    BUYER: 'New listing enquiry — H-D Certified',
    TRADE_IN: 'New trade-in enquiry — H-D Certified',
  } as const;
  return {
    to: '', // Caller sets the dealer email (decrypted out-of-band).
    subject: subjectMap[opts.leadType],
    html: `<div style="font-family:Arial,sans-serif;background:#000;color:#fff;padding:24px">
  <h1 style="color:#FF6600;text-transform:uppercase;letter-spacing:0.04em;">H-D Certified</h1>
  <p>Hi ${opts.dealerName},</p>
  <p>You have a new ${opts.leadType.toLowerCase().replace('_', '-')} lead from <strong>${opts.buyerName}</strong>${opts.buyerCity ? ` (${opts.buyerCity})` : ''}.</p>
  ${opts.contextLine ? `<p>${opts.contextLine}</p>` : ''}
  <p>Sign in to your dealer portal to follow up.</p>
</div>`,
    text: `New ${opts.leadType} lead from ${opts.buyerName}${opts.buyerCity ? ` (${opts.buyerCity})` : ''}. Sign in to follow up.`,
  };
}
