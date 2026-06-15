'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export type Quality = 'ultra' | 'high' | 'medium' | 'low'

export interface StreamSettings {
  resolution: string
  fps: number
  quality: Quality
  deviceId: string | undefined
}

const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  '360p': { width: 640, height: 360 },
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4K': { width: 3840, height: 2160 },
}

export const QUALITY_BITRATES: Record<Quality, number> = {
  ultra: 8_000_000,
  high: 4_000_000,
  medium: 2_000_000,
  low: 500_000,
}

const DEFAULT_SETTINGS: StreamSettings = {
  resolution: '720p',
  fps: 30,
  quality: 'high',
  deviceId: undefined,
}

async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all.filter(d => d.kind === 'videoinput')
}

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<StreamSettings>(DEFAULT_SETTINGS)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  const refreshDevices = useCallback(async () => {
    try {
      const list = await listVideoDevices()
      setDevices(list)
      // Auto-select first device if none chosen yet
      setSettings(prev => ({
        ...prev,
        deviceId: prev.deviceId ?? list[0]?.deviceId,
      }))
    } catch {}
  }, [])

  // Enumerate on mount and on device plug/unplug
  useEffect(() => {
    refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const applyStream = useCallback((stream: MediaStream) => {
    streamRef.current = stream
    if (videoRef.current) videoRef.current.srcObject = stream
    setIsActive(true)
    setError(null)
  }, [])

  const start = useCallback(async (override?: Partial<StreamSettings>): Promise<MediaStream | null> => {
    const cfg = override ? { ...settings, ...override } : settings
    streamRef.current?.getTracks().forEach(t => t.stop())

    try {
      const res = RESOLUTIONS[cfg.resolution]
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cfg.deviceId ? { deviceId: { exact: cfg.deviceId } } : {}),
          width: { ideal: res.width },
          height: { ideal: res.height },
          frameRate: { ideal: cfg.fps },
        },
        audio: false,
      })
      applyStream(stream)
      // Re-enumerate after permission grant so labels populate
      await refreshDevices()
      return stream
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access camera')
      setIsActive(false)
      return null
    }
  }, [settings, applyStream, refreshDevices])

  const updateSettings = useCallback(async (patch: Partial<StreamSettings>): Promise<MediaStream | null> => {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (isActive) return start(next)
    return null
  }, [settings, isActive, start])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsActive(false)
  }, [])

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  return { videoRef, streamRef, isActive, error, settings, devices, start, stop, updateSettings }
}
