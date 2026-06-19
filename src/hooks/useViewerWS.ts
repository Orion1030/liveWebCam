'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

export type ViewerWSStatus = 'idle' | 'connecting' | 'waiting' | 'playing' | 'error'

function wsUrl(role: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws?role=${role}`
}

// Must match MAGIC in useSenderWS.ts
const MAGIC = new Uint8Array([0xC0, 0xFF, 0xEE, 0x01])
const HEADER = 5 // 4 magic + 1 type byte

export function useViewerWS() {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const wsRef          = useRef<WebSocket | null>(null)
  const decoderRef     = useRef<VideoDecoder | null>(null)
  const lastConfigRef  = useRef<{ c: VideoDecoderConfig; w: number; h: number } | null>(null)
  const needsResyncRef = useRef(false) // true after a decoder error — wait for next keyframe
  const [status, setStatus] = useState<ViewerWSStatus>('idle')
  const activeRef      = useRef(false)
  const retryRef       = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    ws.onerror = (e) => { console.error('[Viewer] WebSocket error', e); if (activeRef.current) setStatus('error') }

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
          try { decoderRef.current?.close() } catch {}
          needsResyncRef.current = false

          const canvas = canvasRef.current
          if (!canvas) return

          const w = msg.w ?? 1280
          const h = msg.h ?? 720
          canvas.width  = w
          canvas.height = h
          lastConfigRef.current = { c: msg.c, w, h }

          const decoder = new VideoDecoder({
            output: (frame) => {
              const ctx = canvasRef.current?.getContext('2d')
              if (ctx) ctx.drawImage(frame, 0, 0)
              frame.close()
            },
            // On decoder error: don't crash the status — hold the last canvas frame
            // and wait for the next keyframe to rebuild decoder state cleanly.
            error: (e) => {
              console.warn('[Viewer] VideoDecoder error, waiting for keyframe resync', e)
              needsResyncRef.current = true
              try { decoderRef.current?.close() } catch {}
              decoderRef.current = null
            },
          })
          decoder.configure(msg.c)
          decoderRef.current = decoder
          setStatus('playing')

        } else if (msg.t === 'end') {
          setStatus('waiting')
        }

      } else {
        // Binary frame: [4 magic bytes][1 byte: isKeyFrame][...VP8 data]
        const bytes = new Uint8Array(event.data as ArrayBuffer)

        // Validate magic header — silently drop anything that doesn't match.
        // Catches misaligned WebSocket frames, partial sends, or stray data.
        if (
          bytes.length < HEADER ||
          bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] ||
          bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]
        ) {
          console.warn('[Viewer] Dropped frame: invalid magic header', bytes.slice(0, 5))
          return
        }

        const isKey = bytes[4] === 1

        // After a decoder error, hold the last good canvas frame and wait for
        // the next keyframe to rebuild decoder state from a clean reference.
        if (needsResyncRef.current) {
          if (!isKey) return
          const cfg = lastConfigRef.current
          if (!cfg) return
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.width  = cfg.w
          canvas.height = cfg.h
          const fresh = new VideoDecoder({
            output: (frame) => {
              const ctx = canvasRef.current?.getContext('2d')
              if (ctx) ctx.drawImage(frame, 0, 0)
              frame.close()
            },
            error: (e) => {
              console.warn('[Viewer] VideoDecoder error during resync, retrying', e)
              needsResyncRef.current = true
              try { decoderRef.current?.close() } catch {}
              decoderRef.current = null
            },
          })
          fresh.configure(cfg.c)
          decoderRef.current = fresh
          needsResyncRef.current = false
        }

        const decoder = decoderRef.current
        if (!decoder || decoder.state !== 'configured') return

        if (!isKey && decoder.decodeQueueSize > 2) return

        try {
          decoder.decode(new EncodedVideoChunk({
            type: isKey ? 'key' : 'delta',
            timestamp: performance.now() * 1000,
            data: bytes.subarray(HEADER),
          }))
        } catch (e) {
          console.warn('[Viewer] decoder.decode() threw, triggering resync', e)
          needsResyncRef.current = true
          try { decoderRef.current?.close() } catch {}
          decoderRef.current = null
        }
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
