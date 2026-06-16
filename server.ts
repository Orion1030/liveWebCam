import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { WebSocketServer, WebSocket } from 'ws'

const dev  = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

async function main() {
  const app    = next({ dev, hostname: 'localhost', port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url!, true))
  })

  // ── WebSocket relay ─────────────────────────────────────────────────────────
  // Dumb pipe: every binary frame the sender pushes is forwarded immediately to
  // all connected viewers — no buffering, no processing.
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  let senderSocket: WebSocket | null = null
  const viewers = new Set<WebSocket>()

  wss.on('connection', (ws, req) => {
    const role = new URLSearchParams(req.url?.split('?')[1] ?? '').get('role')

    if (role === 'sender') {
      senderSocket?.terminate()
      senderSocket = ws

      ws.on('message', (data, isBinary) => {
        for (const viewer of viewers) {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(data, { binary: isBinary })
          }
        }
      })

      ws.on('close', () => {
        if (senderSocket === ws) {
          senderSocket = null
          const end = JSON.stringify({ t: 'end' })
          for (const viewer of viewers) {
            if (viewer.readyState === WebSocket.OPEN) viewer.send(end)
          }
        }
      })

      ws.on('error', () => {})

    } else {
      viewers.add(ws)
      ws.on('close', () => viewers.delete(ws))
      ws.on('error', () => {})
    }
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
