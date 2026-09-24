import { z } from 'zod';
import type { UserRole } from '../enums';

// Trim and lower-case before validating, so " Nusrat@TeslaPool.test " and
// "nusrat@teslapool.test" are the same account (the DB also enforces lower case).
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters'),
  email,
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** The signed-in user as the API returns it. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
