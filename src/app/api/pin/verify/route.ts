import { NextRequest, NextResponse } from 'next/server'
import store from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    if (!text) return NextResponse.json({ valid: false }, { status: 400 })
    const { pin } = JSON.parse(text)
    // On Vercel each invocation may be a cold container — prefer the env var
    // which is consistent across all instances over the in-memory store.
    const expected = process.env.STREAM_PIN ?? store.pin
    return NextResponse.json({ valid: typeof pin === 'string' && pin === expected })
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
}
