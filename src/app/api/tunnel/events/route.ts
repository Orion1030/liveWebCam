import { NextRequest } from 'next/server'
import store from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {}
      }

      enqueue('update', store.tunnel)
      store.tunnelListeners.add(enqueue)

      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { clearInterval(keepAlive) }
      }, 25000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        store.tunnelListeners.delete(enqueue)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
