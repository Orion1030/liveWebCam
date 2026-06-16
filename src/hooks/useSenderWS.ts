'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { type StreamSettings, QUALITY_BITRATES } from './useWebcam'

export type SenderWSStatus = 'idle' | 'live' | 'error'

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
        ws.onerror = () => reject(new Error('ws-connect-failed'))
        setTimeout(()  => reject(new Error('ws-timeout')), 5000)
      })
    } catch {
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

        // First keyframe carries the decoder config — send it as JSON so the
        // viewer can initialise VideoDecoder with the exact codec parameters.
        if (meta?.decoderConfig) {
          ws.send(JSON.stringify({ t: 'config', c: meta.decoderConfig, w: width, h: height }))
        }

        // Binary frame layout: [1 byte: 1=keyframe / 0=delta][...VP8 bytes]
        const payload = new Uint8Array(1 + chunk.byteLength)
        payload[0] = chunk.type === 'key' ? 1 : 0
        chunk.copyTo(payload.subarray(1))
        ws.send(payload)
      },
      error: () => setStatus('error'),
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
          // Force a keyframe every 2 s so late-joining viewers can start quickly
          const keyFrame = frameRef.current % (settings.fps * 2) === 0
          encoder.encode(frame, { keyFrame })
          frame.close()
          frameRef.current++
        }
      } catch {}
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
