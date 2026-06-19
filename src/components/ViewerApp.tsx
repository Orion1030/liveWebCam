"use client";

import { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import { useViewerWS } from "@/hooks/useViewerWS";

export default function ViewerApp({ sessionId }: { sessionId: string }) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { canvasRef, status, connect } = useViewerWS();

  useEffect(() => {
    if (isAuthenticated) connect();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const revealControls = () => {
    setShowControls(true);
    if (!isFullscreen) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    const res = await fetch("/api/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, sessionId }),
    });
    const { valid } = await res.json();
    if (valid) {
      setIsAuthenticated(true);
    } else {
      setAuthError("Incorrect passcode. Please try again.");
      setPin("");
    }
  };

  if (!isAuthenticated) {
    // Guard: session ID must be in the URL — direct visits to /view won't work
    if (!sessionId) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="text-center">
            <WifiOff size={40} className="text-red-700 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-zinc-100 mb-2">
              Invalid session link
            </h1>
            <p className="text-sm text-zinc-500">
              Ask the streamer to share the viewer link again.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wifi size={22} className="text-blue-400" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-100">Join Stream</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Enter the passcode provided by the streamer
            </p>
            <p className="text-xs text-zinc-700 mt-1 font-mono">
              Session ID: {sessionId}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-blue-500 focus:outline-none rounded-lg px-4 py-3 text-zinc-100 font-mono text-2xl tracking-[0.5em] text-center placeholder:text-zinc-700 placeholder:tracking-[0.3em] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {authError && (
              <p className="text-sm text-red-400 text-center">{authError}</p>
            )}

            <button
              type="submit"
              disabled={pin.length !== 6}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Watch Stream
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen bg-black overflow-hidden select-none"
      onMouseMove={revealControls}
    >
      {/*
        Canvas is sized by the decoder to the sender's actual video resolution.
        CSS centers it and scales it down to fit the viewport while maintaining
        aspect ratio — same visual behaviour as <video object-contain>.
      */}
      <div className="w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
      </div>

      {(status === "connecting" || status === "waiting") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <Loader2 size={36} className="text-blue-400 animate-spin mb-3" />
          <p className="text-zinc-400 text-sm">
            {status === "waiting"
              ? "Waiting for stream to start…"
              : "Connecting…"}
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <WifiOff size={40} className="text-red-700 mb-3" />
          <p className="text-zinc-500 text-sm">Connection failed</p>
          <button
            onClick={() => connect()}
            className="mt-4 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}

      <div
        className={`absolute top-4 right-4 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
      >
        <div className="flex items-center gap-1">
          {status === "playing" && (
            <span className="flex items-center gap-1.5 text-[11px] text-green-400 bg-black/50 px-2 py-1 rounded-md mr-2">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
