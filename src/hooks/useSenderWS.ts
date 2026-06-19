'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { type StreamSettings, QUALITY_BITRATES } from './useWebcam'

export type SenderWSStatus = 'idle' | 'live' | 'error'

// Frame header: 4 magic bytes + 1 type byte.
// Viewer validates the magic before touching the payload — any noise or partial
// frame gets silently dropped before it can confuse the decoder.
// Layout: [0xC0, 0xFF, 0xEE, 0x01, isKey, ...VP8 bytes]
const MAGIC = new Uint8Array([0xC0, 0xFF, 0xEE, 0x01])
const HEADER = 5 // 4 magic + 1 type

function wsUrl(role: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws?role=${role}`
}

export function useSenderWS() {
  const wsRef       = useRef<WebSocket | null>(null)
  const encoderRef  = useRef<VideoEncoder | null>(null)
  const readerRef   = useRef<ReadableStreamDefaultReader<VideoFrame> | null>(null)
  const dimsRef     = useRef({ width: 1280, height: 720 })
  const frameRef    = useRef(0)
  const droppedRef  = useRef(false) // true when a frame was dropped → next encode must be keyframe
  const [status, setStatus] = useState<SenderWSStatus>('idle')

  const stop = useCallback(() => {
    readerRef.current?.cancel().catch(() => {})
    readerRef.current = null
    try { encoderRef.current?.close() } catch {}
    encoderRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    frameRef.current = 0
    setStatus('idle')
  }, [])

  const start = useCallback(async (stream: MediaStream, settings: StreamSettings) => {
    stop()

    // Open WebSocket and wait for connection
    const ws = new WebSocket(wsUrl('sender'))
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    try {
      await new Promise<void>((resolve, reject) => {
        ws.onopen  = () => resolve()
        ws.onerror = (e) => { console.error('[Sender] WebSocket connection error', e); reject(new Error('ws-connect-failed')) }
        setTimeout(()  => reject(new Error('ws-timeout')), 5000)
      })
    } catch (e) {
      console.error('[Sender] Failed to connect WebSocket', e)
      setStatus('error')
      return
    }

    const track = stream.getVideoTracks()[0]
    if (!track) { setStatus('error'); return }

    const { width = 1280, height = 720 } = track.getSettings()
    dimsRef.current = { width, height }

    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (ws.readyState !== WebSocket.OPEN) return
        // Never drop here — dropping in the output callback after encoding would
        // send later deltas that reference this unsent chunk, causing VP8 corruption.
        // All dropping is done in the pump (before encoding) so droppedRef is always set.
        if (meta?.decoderConfig) {
          ws.send(JSON.stringify({ t: 'config', c: meta.decoderConfig, w: width, h: height }))
        }
        const payload = new Uint8Array(HEADER + chunk.byteLength)
        payload.set(MAGIC, 0)
        payload[4] = chunk.type === 'key' ? 1 : 0
        chunk.copyTo(payload.subarray(HEADER))
        ws.send(payload)
      },
      error: (e) => { console.error('[Sender] VideoEncoder error', e); setStatus('error') },
    })

    encoder.configure({
      codec: 'vp8',
      width,
      height,
      bitrate: QUALITY_BITRATES[settings.quality],
      framerate: settings.fps,
      latencyMode: 'realtime',   // encode immediately, no look-ahead buffering
    })

    encoderRef.current = encoder
    frameRef.current   = 0

    // MediaStreamTrackProcessor gives us VideoFrame objects straight from the
    // camera with no timeslice delay — each frame is available as soon as the
    // browser captures it from the device.
    const processor = new MediaStreamTrackProcessor({ track })
    const reader = processor.readable.getReader()
    readerRef.current = reader

    setStatus('live')

    ;(async () => {
      try {
        while (true) {
          const { done, value: frame } = await reader.read()
          if (done) break

          // encodeQueueSize > 0 means the encoder is still processing previous
          // frames — we are faster than the encoder. Drop this frame rather than
          // letting frames stack up and grow latency. Keyframes are never dropped
          // so late-joining viewers can always start decoding.
          const scheduledKey = frameRef.current % (settings.fps * 2) === 0
          const keyFrame = scheduledKey || droppedRef.current

          // Drop before encoding (not after) so we never send a delta that
          // references a frame the viewer hasn't seen. Two conditions both drop:
          //  1. encoder is backed up → encoding too slow for the frame rate
          //  2. TCP send buffer is backed up → network too slow for the bitrate
          // Keyframes are never dropped — they carry no reference and let the
          // viewer resync after any gap.
          const backpressure = encoder.encodeQueueSize > 0 || ws.bufferedAmount > 256 * 1024
          if (!keyFrame && backpressure) {
            console.warn(`[Sender] Dropped delta frame #${frameRef.current} — encodeQueue=${encoder.encodeQueueSize} buffered=${ws.bufferedAmount}`)
            frame.close()
            frameRef.current++
            droppedRef.current = true
            continue
          }
          if (keyFrame) droppedRef.current = false

          encoder.encode(frame, { keyFrame })
          frame.close()
          frameRef.current++
        }
      } catch (e) {
        console.error('[Sender] Frame pump error', e)
      }
    })()
  }, [stop])

  // Hot-swap quality/fps without restarting the stream.
  // VideoEncoder.configure() is valid while encoding is in progress.
  const updateConfig = useCallback((settings: StreamSettings) => {
    const encoder = encoderRef.current
    if (!encoder) return
    const { width, height } = dimsRef.current
    encoder.configure({
      codec: 'vp8',
      width,
      height,
      bitrate: QUALITY_BITRATES[settings.quality],
      framerate: settings.fps,
      latencyMode: 'realtime',
    })
  }, [])

  useEffect(() => () => { stop() }, [stop])

  return { status, start, stop, updateConfig }
}
