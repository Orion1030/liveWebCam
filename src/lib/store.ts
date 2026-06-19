export interface SessionDesc {
  type: string
  sdp: string
}

export interface IceCandidateData {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
  usernameFragment?: string | null
}

export interface TunnelState {
  url: string | null
  status: 'idle' | 'starting' | 'running' | 'error'
  error: string | null
}

type Listener = (event: string, data: unknown) => void

interface AppStore {
  pin: string
  offer: SessionDesc | null
  answer: SessionDesc | null
  senderCandidates: IceCandidateData[]
  viewerCandidates: IceCandidateData[]
  senderListeners: Set<Listener>
  viewerListeners: Set<Listener>
  tunnel: TunnelState
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tunnelProcess: any | null
  tunnelListeners: Set<Listener>
}

declare global {
  // eslint-disable-next-line no-var
  var __appStore: AppStore | undefined
}

if (!global.__appStore) {
  global.__appStore = {
    // If STREAM_PIN is set (required on Vercel/serverless where global state is
    // not shared between invocations), use it. Otherwise generate a random PIN
    // for the local custom-server mode.
    pin: process.env.STREAM_PIN ?? Math.floor(100000 + Math.random() * 900000).toString(),
    offer: null,
    answer: null,
    senderCandidates: [],
    viewerCandidates: [],
    senderListeners: new Set(),
    viewerListeners: new Set(),
    tunnel: { url: null, status: 'idle', error: null },
    tunnelProcess: null,
    tunnelListeners: new Set(),
  }
}

const store = global.__appStore

export function broadcast(listeners: Set<Listener>, event: string, data: unknown) {
  listeners.forEach(fn => { try { fn(event, data) } catch {} })
}

export function resetSignaling() {
  store.offer = null
  store.answer = null
  store.senderCandidates = []
  store.viewerCandidates = []
}

export default store
