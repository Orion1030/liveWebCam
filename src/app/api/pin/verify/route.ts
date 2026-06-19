import { NextRequest, NextResponse } from 'next/server'
import store from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    if (!text) return NextResponse.json({ valid: false }, { status: 400 })
    const { pin, sessionId } = JSON.parse(text)
    const expectedPin     = process.env.STREAM_PIN       ?? store.pin
    const expectedSession = process.env.STREAM_SESSION_ID ?? store.sessionId
    const valid = typeof pin === 'string' && pin === expectedPin &&
                  typeof sessionId === 'string' && sessionId === expectedSession
    return NextResponse.json({ valid })
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
}
