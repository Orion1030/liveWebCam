'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

export type ViewerWSStatus = 'idle' | 'connecting' | 'waiting' | 'playing' | 'error'

function wsUrl(role: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws?role=${role}`
}

export function useViewerWS() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const wsRef       = useRef<WebSocket | null>(null)
  const decoderRef  = useRef<VideoDecoder | null>(null)
  const [status, setStatus] = useState<ViewerWSStatus>('idle')
  const activeRef   = useRef(false)
  const retryRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanup = useCallback(() => {
    activeRef.current = false
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
    wsRef.current?.close()
    wsRef.current = null
    try { decoderRef.current?.close() } catch {}
    decoderRef.current = null
  }, [])

  const connect = useCallback(() => {
    cleanup()
    activeRef.current = true
    setStatus('connecting')

    const ws = new WebSocket(wsUrl('viewer'))
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen  = () => { if (activeRef.current) setStatus('waiting') }
    ws.onerror = () => { if (activeRef.current) setStatus('error') }

    ws.onclose = () => {
      if (!activeRef.current) return
      setStatus('waiting')
      // Auto-reconnect — sender may not be live yet
      retryRef.current = setTimeout(() => connect(), 2000)
    }

    ws.onmessage = (event) => {
      if (!activeRef.current) return

      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data as string) as { t: string; c?: VideoDecoderConfig; w?: number; h?: number }

        if (msg.t === 'config' && msg.c) {
          // Sender started — initialise decoder with the exact codec the sender used
          try { decoderRef.current?.close() } catch {}

          const canvas = canvasRef.current
          if (!canvas) return

          canvas.width  = msg.w ?? 1280
          canvas.height = msg.h ?? 720

          const decoder = new VideoDecoder({
            output: (frame) => {
              // Draw directly to canvas — zero buffering, frame is displayed
              // the moment it is decoded, which is the moment it arrived.
              const ctx = canvasRef.current?.getContext('2d')
              if (ctx) ctx.drawImage(frame, 0, 0)
              frame.close()
            },
            error: () => { if (activeRef.current) setStatus('error') },
          })
          decoder.configure(msg.c)
          decoderRef.current = decoder
          setStatus('playing')

        } else if (msg.t === 'end') {
          setStatus('waiting')
        }

      } else {
        // Binary frame: [1 byte: isKeyFrame][...VP8 data]
        const decoder = decoderRef.current
        if (!decoder || decoder.state !== 'configured') return

        const bytes = new Uint8Array(event.data as ArrayBuffer)
        try {
          decoder.decode(new EncodedVideoChunk({
            type: bytes[0] === 1 ? 'key' : 'delta',
            // Monotonically increasing timestamp required by WebCodecs.
            // performance.now() in microseconds is safe here.
            timestamp: performance.now() * 1000,
            data: bytes.subarray(1),
          }))
        } catch {}
      }
    }
  }, [cleanup])

  const disconnect = useCallback(() => {
    cleanup()
    setStatus('idle')
  }, [cleanup])

  useEffect(() => () => { cleanup() }, [cleanup])

  return { canvasRef, status, connect, disconnect }
}
