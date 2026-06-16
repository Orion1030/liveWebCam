// ICE server configuration.
// Locally (no env vars): uses Google STUN only — works for LAN / same-machine.
// Remotely: set NEXT_PUBLIC_TURN_* in .env.local pointing at your coturn instance.
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  const host = process.env.NEXT_PUBLIC_TURN_HOST   // e.g.  myname.duckdns.org
  const port = process.env.NEXT_PUBLIC_TURN_PORT ?? '3478'
  const user = process.env.NEXT_PUBLIC_TURN_USER
  const pass = process.env.NEXT_PUBLIC_TURN_PASS

  if (host && user && pass) {
    servers.push(
      // coturn also acts as STUN
      { urls: `stun:${host}:${port}` },
      // TURN over UDP — preferred, lower overhead
      { urls: `turn:${host}:${port}`, username: user, credential: pass },
      // TURN over TCP — fallback when UDP is blocked
      { urls: `turn:${host}:${port}?transport=tcp`, username: user, credential: pass },
    )
  }

  return servers
}
