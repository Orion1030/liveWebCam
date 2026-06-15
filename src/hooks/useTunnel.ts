'use client'

import { useState, useEffect } from 'react'
import type { TunnelState } from '@/lib/store'

export function useTunnel() {
  const [tunnel, setTunnel] = useState<TunnelState>({ url: null, status: 'idle', error: null })

  useEffect(() => {
    const es = new EventSource('/api/tunnel/events')
    es.addEventListener('update', (e) => setTunnel(JSON.parse(e.data)))
    return () => es.close()
  }, [])

  const startTunnel = async () => {
    const res = await fetch('/api/tunnel/start', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json()
      setTunnel(t => ({ ...t, status: 'error', error: body.error ?? 'Failed to start' }))
    }
  }

  const stopTunnel = () => fetch('/api/tunnel/stop', { method: 'POST' }).catch(() => {})

  return { tunnel, startTunnel, stopTunnel }
}
