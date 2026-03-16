import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Minimum password length enforced server-side. */
export const MIN_PASSWORD_LENGTH = 6;

/** scrypt parameters. */
const SCRYPT_N = 16384; // cost
const SCRYPT_R = 8;     // block size
const SCRYPT_P = 1;     // parallelization
const KEY_LEN = 64;     // bytes
const SALT_LEN = 16;    // bytes
const MAX_MEM = 256 * 1024 * 1024; // 256 MB

/**
 * Hashes a password with scrypt and a random 16-byte salt.
 * Returns the storage format: `scrypt$<hexSalt>$<hexKey>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Verifies a password against a stored hash using constant-time comparison.
 * Returns false (never throws) if the stored format is invalid.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[1], 'hex');
  const storedKey = Buffer.from(parts[2], 'hex');

  if (salt.length !== SALT_LEN || storedKey.length !== KEY_LEN) return false;

  const candidateKey = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return timingSafeEqual(candidateKey, storedKey);
}
