import { randomUUID } from 'node:crypto';
import type { AuthUser, LoginInput, RegisterInput } from '@teslapool/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { users, walletAccounts } from '../../db/schema';
import { isUniqueViolation } from '../../lib/dbErrors';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';

type UserRow = typeof users.$inferSelect;

export const toAuthUser = (user: UserRow): AuthUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

/**
 * Sign-up is for passengers only: drivers come with a vehicle and are
 * onboarded separately (seeded in this MVP). Every passenger gets an empty
 * TeslaPay wallet in the same transaction.
 */
export async function registerPassenger(input: RegisterInput): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: input.name, email: input.email, passwordHash, role: 'PASSENGER' })
        .returning();
      await tx.insert(walletAccounts).values({ userId: user!.id });
      return toAuthUser(user!);
    });
  } catch (err) {
    // The unique constraint, not a prior lookup, decides: two simultaneous
    // sign-ups with the same email cannot both succeed.
    if (isUniqueViolation(err, 'users_email_unique')) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

// Compared against when the email is unknown, so "no such user" costs the
// same bcrypt time as "wrong password" and timing does not reveal accounts.
let dummyHash: Promise<string> | undefined;

export async function login(input: LoginInput): Promise<AuthUser> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email));
  const passwordOk = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await (dummyHash ??= hashPassword(randomUUID()))),
  );
  if (!user || !passwordOk) {
    // Same answer for both cases: never confirm whether an email is registered.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  }
  return toAuthUser(user);
}

/** Re-reads the user so /me reflects the database, not just the token. */
export async function getUser(userId: string): Promise<AuthUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  return toAuthUser(user);
}
