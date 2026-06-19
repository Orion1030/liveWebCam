import { NextRequest, NextResponse } from 'next/server'
import { signToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()
    if (
      !process.env.AUTH_USERNAME ||
      !process.env.AUTH_PASSWORD ||
      username !== process.env.AUTH_USERNAME ||
      password !== process.env.AUTH_PASSWORD
    ) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const token = await signToken()
    return NextResponse.json({ token })
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
