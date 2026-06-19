"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Settings,
  Maximize2,
  Minimize2,
  CameraOff,
  Copy,
  Check,
} from "lucide-react";
import { useWebcam } from "@/hooks/useWebcam";
import { useSenderWS } from "@/hooks/useSenderWS";
import { useTunnel } from "@/hooks/useTunnel";
import SettingsPanel from "./SettingsPanel";
import LoginScreen from "./LoginScreen";

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return Date.now() / 1000 >= (payload.exp as number);
  } catch {
    return true;
  }
}

interface Props {
  initialPin: string;
  initialSessionId: string;
  pinFixed?: boolean;
}

export default function SenderApp({
  initialPin,
  initialSessionId,
  pinFixed = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    videoRef,
    streamRef,
    isActive,
    error,
    settings,
    devices,
    start,
    updateSettings,
  } = useWebcam();
  const {
    status: wsStatus,
    start: wsStart,
    stop: wsStop,
    updateConfig,
  } = useSenderWS();
  const { tunnel, startTunnel, stopTunnel } = useTunnel();

  const [authState, setAuthState] = useState<"loading" | "login" | "authed">(
    "loading",
  );
  const [token, setToken] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [pin, setPin] = useState(initialPin);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for a stored JWT on mount; start webcam only once authenticated
  useEffect(() => {
    const stored = localStorage.getItem("sender-jwt");
    if (stored && !isJwtExpired(stored)) {
      setToken(stored);
      setAuthState("authed");
    } else {
      setAuthState("login");
    }
  }, []);

  useEffect(() => {
    if (authState === "authed") start();
  }, [authState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Auto-hide controls in fullscreen
  const revealControls = useCallback(() => {
    setShowControls(true);
    if (!isFullscreen) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleGoLive = async () => {
    if (isLive) {
      wsStop();
      setIsLive(false);
    } else {
      if (streamRef.current) {
        await wsStart(streamRef.current, settings);
        setIsLive(true);
      }
    }
  };

  const handleSettingsChange = async (
    patch: Parameters<typeof updateSettings>[0],
  ) => {
    const newStream = await updateSettings(patch);
    if (newStream && isLive) {
      // Camera device or resolution changed — restart encoding with new stream
      await wsStart(newStream, { ...settings, ...patch });
    } else if (isLive) {
      // Quality or FPS only — reconfigure encoder in-place, no reconnect needed
      updateConfig({ ...settings, ...patch });
    }
  };

  const handleLogin = async (
    username: string,
    password: string,
  ): Promise<string | null> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return "Invalid username or password";
    const { token: t } = await res.json();
    localStorage.setItem("sender-jwt", t);
    setToken(t);
    setAuthState("authed");
    return null;
  };

  const handleRegeneratePin = async () => {
    if (pinFixed) return;
    const res = await fetch("/api/pin/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { pin: newPin, sessionId: newSessionId } = await res.json();
      setPin(newPin);
      setSessionId(newSessionId);
    }
  };

  const copyTunnelLink = () => {
    if (!tunnel.url) return;
    navigator.clipboard
      .writeText(`${tunnel.url}/view?s=${sessionId}`)
      .catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor: Record<typeof wsStatus, string> = {
    idle: "text-zinc-500",
    live: "text-green-400",
    error: "text-red-400",
  };

  const statusLabel: Record<typeof wsStatus, string> = {
    idle: "",
    live: "Streaming",
    error: "Stream error",
  };

  if (authState === "loading") return null;
  if (authState === "login") return <LoginScreen onLogin={handleLogin} />;

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen bg-black overflow-hidden select-none cursor-default"
      onMouseMove={revealControls}
    >
      {/* Video feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />

      {/* No camera state */}
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CameraOff size={48} className="text-zinc-700 mb-4" />
          <p className="text-zinc-500 text-sm mb-1">{error ?? "No camera"}</p>
          <button
            onClick={() => start()}
            className="mt-3 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 px-4 pt-4 pb-10 bg-gradient-to-b from-black/80 to-transparent flex items-start justify-between pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-white/90 text-sm font-bold tracking-wide">
              CAM STREAM
            </span>
            {isLive && (
              <span className="flex items-center gap-1.5 bg-red-600 px-2 py-0.5 rounded text-white text-xs font-bold">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                LIVE
              </span>
            )}
            {isLive && wsStatus !== "idle" && (
              <span className={`text-xs ${statusColor[wsStatus]}`}>
                {statusLabel[wsStatus]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings size={20} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pt-10 pb-4 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between pointer-events-auto">
          {/* Left: settings summary */}
          <div className="text-xs text-white/50 space-y-0.5">
            <div>
              {settings.resolution} · {settings.fps}fps · {settings.quality}
            </div>
            {tunnel.url && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                <span className="font-mono text-white/40 text-[10px]">
                  {tunnel.url.replace("https://", "")}
                </span>
                <button
                  onClick={copyTunnelLink}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                </button>
              </div>
            )}
          </div>

          {/* Right: go live button */}
          <button
            onClick={handleGoLive}
            disabled={!isActive}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              isLive
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {isLive ? "Stop Stream" : "Go Live"}
          </button>
        </div>
      </div>

      {/* Settings drawer */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        devices={devices}
        pin={pin}
        sessionId={sessionId}
        pinFixed={pinFixed}
        onRegeneratePin={handleRegeneratePin}
        tunnel={tunnel}
        onStartTunnel={startTunnel}
        onStopTunnel={stopTunnel}
      />
    </div>
  );
}
