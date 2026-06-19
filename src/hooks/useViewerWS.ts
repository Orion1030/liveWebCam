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

// Reverses serializeDecoderConfig on the sender side — converts the base64
// description string back to a Uint8Array (H.264 SPS/PPS AVCC extradata).
// VP8 configs have no description so this is a no-op for them.
type WireConfig = Omit<VideoDecoderConfig, 'description'> & { description?: string }
function toDecoderConfig(wire: WireConfig): VideoDecoderConfig {
  if (!wire.description) return wire as VideoDecoderConfig
  const bin = atob(wire.description)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { ...wire, description: bytes }
}

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
      retryRef.current = setTimeout(() => connect(), 2000)
    }

    // Shared output handler — draw the decoded frame then always release it.
    // drawImage is wrapped so a detached canvas never throws.
    const onFrame = (frame: VideoFrame) => {
      try {
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx) ctx.drawImage(frame, 0, 0)
      } catch {}
      try { frame.close() } catch {}
    }

    // Shared decoder error handler — hold the last canvas frame and wait for
    // the next keyframe so the decoder can be rebuilt from a clean state.
    const onDecoderError = (e: Error) => {
      console.warn('[Viewer] VideoDecoder error, waiting for keyframe resync', e)
      needsResyncRef.current = true
      try { decoderRef.current?.close() } catch {}
      decoderRef.current = null
    }

    // Creates and configures a VideoDecoder, returning null if anything throws
    // so callers never have to guard against partial construction.
    const makeDecoder = (cfg: VideoDecoderConfig): VideoDecoder | null => {
      let d: VideoDecoder | undefined
      try {
        d = new VideoDecoder({ output: onFrame, error: onDecoderError })
        d.configure(cfg)
        return d
      } catch (e) {
        console.warn('[Viewer] VideoDecoder init/configure failed, holding last frame', e)
        try { d?.close() } catch {}
        return null
      }
    }

    ws.onmessage = (event) => {
      if (!activeRef.current) return

      if (typeof event.data === 'string') {
        // ── Control message ──────────────────────────────────────────────────
        let msg: { t: string; c?: WireConfig; w?: number; h?: number }
        try {
          msg = JSON.parse(event.data as string)
        } catch {
          return // ignore malformed JSON
        }

        if (msg.t === 'config' && msg.c) {
          // Deserialize the decoder config (converts base64 description → Uint8Array)
          let cfg: VideoDecoderConfig
          try {
            cfg = toDecoderConfig(msg.c)
          } catch {
            return // corrupted config — canvas holds last frame
          }

          try { decoderRef.current?.close() } catch {}
          needsResyncRef.current = false

          const canvas = canvasRef.current
          if (!canvas) return

          const w = msg.w ?? 1280
          const h = msg.h ?? 720
          canvas.width  = w
          canvas.height = h
          lastConfigRef.current = { c: cfg, w, h }

          const d = makeDecoder(cfg)
          decoderRef.current = d
          if (d) setStatus('playing')
          // If makeDecoder failed the canvas holds the last good frame; we'll
          // retry on the next config message the sender emits.

        } else if (msg.t === 'end') {
          setStatus('waiting')
        }

      } else {
        // ── Binary frame: [4 magic][1 isKey][...codec data] ─────────────────
        const bytes = new Uint8Array(event.data as ArrayBuffer)

        // Validate magic — drop anything that doesn't match (stray data, etc.)
        if (
          bytes.length < HEADER ||
          bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] ||
          bytes[2] !== MAGIC[2] || bytes[3] !== MAGIC[3]
        ) {
          console.warn('[Viewer] Dropped frame: invalid magic header', bytes.slice(0, 5))
          return
        }

        const isKey = bytes[4] === 1

        // After any decoder failure, skip deltas and wait for a keyframe so
        // we can rebuild the decoder from a clean reference point.
        if (needsResyncRef.current) {
          if (!isKey) return
          const cfg = lastConfigRef.current
          if (!cfg) return
          const canvas = canvasRef.current
          if (!canvas) return
          canvas.width  = cfg.w
          canvas.height = cfg.h

          const fresh = makeDecoder(cfg.c)
          if (!fresh) return // failed again — canvas holds last frame, retry on next keyframe
          decoderRef.current = fresh
          needsResyncRef.current = false
        }

        const decoder = decoderRef.current
        if (!decoder || decoder.state !== 'configured') return

        // Mild backpressure relief — drop deltas only when the queue is backed up
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
          // canvas holds last frame — next keyframe will rebuild the decoder
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
