import { NextRequest, NextResponse } from 'next/server'
import store, { broadcast, resetSignaling } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!store.offer) return NextResponse.json({ offer: null }, { status: 404 })
  return NextResponse.json({ offer: store.offer })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  resetSignaling()
  store.offer = body
  broadcast(store.viewerListeners, 'offer', body)
  return NextResponse.json({ success: true })
}

export async function DELETE() {
  resetSignaling()
  broadcast(store.viewerListeners, 'stream-ended', null)
  return NextResponse.json({ success: true })
}
