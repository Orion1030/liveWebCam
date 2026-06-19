import { SignJWT, jwtVerify } from 'jose'

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'dev-secret-please-set-JWT_SECRET-in-env'
  )
}

export async function signToken(): Promise<string> {
  return new SignJWT({ role: 'sender' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret())
    return true
  } catch {
    return false
  }
}
