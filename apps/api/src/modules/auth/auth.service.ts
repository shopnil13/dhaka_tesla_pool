import type { AuthUser, RegisterInput } from '@teslapool/shared';
import { db } from '../../db/client';
import { users, walletAccounts } from '../../db/schema';
import { isUniqueViolation } from '../../lib/dbErrors';
import { AppError } from '../../lib/errors';
import { hashPassword } from '../../lib/password';

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
