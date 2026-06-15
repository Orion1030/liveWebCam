import { NextResponse } from 'next/server'
import type { ChildProcess } from 'child_process'
import store, { broadcast } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST() {
  if (store.tunnelProcess) {
    try { (store.tunnelProcess as ChildProcess).kill() } catch {}
    store.tunnelProcess = null
  }
  store.tunnel = { url: null, status: 'idle', error: null }
  broadcast(store.tunnelListeners, 'update', store.tunnel)
  return NextResponse.json({ success: true })
}
