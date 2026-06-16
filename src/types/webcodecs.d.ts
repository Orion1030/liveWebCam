// MediaStreamTrackProcessor is part of the WebCodecs API (Chrome 94+) but is
// not yet included in TypeScript's bundled DOM lib as of TS 5.9.
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number })
  readonly readable: ReadableStream<VideoFrame>
}
