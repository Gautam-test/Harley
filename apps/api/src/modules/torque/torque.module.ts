import { createTorqueClient } from '@hd-cpo/torque-client';
import { getEnv } from '../../config/env.js';

const env = getEnv();

// Singleton torque client. Mock by default; live impl lands once Torque API spec arrives
// (PRD Open Question 8). The interface is identical so consumers don't change.
export const torque = createTorqueClient({
  mode: env.TORQUE_MODE,
  baseUrl: env.TORQUE_BASE_URL,
  apiKey: env.TORQUE_API_KEY,
});
