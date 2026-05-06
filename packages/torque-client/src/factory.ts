import { TorqueMockClient } from './mock-client.js';
import type { TorqueClient } from './types.js';

export interface TorqueClientOptions {
  mode: 'mock' | 'live';
  baseUrl?: string;
  apiKey?: string;
}

export function createTorqueClient(opts: TorqueClientOptions): TorqueClient {
  if (opts.mode === 'mock') {
    return new TorqueMockClient();
  }
  // Live client implementation lands once the Torque API spec is delivered
  // (PRD Open Question 8). It will wrap fetch with retry (exp backoff, 3 attempts),
  // a circuit breaker (opossum), correlation-ID logging, and the canonical
  // response shape from `./types.ts`.
  throw new Error('Torque live client not yet implemented — awaiting client API spec');
}
