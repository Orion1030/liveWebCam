import { NextRequest, NextResponse } from 'next/server'
import store from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Only allow from localhost — deny tunneled requests
  const host = request.headers.get('host') ?? ''
  const forwarded = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')
  const isLocal = (host.includes('localhost') || host.includes('127.0.0.1')) && !forwarded

  if (!isLocal) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // On Vercel the PIN is fixed via env var — regenerating in-memory would
  // only affect this one cold container and break verify on other instances.
  if (process.env.STREAM_PIN) {
    return NextResponse.json({ pin: process.env.STREAM_PIN })
  }
  store.pin = Math.floor(100000 + Math.random() * 900000).toString()
  return NextResponse.json({ pin: store.pin })
}
