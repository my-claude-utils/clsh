import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { DbStatements } from './db.js';

/**
 * Generates a cryptographically secure bootstrap token (256-bit, base64url encoded).
 * This token is shown once in the terminal and used for initial authentication.
 */
export function generateBootstrapToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Returns the SHA-256 hex digest of the given token.
 * Only the hash is stored in the database -- never the raw token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** How long a bootstrap token remains valid after creation (5 minutes). */
const BOOTSTRAP_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Verifies a bootstrap token candidate against the database.
 * Tokens expire after 5 minutes — long enough for the user to scan the QR
 * in Safari, add the PWA to their home screen, and re-authenticate, but
 * short enough to limit exposure if the QR code is intercepted.
 */
export function verifyBootstrapToken(
  statements: DbStatements,
  candidateToken: string,
): boolean {
  const hash = hashToken(candidateToken);
  const row = statements.getBootstrapToken.get(hash);
  if (!row) return false;

  const createdAt = new Date(row.created_at + 'Z').getTime(); // SQLite datetime is UTC without 'Z'
  const age = Date.now() - createdAt;
  return age < BOOTSTRAP_TOKEN_TTL_MS;
}

export interface SessionJWTClaims {
  email?: string;
  authMethod: 'bootstrap' | 'password' | 'biometric';
}

/**
 * Creates a signed JWT for an authenticated session.
 * Uses HS256 with an 8-hour expiry and a random JTI for uniqueness.
 */
export async function createSessionJWT(
  claims: SessionJWTClaims,
  secret: string,
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  const jti = randomUUID();

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .setJti(jti)
    .setIssuer('clsh-agent')
    .setSubject(claims.email ?? 'local')
    .sign(secretKey);
}

export interface VerifiedJWT {
  payload: JWTPayload;
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Throws if the token is invalid, expired, or tampered with.
 */
export async function verifyJWT(
  token: string,
  secret: string,
): Promise<VerifiedJWT> {
  const secretKey = new TextEncoder().encode(secret);

  const { payload } = await jwtVerify(token, secretKey, {
    issuer: 'clsh-agent',
    algorithms: ['HS256'],
  });

  return { payload };
}
