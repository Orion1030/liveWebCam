import { NextRequest, NextResponse } from 'next/server'
import store from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    if (!text) return NextResponse.json({ valid: false }, { status: 400 })
    const { pin } = JSON.parse(text)
    return NextResponse.json({ valid: typeof pin === 'string' && pin === store.pin })
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
}
