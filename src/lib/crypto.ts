// Password hashing for the local admin login. This is a client-only app
// (no backend), so this is hardening, not true authentication.
//
// Format of stored password records:
//   - Legacy:  64-char hex string = unsalted SHA-256 (kept readable for
//              migration on next successful login).
//   - Current: "pbkdf2$<iterations>$<saltB64>$<hashB64>" using PBKDF2-SHA-256
//              with a random per-device salt.

const PBKDF2_ITERATIONS = 150_000;
const PBKDF2_KEY_LEN = 32; // bytes

export async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const b64encode = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64decode = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  // SubtleCrypto's params accept a BufferSource; wrap in Uint8Array to satisfy TS lib types.
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    PBKDF2_KEY_LEN * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64encode(salt.buffer)}$${b64encode(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2$')) {
    const [, itStr, saltB64, hashB64] = stored.split('$');
    const iterations = Number(itStr);
    if (!iterations || !saltB64 || !hashB64) return false;
    const bits = await pbkdf2(password, b64decode(saltB64), iterations);
    const a = new Uint8Array(bits);
    const b = b64decode(hashB64);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }
  // Legacy unsalted SHA-256 path (migrated to PBKDF2 on next login).
  return (await sha256(password)) === stored;
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith('pbkdf2$');
}

// SHA-256 of the legacy default password 'admin'. Used only to detect whether
// the device is still on the factory default so we can prompt to change it.
// The hash is one-way and reveals nothing beyond "is the password still 'admin'".
export const DEFAULT_ADMIN_PASSWORD_HASH =
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

export function isDefaultPasswordHash(stored: string): boolean {
  // Only the legacy unsalted SHA-256 of "admin" can be matched without the salt.
  // PBKDF2 records with a random salt can never equal the default hash, which
  // is the desired behaviour once the user has rotated their password.
  return stored === DEFAULT_ADMIN_PASSWORD_HASH;
}
