import { NextRequest, NextResponse } from 'next/server'
import store, { broadcast } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  store.answer = body
  broadcast(store.senderListeners, 'answer', body)
  return NextResponse.json({ success: true })
}
