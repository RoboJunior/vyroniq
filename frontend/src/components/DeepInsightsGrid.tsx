'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  FileCode2,
  MessageSquare,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { ConversationSummary, NormalizedEvent } from '@/types/telemetry';
import { formatCompactNumber } from '@/lib/telemetry-engine';

interface DeepInsightsGridProps {
  events: NormalizedEvent[];
  conversationsList: ConversationSummary[];
  selectedConversationId: string;
  selectedToolName: string;
  onSelectConversation: (cid: string) => void;
  onSelectTool: (toolName: string) => void;
  onOpenEventRawModal: (eventId: string) => void;
}

export default function DeepInsightsGrid({
  events,
  conversationsList,
  selectedConversationId,
  selectedToolName,
  onSelectConversation,
  onSelectTool,
  onOpenEventRawModal,
}: DeepInsightsGridProps) {
  let totalIn = 0,
    totalOut = 0,
    totalCache = 0,
    userCount = 0,
    plannerCount = 0,
    genericCount = 0,
    totalTools = 0;

  const toolMap = new Map<string, number>();
  const fileTargetMap = new Map<string, number>();
  const plannerSteps: NormalizedEvent[] = [];

  events.forEach((ev) => {
    totalIn += ev.inputTokens;
    totalOut += ev.outputTokens;
    totalCache += ev.cacheReadTokens;

    if (ev.type === 'USER_INPUT') userCount++;
    else if (ev.type === 'PLANNER_RESPONSE') {
      plannerCount++;
      if (ev.totalTokens > 0) plannerSteps.push(ev);
    } else {
      genericCount++;
    }

    ev.toolCalls.forEach((tc) => {
      const tName = tc.name || 'unknown';
      totalTools++;
      toolMap.set(tName, (toolMap.get(tName) || 0) + 1);

      if (tc.args) {
        const target = tc.args.Path || tc.args.toolSummary || tc.args.CommandLine;
        if (target) {
          const shortTarget = String(target)
            .replace(/\\/g, '/')
            .split('/')
            .slice(-2)
            .join('/');
          fileTargetMap.set(shortTarget, (fileTargetMap.get(shortTarget) || 0) + 1);
        }
      }
    });
  });

  const recentPlanner = plannerSteps.slice(-18);
  const maxStepTok = Math.max(...recentPlanner.map((s) => s.totalTokens), 1);

  const sortedTools = Array.from(toolMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxToolCalls = sortedTools.length > 0 ? sortedTools[0][1] : 1;
  const sortedTargets = Array.from(fileTargetMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalEv = Math.max(1, events.length);
  const uPct = Math.round((userCount / totalEv) * 100);
  const pPct = Math.round((plannerCount / totalEv) * 100);
  const gPct = Math.max(0, 100 - uPct - pPct);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Panel A: Step Token & Cache Telemetry Chart (5 cols) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="lg:col-span-5 glass-panel rounded-2xl p-5 flex flex-col justify-between"
      >
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">
                Step Token &amp; Cache Utilization
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2 h-2 rounded-xs bg-cyan-400" />
                Cache
              </span>
              <span className="flex items-center gap-1 text-blue-400">
                <span className="w-2 h-2 rounded-xs bg-blue-500" />
                Input
              </span>
              <span className="flex items-center gap-1 text-purple-400">
                <span className="w-2 h-2 rounded-xs bg-purple-400" />
                Output
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Token composition across recent planner turns. Click any bar to inspect raw JSON.
          </p>

          <div className="h-44 flex items-end gap-1.5 pt-4 pb-1.5 px-3 glass-subcard rounded-xl overflow-x-auto">
            {recentPlanner.length === 0 ? (
              <div className="w-full text-center text-xs font-mono text-slate-600 self-center">
                No planner token telemetry in scope
              </div>
            ) : (
              recentPlanner.map((s, idx) => {
                const totalH = Math.max(14, Math.round((s.totalTokens / maxStepTok) * 100));
                const cacheShare =
                  s.totalTokens > 0 ? Math.round((s.cacheReadTokens / s.totalTokens) * 100) : 0;
                const inShare =
                  s.totalTokens > 0 ? Math.round((s.inputTokens / s.totalTokens) * 100) : 0;
                const outShare = Math.max(0, 100 - cacheShare - inShare);

                return (
                  <div
                    key={s.id}
                    onClick={() => onOpenEventRawModal(s.id)}
                    title={`Step #${s.step_index} (${s.model_name}) — Total: ${s.totalTokens.toLocaleString()} tokens (Cache: ${s.cacheReadTokens.toLocaleString()}, In: ${s.inputTokens.toLocaleString()}, Out: ${s.outputTokens.toLocaleString()})`}
                    className="flex-1 min-w-[20px] h-full flex flex-col justify-end items-center group cursor-pointer"
                  >
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${totalH}%` }}
                      transition={{ duration: 0.45, delay: idx * 0.02, ease: [0.16, 1, 0.3, 1] }}
                      className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse transition-all duration-200 group-hover:brightness-125 group-hover:ring-1 group-hover:ring-white/40"
                    >
                      <div className="bg-cyan-400/90 w-full" style={{ height: `${cacheShare}%` }} />
                      <div className="bg-blue-500/90 w-full" style={{ height: `${inShare}%` }} />
                      <div className="bg-purple-400/95 w-full" style={{ height: `${outShare}%` }} />
                    </motion.div>
                    <span className="text-[9px] font-mono text-slate-500 mt-1 group-hover:text-white transition">
                      S{s.step_index}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-white/[0.06] text-center">
          <div className="glass-subcard rounded-xl p-2.5">
            <div className="text-[10px] font-mono text-slate-500">FRESH INPUT</div>
            <div className="text-xs font-mono font-bold text-blue-300 mt-0.5 tabular-nums">
              {totalIn.toLocaleString()}
            </div>
          </div>
          <div className="glass-subcard rounded-xl p-2.5">
            <div className="text-[10px] font-mono text-slate-500">CACHE READ</div>
            <div className="text-xs font-mono font-bold text-cyan-300 mt-0.5 tabular-nums">
              {totalCache.toLocaleString()}
            </div>
          </div>
          <div className="glass-subcard rounded-xl p-2.5">
            <div className="text-[10px] font-mono text-slate-500">MODEL OUTPUT</div>
            <div className="text-xs font-mono font-bold text-purple-300 mt-0.5 tabular-nums">
              {totalOut.toLocaleString()}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Panel B: Tool Execution & Workspace File Audit (4 cols) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.16 }}
        className="lg:col-span-4 glass-panel rounded-2xl p-5 flex flex-col justify-between"
      >
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-pink-400" />
                <h3 className="text-sm font-bold text-white">Tool Execution &amp; File Audit</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Click any tool to filter events</p>
            </div>
            <span className="text-[11px] font-mono text-slate-300 glass-subcard px-2.5 py-0.5 rounded-md">
              {sortedTools.length} tools
            </span>
          </div>

          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
            {sortedTools.length === 0 ? (
              <div className="text-xs font-mono text-slate-600 py-5 text-center">
                No tools invoked
              </div>
            ) : (
              sortedTools.map(([name, count]) => {
                const pct = Math.max(6, Math.round((count / maxToolCalls) * 100));
                const sharePct = Math.round((count / Math.max(1, totalTools)) * 100);
                const isSelected = selectedToolName === name;
                return (
                  <div
                    key={name}
                    onClick={() => onSelectTool(name)}
                    className={`p-2 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-500/15 border-blue-400/50 shadow-xs'
                        : 'glass-subcard hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="font-medium text-slate-200">{name}</span>
                      <span className="text-slate-400 tabular-nums">
                        {count} <span className="text-slate-600">({sharePct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                        className="bg-gradient-to-r from-blue-500 to-indigo-400 h-full rounded-full"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">
              <FileCode2 className="w-3.5 h-3.5 text-slate-400" />
              Most Accessed Workspace Targets
            </div>
            <div className="space-y-1.5">
              {sortedTargets.length === 0 ? (
                <div className="text-[11px] font-mono text-slate-600">None</div>
              ) : (
                sortedTargets.slice(0, 3).map(([target, count]) => (
                  <div
                    key={target}
                    className="flex items-center justify-between text-[11px] font-mono glass-subcard px-2.5 py-1.5 rounded-lg"
                  >
                    <span className="text-slate-300 truncate max-w-[240px]" title={target}>
                      {target}
                    </span>
                    <span className="text-blue-400 font-semibold shrink-0 ml-2">{count}x</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Panel C: Conversations Selector (3 cols) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="lg:col-span-3 glass-panel rounded-2xl p-5 flex flex-col justify-between"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Conversations</h3>
            </div>
            <button
              onClick={() => onSelectConversation('ALL')}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                selectedConversationId === 'ALL'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                  : 'text-slate-400 hover:text-blue-300 glass-subcard'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  selectedConversationId === 'ALL' ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span>All Events</span>
            </button>
          </div>

          {/* Step Type Distribution Multi-Bar */}
          <div className="mb-3.5">
            <div className="h-1.5 w-full rounded-full bg-[#060911] overflow-hidden flex gap-0.5">
              <div
                className="bg-sky-400 h-full transition-all duration-300"
                style={{ width: `${uPct}%` }}
              />
              <div
                className="bg-purple-400 h-full transition-all duration-300"
                style={{ width: `${pPct}%` }}
              />
              <div
                className="bg-emerald-400 h-full transition-all duration-300"
                style={{ width: `${gPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5">
              <span className="text-sky-300">Prompt {uPct}%</span>
              <span className="text-purple-300">Planner {pPct}%</span>
              <span className="text-emerald-300">Output {gPct}%</span>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[235px] overflow-y-auto pr-1">
            {conversationsList.length === 0 ? (
              <div className="text-xs text-slate-600 font-mono py-12 text-center">
                No sessions indexed
              </div>
            ) : (
              conversationsList.map((c) => {
                const isSelected = selectedConversationId === c.id;
                const cleanPrompt = c.firstPrompt?.trim().replace(/\s+/g, ' ');
                const promptPreview =
                  cleanPrompt && cleanPrompt.length > 0
                    ? cleanPrompt.slice(0, 65) + (cleanPrompt.length > 65 ? '…' : '')
                    : `Session ${c.id.slice(0, 8)} (${c.count} steps)`;

                return (
                  <div
                    key={c.id}
                    onClick={() => onSelectConversation(c.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-400 shadow-[0_0_16px_rgba(59,130,246,0.2)]'
                        : 'glass-subcard hover:border-blue-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-blue-300 truncate">
                        {c.id.slice(0, 14)}…
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 shrink-0">
                        {isSelected ? 'Active' : 'Inspect →'}
                      </span>
                    </div>
                    <div
                      className="text-[11px] text-slate-300 mt-1 truncate min-h-[16px]"
                      title={cleanPrompt || c.id}
                    >
                      {promptPreview}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1.5 pt-1 border-t border-white/[0.04]">
                      <span>
                        {c.count} steps • {c.userInputs} turns
                      </span>
                      <span>{formatCompactNumber(c.tokens)} tok</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
