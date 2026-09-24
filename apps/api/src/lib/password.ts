import bcrypt from 'bcryptjs';

// Cost 10 keeps login around 50-100 ms: slow for brute force, fine for users.
const BCRYPT_COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
