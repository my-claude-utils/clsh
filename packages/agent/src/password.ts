import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

/** Minimum password length enforced server-side. */
export const MIN_PASSWORD_LENGTH = 12

const SCRYPT_N = 131072 // 2^17 — OWASP recommended for high-value targets
const LEGACY_SCRYPT_N = 16384 // 2^14 — old default, kept for verifying existing hashes
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64
const SALT_LEN = 16
const MAX_MEM = 256 * 1024 * 1024

/**
 * Hashes a password with scrypt and a random 16-byte salt.
 * New format includes N: `scrypt:<N>$<hexSalt>$<hexKey>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN)
  const key = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  })
  return `scrypt:${String(SCRYPT_N)}$${salt.toString('hex')}$${key.toString('hex')}`
}

/**
 * Verifies a password against a stored hash using constant-time comparison.
 * Supports both new format (scrypt:<N>$salt$key) and legacy (scrypt$salt$key).
 * Returns false (never throws) if the stored format is invalid.
 */
export function verifyPassword(password: string, stored: string): boolean {
  let n: number
  let saltHex: string
  let keyHex: string

  if (stored.startsWith('scrypt:')) {
    // New format: scrypt:<N>$<salt>$<key>
    const parts = stored.slice(7).split('$')
    if (parts.length !== 3) return false
    n = parseInt(parts[0], 10)
    if (isNaN(n)) return false
    saltHex = parts[1]
    keyHex = parts[2]
  } else if (stored.startsWith('scrypt$')) {
    // Legacy format: scrypt$<salt>$<key> (N=16384)
    const parts = stored.split('$')
    if (parts.length !== 3) return false
    n = LEGACY_SCRYPT_N
    saltHex = parts[1]
    keyHex = parts[2]
  } else {
    return false
  }

  const salt = Buffer.from(saltHex, 'hex')
  const storedKey = Buffer.from(keyHex, 'hex')

  if (salt.length !== SALT_LEN || storedKey.length !== KEY_LEN) return false

  const candidateKey = scryptSync(password, salt, KEY_LEN, {
    N: n,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  })

  return timingSafeEqual(candidateKey, storedKey)
}
