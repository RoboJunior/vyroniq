'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Cpu, GitCompareArrows, Sparkles } from 'lucide-react';
import { ModelMetricSummary, ModelSwitchRecord } from '@/types/telemetry';
import { formatCompactNumber, formatRelativeTime } from '@/lib/telemetry-engine';

interface ModelTelemetryMatrixProps {
  modelsList: ModelMetricSummary[];
  switchEvents: ModelSwitchRecord[];
  totalEventsCount: number;
  selectedModel: string;
  onSelectModel: (modelName: string) => void;
  onInspectSwitchEvent: (conversationId: string, stepIndex: number, eventId: string) => void;
}

export default function ModelTelemetryMatrix({
  modelsList,
  switchEvents,
  totalEventsCount,
  selectedModel,
  onSelectModel,
  onInspectSwitchEvent,
}: ModelTelemetryMatrixProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
      className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4"
    >
      {/* Top Header & Model Filter Pills */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-white/[0.07] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">
              Model-Level Telemetry &amp; Switching Matrix
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
              {modelsList.length} Model{modelsList.length === 1 ? '' : 's'} Tracked
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Token consumption, context cache efficiency, tool velocity, and step turnaround isolated per foundation model. Click any model to filter.
          </p>
        </div>

        {/* Interactive Model Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onSelectModel('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer ${
              selectedModel === 'ALL'
                ? 'bg-blue-600 text-white font-semibold shadow-[0_0_16px_rgba(37,99,235,0.4)]'
                : 'bg-[#070a12] text-slate-300 border border-white/[0.08] hover:border-slate-500'
            }`}
          >
            All Models ({totalEventsCount})
          </button>

          {modelsList.map((m) => {
            const isActive = selectedModel === m.name;
            return (
              <button
                key={m.name}
                onClick={() => onSelectModel(m.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-[0_0_16px_rgba(37,99,235,0.4)]'
                    : 'bg-[#070a12] text-blue-300 border border-white/[0.08] hover:border-blue-500/40'
                }`}
              >
                {m.name} ({m.steps})
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: 8-Col Telemetry Table + 4-Col Model Switch Audit Log */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] font-mono uppercase text-slate-400">
                <th className="py-2.5 px-3">Foundation Model</th>
                <th className="py-2.5 px-3 text-right">Steps (Share)</th>
                <th className="py-2.5 px-3 text-right">Planner Turns</th>
                <th className="py-2.5 px-3 text-right">Input Tokens</th>
                <th className="py-2.5 px-3 text-right">Cache Read</th>
                <th className="py-2.5 px-3 text-right">Output Tokens</th>
                <th className="py-2.5 px-3 text-right">Cache Hit %</th>
                <th className="py-2.5 px-3 text-right">Tool Calls</th>
                <th className="py-2.5 px-3 text-right">Avg Turnaround</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-xs font-mono">
              {modelsList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No model telemetry available in current scope
                  </td>
                </tr>
              ) : (
                modelsList.map((m) => {
                  const isSelected = selectedModel === m.name;
                  return (
                    <tr
                      key={m.name}
                      onClick={() => onSelectModel(m.name)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-500/15'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isSelected ? 'bg-blue-400 radar-pulse' : 'bg-blue-500'
                            }`}
                          />
                          <span className="font-semibold text-white">{m.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-200">
                        <div className="flex items-center justify-end gap-2">
                          <span>
                            {m.steps}{' '}
                            <span className="text-slate-500 text-[10px]">({m.sharePct}%)</span>
                          </span>
                          <div className="w-12 h-1.5 bg-[#060911] rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.max(6, m.sharePct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-300">
                        {m.plannerTurns}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-blue-300">
                        {formatCompactNumber(m.inputTokens)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-cyan-300">
                        {formatCompactNumber(m.cacheTokens)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-purple-300">
                        {formatCompactNumber(m.outputTokens)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          {m.cacheHitPct}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-200">
                        {m.toolCalls}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-slate-300">
                        {m.avgLatency}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Right 4 Columns: Model Selection & Switch Audit */}
        <div className="xl:col-span-4 glass-subcard rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-semibold flex items-center gap-1.5">
                <GitCompareArrows className="w-3.5 h-3.5 text-blue-400" />
                Model Selection &amp; Switch Audit
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                {switchEvents.length} switch{switchEvents.length === 1 ? '' : 'es'}
              </span>
            </div>

            <div className="space-y-2 max-h-[185px] overflow-y-auto pr-1">
              {switchEvents.length === 0 ? (
                <div className="text-xs font-mono text-slate-500 py-8 text-center">
                  No model configuration changes recorded
                </div>
              ) : (
                switchEvents
                  .slice()
                  .reverse()
                  .map((sw, idx) => (
                    <div
                      key={`${sw.id}-${idx}`}
                      onClick={() =>
                        onInspectSwitchEvent(sw.conversation_id, sw.step_index, sw.id)
                      }
                      className="p-2.5 rounded-xl bg-[#0b0f1a] border border-white/[0.06] hover:border-blue-500/45 hover:bg-[#101626] cursor-pointer transition group"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                        <span className="text-blue-400 font-semibold group-hover:text-blue-300">
                          {sw.kind} • Step #{sw.step_index}
                        </span>
                        <span className="shrink-0">
                          {sw.created_at ? formatRelativeTime(sw.created_at) : ''}
                        </span>
                      </div>

                      <div className="text-xs font-mono text-slate-200 mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-[#06080f] text-slate-300 border border-white/[0.07]">
                          {sw.fromModel}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                          {sw.toModel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1.5">
                        <span className="truncate">
                          Runtime: {sw.runtimeModel} • Session {sw.conversation_id.slice(0, 8)}…
                        </span>
                        <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1">
                          Inspect →
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
