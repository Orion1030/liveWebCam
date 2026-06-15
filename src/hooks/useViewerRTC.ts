'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export type ViewerStatus = 'idle' | 'connecting' | 'connected' | 'no-stream' | 'failed'

export function useViewerRTC() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const [status, setStatus] = useState<ViewerStatus>('idle')

  const cleanup = useCallback(() => {
    esRef.current?.close()
    pcRef.current?.close()
    esRef.current = null
    pcRef.current = null
  }, [])

  const connect = useCallback(async () => {
    cleanup()
    setStatus('connecting')

    const es = new EventSource('/api/signal/events?role=viewer')
    esRef.current = es

    let pc: RTCPeerConnection | null = null

    const handleOffer = async (offerData: RTCSessionDescriptionInit) => {
      if (pc) { pc.close() }

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      pc.ontrack = (e) => {
        if (videoRef.current) videoRef.current.srcObject = e.streams[0]
      }

      pc.onconnectionstatechange = () => {
        if (!pc) return
        const s = pc.connectionState
        if (s === 'connected') setStatus('connected')
        else if (s === 'failed') setStatus('failed')
      }

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return
        fetch('/api/signal/candidate?from=viewer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidate.toJSON()),
        }).catch(() => {})
      }

      await pc.setRemoteDescription(offerData)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await fetch('/api/signal/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: answer.type, sdp: answer.sdp }),
      })
    }

    // Initial offer may arrive as SSE event or we can also poll
    es.addEventListener('offer', async (e) => {
      await handleOffer(JSON.parse(e.data))
    })

    es.addEventListener('candidate', async (e) => {
      if (!pc) return
      try { await pc.addIceCandidate(JSON.parse(e.data)) } catch {}
    })

    es.addEventListener('stream-ended', () => {
      setStatus('no-stream')
    })

    // Check if offer already exists
    const res = await fetch('/api/signal/offer')
    if (res.ok) {
      const { offer } = await res.json()
      if (offer) await handleOffer(offer)
      else setStatus('no-stream')
    } else {
      setStatus('no-stream')
    }
  }, [cleanup])

  const disconnect = useCallback(() => {
    cleanup()
    setStatus('idle')
  }, [cleanup])

  useEffect(() => () => { cleanup() }, [cleanup])

  return { videoRef, status, connect, disconnect }
}
