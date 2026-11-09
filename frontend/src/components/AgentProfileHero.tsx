'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Clock,
  Cpu,
  FolderGit2,
  GitCommitHorizontal,
  Radio,
  Sparkles,
} from 'lucide-react';
import { NormalizedEvent } from '@/types/telemetry';
import { formatRelativeTime } from '@/lib/telemetry-engine';

interface AgentProfileHeroProps {
  allEvents: NormalizedEvent[];
  selectedWorkspace: string;
  onSelectWorkspace: (ws: string) => void;
  onSelectConversation: (cid: string) => void;
}

export default function AgentProfileHero({
  allEvents,
  selectedWorkspace,
  onSelectWorkspace,
  onSelectConversation,
}: AgentProfileHeroProps) {
  const models = new Set<string>();
  const workspaces = new Set<string>();
  const uniqueFiles = new Set<string>();
  let modelSwitchCount = 0;
  let latestEvent: NormalizedEvent | null = null;
  const prevModelByConvo = new Map<string, string>();

  allEvents.forEach((ev) => {
    if (ev.model_name) models.add(ev.model_name);
    ev.workspace_paths.forEach((w) => workspaces.add(w));

    if (ev.modelChangeInfo) {
      modelSwitchCount++;
    } else {
      const prevM = prevModelByConvo.get(ev.conversation_id);
      if (prevM && prevM !== ev.model_name) modelSwitchCount++;
      prevModelByConvo.set(ev.conversation_id, ev.model_name);
    }

    ev.toolCalls.forEach((tc) => {
      const pathArg = tc.args?.Path || tc.args?.TargetFile || tc.args?.SearchPath;
      if (pathArg) uniqueFiles.add(String(pathArg).replace(/\\/g, '/'));
    });

    if (!latestEvent || ev.timestampMs >= latestEvent.timestampMs) {
      latestEvent = ev;
    }
  });

  const modelArr = Array.from(models);
  const wsArr = Array.from(workspaces);
  const resolvedLatest = latestEvent as NormalizedEvent | null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-panel rounded-2xl p-5 sm:p-6 relative overflow-hidden"
    >
      {/* Ambient Decorative Glow (cheap gradient, no blur filter) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_20%_0%,rgba(59,130,246,0.10),transparent)] pointer-events-none" />

      <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        {/* Left: Agent Identity */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src="/antigravity-logo.png"
              alt="Antigravity Logo"
              className="relative w-13 h-13 rounded-xl object-contain bg-white p-1.5 shadow-lg"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-blue-400 font-semibold">
                <Sparkles className="w-3 h-3" />
                ANTIGRAVITY AGENT PROFILE
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 radar-pulse" />
                TELEMETRY ACTIVE
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
              Antigravity Autonomous Coding Engine
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time execution step tracing and context cache analytics
            </p>
          </div>
        </div>

        {/* Right: 3 High-Contrast Sub-Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 xl:min-w-[640px]">
          {/* Detected Models */}
          <div className="glass-subcard rounded-xl px-4 py-3 border border-white/[0.07] hover:border-blue-500/30 transition">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <span>Detected Models</span>
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div
              className="text-xs font-mono font-semibold text-blue-300 mt-1.5 truncate"
              title={modelArr.join(', ')}
            >
              {modelArr.length ? modelArr.join(', ') : 'No model reported'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {modelArr.length} model{modelArr.length === 1 ? '' : 's'} • {modelSwitchCount} switch
              {modelSwitchCount === 1 ? '' : 'es'}
            </div>
          </div>

          {/* Monitored Workspaces */}
          <div className="glass-subcard rounded-xl px-4 py-3 border border-white/[0.07] hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <span>Monitored Workspaces</span>
              <FolderGit2 className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xs font-mono font-semibold text-slate-100 mt-1.5 truncate">
              {wsArr.length} Workspace{wsArr.length === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {uniqueFiles.size} unique files accessed
            </div>
          </div>

          {/* Last Recorded Activity */}
          <div className="glass-subcard rounded-xl px-4 py-3 border border-white/[0.07] hover:border-emerald-500/30 transition">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
              <span>Last Recorded Activity</span>
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xs font-mono font-semibold text-emerald-400 mt-1.5 truncate">
              {resolvedLatest?.created_at ? formatRelativeTime(resolvedLatest.created_at) : '--'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">
              {resolvedLatest
                ? `Step #${resolvedLatest.step_index} • ${resolvedLatest.model_name}`
                : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Workspace Pills & Active Session Quick-Open */}
      <div className="relative mt-4 pt-3.5 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 flex items-center gap-1.5">
            <FolderGit2 className="w-3.5 h-3.5 text-slate-400" />
            Workspaces:
          </span>
          {wsArr.length === 0 ? (
            <span className="text-slate-600">None</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {wsArr.map((ws) => {
                const isSelected = selectedWorkspace === ws;
                return (
                  <button
                    key={ws}
                    onClick={() => onSelectWorkspace(ws)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-200 border-blue-400/50 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                        : 'bg-[#070a12] text-slate-300 border-white/[0.07] hover:border-slate-500'
                    }`}
                  >
                    {ws}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {resolvedLatest && resolvedLatest.conversation_id && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Latest Active Session:</span>
            <button
              onClick={() => onSelectConversation(resolvedLatest.conversation_id)}
              className="px-3 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition font-semibold flex items-center gap-1.5 cursor-pointer group"
            >
              <span>{resolvedLatest.conversation_id.slice(0, 18)}…</span>
              <span className="text-[11px] text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Open Workbench <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          </div>
        )}
      </div>
    </motion.section>
  );
}
