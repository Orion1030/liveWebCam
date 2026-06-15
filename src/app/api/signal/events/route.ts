import { NextRequest } from 'next/server'
import store from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get('role') as 'sender' | 'viewer'
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

      // Flush queued candidates to a new viewer
      if (role === 'viewer') {
        if (store.offer) enqueue('offer', store.offer)
        store.senderCandidates.forEach(c => enqueue('candidate', c))
      }

      const listeners = role === 'sender' ? store.senderListeners : store.viewerListeners
      listeners.add(enqueue)

      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { clearInterval(keepAlive) }
      }, 25000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        listeners.delete(enqueue)
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
