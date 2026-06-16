'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { QUALITY_BITRATES, type Quality } from './useWebcam'
import { getIceServers } from '@/lib/ice'

export type RTCStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

export function useSenderRTC() {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const [status, setStatus] = useState<RTCStatus>('idle')

  const cleanup = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
    pcRef.current?.close()
    pcRef.current = null
  }, [])

  const startStreaming = useCallback(async (stream: MediaStream) => {
    cleanup()
    setStatus('connecting')

    const pc = new RTCPeerConnection({ iceServers: getIceServers() })
    pcRef.current = pc

    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') setStatus('connected')
      else if (s === 'disconnected' || s === 'failed') setStatus('disconnected')
    }

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      fetch('/api/signal/candidate?from=sender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate.toJSON()),
      }).catch(() => {})
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    await fetch('/api/signal/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: offer.type, sdp: offer.sdp }),
    })

    const es = new EventSource('/api/signal/events?role=sender')
    esRef.current = es

    es.addEventListener('answer', async (e) => {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(JSON.parse(e.data))
      }
    })

    es.addEventListener('candidate', async (e) => {
      try { await pc.addIceCandidate(JSON.parse(e.data)) } catch {}
    })
  }, [cleanup])

  const stopStreaming = useCallback(async () => {
    cleanup()
    setStatus('idle')
    await fetch('/api/signal/offer', { method: 'DELETE' }).catch(() => {})
  }, [cleanup])

  const replaceStream = useCallback(async (stream: MediaStream) => {
    if (!pcRef.current) return
    const senders = pcRef.current.getSenders()
    for (const track of stream.getTracks()) {
      const sender = senders.find(s => s.track?.kind === track.kind)
      if (sender) await sender.replaceTrack(track)
    }
  }, [])

  const setQuality = useCallback(async (quality: Quality) => {
    if (!pcRef.current) return
    const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
    if (!sender) return
    const params = sender.getParameters()
    if (!params.encodings.length) params.encodings = [{}]
    params.encodings[0].maxBitrate = QUALITY_BITRATES[quality]
    await sender.setParameters(params)
  }, [])

  useEffect(() => () => { cleanup() }, [cleanup])

  return { status, startStreaming, stopStreaming, replaceStream, setQuality }
}
