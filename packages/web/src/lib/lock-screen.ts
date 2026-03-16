// Lock screen utilities — WebAuthn (Face ID / Touch ID) + password fallback
// All client-side, no server roundtrip needed.

const PREFIX = 'clsh_lock_';
const KEY_CREDENTIAL = `${PREFIX}credential`;
const KEY_USER_ID = `${PREFIX}user_id`;
const KEY_ENABLED = `${PREFIX}enabled`;
const KEY_PWD_HASH = `${PREFIX}pwd_hash`;

// --- Base64url helpers ---

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- State queries ---

export function isLockEnabled(): boolean {
  return localStorage.getItem(KEY_ENABLED) === 'true';
}

export function hasBiometricConfigured(): boolean {
  return localStorage.getItem(KEY_CREDENTIAL) !== null;
}

export function getClientPwdHash(): string | null {
  return localStorage.getItem(KEY_PWD_HASH);
}

export function getBiometricIds(): { credentialId: string; userId: string } | null {
  const credentialId = localStorage.getItem(KEY_CREDENTIAL);
  const userId = localStorage.getItem(KEY_USER_ID);
  if (!credentialId || !userId) return null;
  return { credentialId, userId };
}

export function hasPasswordConfigured(): boolean {
  return localStorage.getItem(KEY_PWD_HASH) !== null;
}

export function enableLock(): void {
  localStorage.setItem(KEY_ENABLED, 'true');
}

export function clearLock(): void {
  localStorage.removeItem(KEY_CREDENTIAL);
  localStorage.removeItem(KEY_USER_ID);
  localStorage.removeItem(KEY_ENABLED);
  localStorage.removeItem(KEY_PWD_HASH);
}

// --- Biometric (WebAuthn) ---

export async function isBiometricAvailable(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function getOrCreateUserId(): Uint8Array {
  const stored = localStorage.getItem(KEY_USER_ID);
  if (stored) {
    return new Uint8Array(fromBase64Url(stored));
  }
  const id = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(KEY_USER_ID, toBase64Url(id.buffer));
  return id;
}

export async function registerBiometric(): Promise<boolean> {
  try {
    const userId = getOrCreateUserId();
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'clsh' },
        user: {
          id: userId as unknown as BufferSource,
          name: 'clsh-user',
          displayName: 'clsh user',
        },
        challenge,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        attestation: 'none',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;

    localStorage.setItem(KEY_CREDENTIAL, toBase64Url(credential.rawId));
    return true;
  } catch {
    return false;
  }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const storedCredId = localStorage.getItem(KEY_CREDENTIAL);
    if (!storedCredId) return false;

    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: fromBase64Url(storedCredId),
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return assertion !== null;
  } catch {
    return false;
  }
}

// --- Password ---

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return toBase64Url(hash);
}

export async function setupPassword(password: string): Promise<void> {
  const hash = await hashPassword(password);
  localStorage.setItem(KEY_PWD_HASH, hash);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY_PWD_HASH);
  if (!stored) return false;
  const hash = await hashPassword(password);
  return hash === stored;
}

// --- Lock state restoration (for PWA re-auth) ---

/**
 * Restores lock screen state from server-side data.
 * Called after password auth in the PWA to skip LockSetup.
 * Sets the password hash, enables lock, and optionally restores biometric credential.
 */
export async function restoreLockState(
  password: string | null,
  biometric?: { credentialId: string; userId: string } | null,
  clientPwdHash?: string | null,
): Promise<void> {
  // Set password hash: prefer computing from plaintext, fall back to server-stored client hash
  if (password) {
    await setupPassword(password);
  } else if (clientPwdHash) {
    localStorage.setItem(KEY_PWD_HASH, clientPwdHash);
  }

  // Restore biometric credential if server had it
  if (biometric?.credentialId && biometric?.userId) {
    localStorage.setItem(KEY_CREDENTIAL, biometric.credentialId);
    localStorage.setItem(KEY_USER_ID, biometric.userId);
  }

  // Enable the lock screen
  enableLock();
}
