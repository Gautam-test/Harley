import { z } from 'zod';

// `username` here is a misnomer kept for API back-compat: it accepts the
// dealer's EMAIL (canonical, e.g. `sales@gurgaon-hd.example.in`) or the
// legacy username slug (e.g. `gurgaon-hd`). Upper bound raised to 128
// so long company emails fit. Server-side lookup is OR(email, username)
// — see auth.service.ts → dealerLogin.
export const dealerLoginInput = z.object({
  username: z.string().min(3).max(128),
  password: z.string().min(8).max(128),
});
export type DealerLoginInput = z.infer<typeof dealerLoginInput>;

export const adminLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type AdminLoginInput = z.infer<typeof adminLoginInput>;

export const authResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    role: z.enum(['DEALER', 'ADMIN']),
    name: z.string(),
  }),
});
export type AuthResponse = z.infer<typeof authResponse>;
