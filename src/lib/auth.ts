import { SignJWT, jwtVerify, EncryptJWT, jwtDecrypt } from 'jose'

function authSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'dev-secret-please-set-JWT_SECRET-in-env'
  )
}

// Derives a fixed 32-byte AES key from JWT_SECRET via SHA-256.
// This lets us use any-length JWT_SECRET with AES-256-GCM encryption.
async function encKey(): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'dev-secret-please-set-JWT_SECRET-in-env'
  )
  const hash = await crypto.subtle.digest('SHA-256', raw)
  return new Uint8Array(hash)
}

// ── Sender auth JWT ──────────────────────────────────────────────────────────

export async function signToken(): Promise<string> {
  return new SignJWT({ role: 'sender' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(authSecret())
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, authSecret())
    return true
  } catch {
    return false
  }
}

// ── Session token (encrypted PIN + sessionId) ────────────────────────────────
// Travels inside the viewer link (?t=...) so the verify endpoint never needs
// to read server-side state — it just decrypts and checks the submitted PIN.

export async function encryptSession(pin: string, sessionId: string): Promise<string> {
  return new EncryptJWT({ pin, sessionId })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .encrypt(await encKey())
}

export async function decryptSession(
  token: string
): Promise<{ pin: string; sessionId: string } | null> {
  try {
    const { payload } = await jwtDecrypt(token, await encKey())
    if (typeof payload.pin !== 'string' || typeof payload.sessionId !== 'string') return null
    return { pin: payload.pin, sessionId: payload.sessionId }
  } catch {
    return null
  }
}
