// Minimal OpenAPI shell. Paths grow with each module in subsequent sprints.
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'H-D CPO Marketplace API',
    version: '0.1.0',
    description:
      'Backend for the Harley-Davidson Certified Pre-Owned Marketplace. See /docs/PRD.md for spec.',
  },
  servers: [{ url: '/api/v1', description: 'Default' }],
  paths: {
    '/health': {
      get: { summary: 'Liveness check', responses: { '200': { description: 'OK' } } },
    },
    '/health/ready': {
      get: {
        summary: 'Readiness check (DB + Redis)',
        responses: { '200': { description: 'OK' }, '503': { description: 'Degraded' } },
      },
    },
    '/auth/dealer/login': {
      post: { summary: 'Dealer username/password login', responses: { '200': { description: 'OK' } } },
    },
    '/auth/admin/login': {
      post: { summary: 'Admin email/password login', responses: { '200': { description: 'OK' } } },
    },
    '/listings': {
      get: { summary: 'Public listing search', responses: { '200': { description: 'OK' } } },
    },
    '/listings/{slug}': {
      get: {
        summary: 'Public listing detail',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
    },
    '/dealer/listings': {
      get: { summary: 'Dealer — list own inventory', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Dealer — create new draft listing', responses: { '201': { description: 'Created' } } },
    },
    '/admin/listings/{id}/publish': {
      post: { summary: 'Admin — publish a DRAFT listing (gated; dealers cannot self-publish)', responses: { '200': { description: 'OK' }, '409': { description: 'Listing not in DRAFT' } } },
    },
    '/dealer/listings/{id}/mark-sold': {
      post: { summary: 'Dealer — mark a listing SOLD', responses: { '200': { description: 'OK' } } },
    },
    '/torque/vehicles/{vin}': {
      get: { summary: 'Dealer — fetch vehicle metadata from Torque DMS', responses: { '200': { description: 'OK' } } },
    },
    '/torque/vehicles/{vin}/cpo-kit': {
      get: { summary: 'Dealer — fetch CPO kit doc URLs from Torque', responses: { '200': { description: 'OK' } } },
    },
    '/otp/send': {
      post: { summary: 'Send OTP to a phone (rate-limited)', responses: { '200': { description: 'OK' }, '429': { description: 'Rate limited' } } },
    },
    '/otp/verify': {
      post: { summary: 'Verify OTP and get a verifiedToken', responses: { '200': { description: 'OK' }, '401': { description: 'Invalid OTP' } } },
    },
    '/leads/trade-in': {
      post: { summary: 'Submit trade-in lead. Requires verifiedToken (Bearer).', responses: { '201': { description: 'Created' } } },
    },
    '/leads/listings/{slug}/enquiry': {
      post: { summary: 'Submit listing-specific enquiry. Requires verifiedToken (Bearer).', responses: { '201': { description: 'Created' } } },
    },
    '/dealer/leads/buyer': {
      get: { summary: 'Dealer — list listing enquiries', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Dealer — manually log a buyer enquiry (phone / walk-in)', responses: { '201': { description: 'Created' } } },
    },
    '/dealer/leads/trade-in': {
      get: { summary: 'Dealer — list trade-in enquiries', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Dealer — manually log a seller / trade-in enquiry', responses: { '201': { description: 'Created' } } },
    },
    '/dealer/leads/{kind}/{id}/status': {
      patch: { summary: 'Dealer — update lead status', responses: { '200': { description: 'OK' } } },
    },
    '/dealers': {
      get: { summary: 'Public dealer locator', responses: { '200': { description: 'OK' } } },
    },
  },
};
