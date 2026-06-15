import { NextRequest, NextResponse } from 'next/server'
import store, { broadcast } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from') as 'sender' | 'viewer'
  const body = await request.json()

  if (from === 'sender') {
    store.senderCandidates.push(body)
    broadcast(store.viewerListeners, 'candidate', body)
  } else {
    store.viewerCandidates.push(body)
    broadcast(store.senderListeners, 'candidate', body)
  }

  return NextResponse.json({ success: true })
}
