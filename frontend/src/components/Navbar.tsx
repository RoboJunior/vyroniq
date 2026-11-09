'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Command,
  Download,
  Layers,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'overview' | 'antigravity';
  onSwitchTab: (tab: 'overview' | 'antigravity') => void;
  totalEventsCount: number;
  lastSyncTime: string;
  isStreaming: boolean;
  isFetching: boolean;
  backendConnected: boolean;
  pollIntervalMs: number;
  onChangePollInterval: (ms: number) => void;
  onToggleStream: () => void;
  onManualRefresh: () => void;
  onOpenCommandPalette: () => void;
  onExportTelemetry: () => void;
}

export default function Navbar({
  activeTab,
  onSwitchTab,
  totalEventsCount,
  lastSyncTime,
  isStreaming,
  isFetching,
  backendConnected,
  pollIntervalMs,
  onChangePollInterval,
  onToggleStream,
  onManualRefresh,
  onOpenCommandPalette,
  onExportTelemetry,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#060911]/95">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Identity & Animated Navigation Tabs */}
        <div className="flex items-center gap-6 lg:gap-8 h-full">
          <div
            onClick={() => onSwitchTab('overview')}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <img
              src="/vyroniq-logo.png"
              alt="VYRONIQ"
              className="w-8 h-8 rounded-lg shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform object-contain"
            />
            <span className="text-base font-extrabold tracking-wider bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent group-hover:brightness-125 transition">
              VYRONIQ
            </span>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex items-center gap-1.5 h-full">
            <button
              onClick={() => onSwitchTab('overview')}
              className={`relative h-full px-3.5 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'overview'
                  ? 'text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Agents Directory</span>
              {activeTab === 'overview' && (
                <motion.div
                  layoutId="navbar-active-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400 shadow-[0_-2px_10px_rgba(59,130,246,0.6)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>

            <button
              onClick={() => onSwitchTab('antigravity')}
              className={`relative h-full px-4 flex items-center gap-2.5 text-xs transition-colors cursor-pointer ${
                activeTab === 'antigravity'
                  ? 'text-white font-semibold bg-white/[0.02]'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <img
                src="/antigravity-logo.png"
                alt="Antigravity"
                className="w-4 h-4 rounded-xs object-contain bg-white p-[1px]"
              />
              <span>Antigravity</span>
              <motion.span
                key={totalEventsCount}
                initial={{ scale: 0.85, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                className="px-1.5 py-0.5 text-[10px] font-mono rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 tabular-nums shadow-xs"
              >
                {totalEventsCount.toLocaleString()}
              </motion.span>
              {activeTab === 'antigravity' && (
                <motion.div
                  layoutId="navbar-active-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-cyan-400 shadow-[0_-2px_10px_rgba(59,130,246,0.6)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          </nav>
        </div>

        {/* Right: Command Palette Trigger + Live Stream Controls */}
        <div className="flex items-center gap-2.5">
          {/* Command Palette Trigger */}
          <button
            onClick={onOpenCommandPalette}
            className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[#0c101b] hover:bg-[#13192a] border border-white/[0.08] hover:border-blue-500/40 text-xs text-slate-400 hover:text-slate-200 transition group cursor-pointer"
            title="Quick Command & Filter Palette (Ctrl+K / ⌘K)"
          >
            <span className="flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-blue-400" />
              <span>Quick Jump &amp; Search...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/[0.06] text-slate-300 rounded border border-white/[0.08]">
              ⌘K
            </kbd>
          </button>

          {/* Connection & Last Synced Pill */}
          <div className="hidden xl:flex items-center gap-2 text-xs font-mono text-slate-400 px-3 py-1.5 rounded-lg bg-[#0c101b]/90 border border-white/[0.06]">
            {backendConnected ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-slate-500">Synced</span>
            <span className="text-slate-200 tabular-nums font-medium">{lastSyncTime}</span>
          </div>

          {/* Stream Controls Group */}
          <div className="flex items-center bg-[#0c101b] border border-white/[0.09] rounded-xl p-1 text-xs font-mono shadow-inner">
            <button
              onClick={onToggleStream}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                isStreaming
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
              }`}
              title={isStreaming ? 'Click to pause real-time polling' : 'Click to resume real-time polling'}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isStreaming ? 'bg-emerald-400 radar-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{isStreaming ? 'Live' : 'Paused'}</span>
            </button>

            {/* Poll Cadence Selector */}
            <select
              value={pollIntervalMs}
              onChange={(e) => onChangePollInterval(Number(e.target.value))}
              className="hidden sm:block bg-transparent text-slate-400 hover:text-slate-200 text-[11px] font-mono px-2 py-1 focus:outline-none cursor-pointer"
              title="Polling Interval"
            >
              <option value={2000} className="bg-[#0c101b] text-slate-200">
                2s
              </option>
              <option value={5000} className="bg-[#0c101b] text-slate-200">
                5s
              </option>
              <option value={10000} className="bg-[#0c101b] text-slate-200">
                10s
              </option>
            </select>

            <div className="h-4 w-px bg-white/[0.08] mx-0.5" />

            <button
              onClick={onManualRefresh}
              className="px-2.5 py-1 text-slate-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              title="Sync telemetry now"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-blue-400 ${isFetching ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Sync</span>
            </button>

            <button
              onClick={onExportTelemetry}
              className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-white/[0.05] rounded-lg transition cursor-pointer"
              title="Export current telemetry snapshot as JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
