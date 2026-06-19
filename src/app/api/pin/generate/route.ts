import { NextRequest, NextResponse } from 'next/server'
import store, { generateSessionId } from '@/lib/store'
import { verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // When STREAM_PIN is set the PIN is fixed via env var — safe to return it
  // from any host (no secret to protect), and no regeneration is possible.
  if (process.env.STREAM_PIN) {
    return NextResponse.json({
      pin: process.env.STREAM_PIN,
      sessionId: process.env.STREAM_SESSION_ID ?? store.sessionId,
      fixed: true,
    })
  }

  // Require a valid sender JWT — issued at login, stored in the browser.
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  store.pin = Math.floor(100000 + Math.random() * 900000).toString()
  store.sessionId = generateSessionId()
  return NextResponse.json({ pin: store.pin, sessionId: store.sessionId })
}
