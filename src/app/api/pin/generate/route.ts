import { NextRequest, NextResponse } from 'next/server'
import store, { generateSessionId } from '@/lib/store'
import { verifyToken, encryptSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (process.env.STREAM_PIN) {
    const pin       = process.env.STREAM_PIN
    const sessionId = process.env.STREAM_SESSION_ID ?? store.sessionId
    const sessionToken = await encryptSession(pin, sessionId)
    return NextResponse.json({ pin, sessionId, sessionToken, fixed: true })
  }

  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  store.pin       = Math.floor(100000 + Math.random() * 900000).toString()
  store.sessionId = generateSessionId()
  const sessionToken = await encryptSession(store.pin, store.sessionId)
  return NextResponse.json({ pin: store.pin, sessionId: store.sessionId, sessionToken })
}
