"use client";

import { useState } from "react";
import { X, RefreshCw, Copy, Zap, Settings, Link2, Check } from "lucide-react";
import type { StreamSettings, Quality, VideoCodec } from "@/hooks/useWebcam";
import type { TunnelState } from "@/lib/store";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: StreamSettings;
  onSettingsChange: (patch: Partial<StreamSettings>) => void;
  devices: MediaDeviceInfo[];
  pin: string;
  sessionId: string;
  sessionToken: string;
  pinFixed?: boolean;
  onRegeneratePin: () => void;
  tunnel: TunnelState;
  onStartTunnel: () => void;
  onStopTunnel: () => void;
}

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function OptionRow({
  values,
  active,
  onSelect,
  cols = 3,
}: {
  values: { label: string; sub?: string; value: string | number }[];
  active: string | number;
  onSelect: (v: string | number) => void;
  cols?: number;
}) {
  return (
    <div
      className={`grid gap-1.5`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {values.map((v) => (
        <button
          key={v.value}
          onClick={() => onSelect(v.value)}
          className={`py-2 px-1 rounded-md text-xs font-medium transition-colors text-center ${
            active === v.value
              ? "bg-blue-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          }`}
        >
          {v.label}
          {v.sub && (
            <span
              className={`block text-[10px] mt-0.5 ${active === v.value ? "text-blue-200" : "text-zinc-600"}`}
            >
              {v.sub}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  devices,
  pin,
  sessionId,
  sessionToken,
  pinFixed = false,
  onRegeneratePin,
  tunnel,
  onStartTunnel,
  onStopTunnel,
}: Props) {
  const [linkCopied, setLinkCopied] = useState(false);

  const copySessionLink = () => {
    copy(`${window.location.origin}/view?s=${sessionId}&t=${sessionToken}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };
  const copyTunnelSessionLink = () => {
    copy(`${tunnel.url}/view?s=${sessionId}&t=${sessionToken}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-72 bg-zinc-950 border-l border-zinc-800 flex flex-col transform transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 text-zinc-300">
            <Settings size={14} />
            <span className="text-sm font-semibold">Stream Settings</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Video Source */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Video Source
            </label>
            {devices.length === 0 ? (
              <p className="text-[11px] text-zinc-600">
                No cameras detected — grant permission first
              </p>
            ) : (
              <select
                value={settings.deviceId ?? ""}
                onChange={(e) =>
                  onSettingsChange({ deviceId: e.target.value || undefined })
                }
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </section>

          <div className="border-t border-zinc-800" />

          {/* Resolution */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Resolution
            </label>
            <OptionRow
              cols={3}
              active={settings.resolution}
              onSelect={(v) => onSettingsChange({ resolution: v as string })}
              values={[
                { label: "360p", value: "360p" },
                { label: "480p", value: "480p" },
                { label: "720p", value: "720p" },
                { label: "1080p", value: "1080p" },
                { label: "4K", value: "4K" },
              ]}
            />
          </section>

          {/* FPS */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Frame Rate
            </label>
            <OptionRow
              cols={5}
              active={settings.fps}
              onSelect={(v) => onSettingsChange({ fps: v as number })}
              values={[
                { label: "5", value: 5 },
                { label: "10", value: 10 },
                { label: "15", value: 15 },
                { label: "24", value: 24 },
                { label: "30", value: 30 },
              ]}
            />
          </section>

          {/* Quality */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Stream Quality
            </label>
            <OptionRow
              cols={2}
              active={settings.quality}
              onSelect={(v) => onSettingsChange({ quality: v as Quality })}
              values={[
                { label: "Ultra", sub: "8 Mbps", value: "ultra" },
                { label: "High", sub: "4 Mbps", value: "high" },
                { label: "Medium", sub: "2 Mbps", value: "medium" },
                { label: "Low", sub: "500 Kbps", value: "low" },
              ]}
            />
          </section>

          {/* Codec */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Codec
            </label>
            <OptionRow
              cols={2}
              active={settings.codec}
              onSelect={(v) => onSettingsChange({ codec: v as VideoCodec })}
              values={[
                { label: "VP8", sub: "Universal", value: "vp8" },
                { label: "H.264", sub: "Hardware", value: "h264" },
              ]}
            />
          </section>

          {/* Frame mode */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Frame Mode
            </label>
            <OptionRow
              cols={2}
              active={settings.keyframeOnly ? "full" : "delta"}
              onSelect={(v) => onSettingsChange({ keyframeOnly: v === "full" })}
              values={[
                { label: "Delta", sub: "Efficient", value: "delta" },
                { label: "Full", sub: "Resilient", value: "full" },
              ]}
            />
          </section>

          <div className="border-t border-zinc-800" />

          {/* Session ID + Passcode */}
          <section className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Session ID
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 font-mono text-sm text-zinc-300 text-center select-all tracking-widest">
                  {sessionId}
                </div>
                <button
                  onClick={copySessionLink}
                  title="Copy session link"
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
                >
                  {linkCopied ? (
                    <Check size={14} className="text-green-400" />
                  ) : (
                    <Link2 size={14} />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Passcode
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 font-mono text-xl tracking-[0.4em] text-zinc-100 text-center select-all">
                  {pin}
                </div>
                <button
                  onClick={onRegeneratePin}
                  disabled={pinFixed}
                  title={
                    pinFixed
                      ? "Passcode is fixed via STREAM_PIN env var"
                      : "Generate new passcode + session ID"
                  }
                  className="p-2 bg-zinc-800 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-zinc-700 text-zinc-400 hover:enabled:text-zinc-200"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => copy(pin)}
                  title="Copy passcode"
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-[11px] text-zinc-600 mt-1">
                Share this passcode separately with your viewer
              </p>
            </div>
          </section>

          <div className="border-t border-zinc-800" />

          {/* Cloudflare Tunnel */}
          <section>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
              Cloudflare Tunnel
            </label>

            {tunnel.status === "idle" && (
              <div>
                <button
                  onClick={onStartTunnel}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-md text-sm font-medium transition-colors"
                >
                  <Zap size={14} />
                  Start Tunnel
                </button>
                <p className="text-[11px] text-zinc-600 mt-1.5">
                  Requires{" "}
                  <span className="font-mono text-zinc-500">cloudflared</span>{" "}
                  in PATH
                </p>
              </div>
            )}

            {tunnel.status === "starting" && (
              <div className="flex items-center gap-2 text-zinc-400 text-sm py-1">
                <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-orange-400 rounded-full animate-spin" />
                Starting tunnel…
              </div>
            )}

            {tunnel.status === "running" && tunnel.url && (
              <div className="space-y-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-green-400">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      Active
                    </span>
                    <button
                      onClick={onStopTunnel}
                      className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      Stop
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-300 break-all">
                    {tunnel.url}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-1 break-all">
                    {tunnel.url}/view?s={sessionId}
                  </p>
                </div>
                <button
                  onClick={copyTunnelSessionLink}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs transition-colors"
                >
                  <Copy size={12} />
                  Copy viewer link
                </button>
              </div>
            )}

            {tunnel.status === "error" && (
              <div>
                <p className="text-sm text-red-400 mb-2">
                  {tunnel.error ?? "Failed to start tunnel"}
                </p>
                <p className="text-[11px] text-zinc-600 mb-2">
                  Make sure <span className="font-mono">cloudflared</span> is
                  installed and in your PATH.
                </p>
                <button
                  onClick={onStartTunnel}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                >
                  Retry
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
