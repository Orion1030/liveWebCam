import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { join } from 'path'
import store, { broadcast } from '@/lib/store'

export const dynamic = 'force-dynamic'

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

// Resolve binary using process.cwd() — safe in both dev and next start
const BIN = join(
  process.cwd(),
  'node_modules',
  'cloudflared',
  'bin',
  process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
)

export async function POST() {
  if (store.tunnel.status === 'running' || store.tunnel.status === 'starting') {
    return NextResponse.json({ error: 'Tunnel already active' }, { status: 400 })
  }

  store.tunnel = { url: null, status: 'starting', error: null }
  broadcast(store.tunnelListeners, 'update', store.tunnel)

  try {
    const port = process.env.PORT ?? '3000'
    const proc = spawn(BIN, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    store.tunnelProcess = proc

    const onData = (data: Buffer) => {
      const match = data.toString().match(URL_PATTERN)
      if (!match) return

      store.tunnel = { url: match[0], status: 'running', error: null }
      broadcast(store.tunnelListeners, 'update', store.tunnel)

      // Cloudflared is very chatty — once we have the URL, drain both
      // streams silently so the output never blocks the event loop again.
      proc.stdout?.removeListener('data', onData)
      proc.stderr?.removeListener('data', onData)
      proc.stdout?.resume()
      proc.stderr?.resume()
    }

    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)

    proc.on('exit', () => {
      if (store.tunnel.status !== 'idle') {
        store.tunnel = { url: null, status: 'idle', error: null }
        broadcast(store.tunnelListeners, 'update', store.tunnel)
      }
      store.tunnelProcess = null
    })

    proc.on('error', (err) => {
      store.tunnel = { url: null, status: 'error', error: err.message }
      broadcast(store.tunnelListeners, 'update', store.tunnel)
      store.tunnelProcess = null
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    store.tunnel = { url: null, status: 'error', error: String(err) }
    broadcast(store.tunnelListeners, 'update', store.tunnel)
    return NextResponse.json({ error: 'Failed to start tunnel' }, { status: 500 })
  }
}
