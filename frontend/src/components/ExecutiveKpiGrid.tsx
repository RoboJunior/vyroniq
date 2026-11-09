'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Coins,
  DatabaseZap,
  Gauge,
  Layers,
  MessageSquareCode,
  Wrench,
} from 'lucide-react';
import { EnrichedInteraction, NormalizedEvent } from '@/types/telemetry';
import { formatCompactNumber } from '@/lib/telemetry-engine';

interface ExecutiveKpiGridProps {
  events: NormalizedEvent[];
  rawEventsCount: number;
  isConvoSelected: boolean;
  conversationId: string;
  processedInteractions: EnrichedInteraction[];
}

export default function ExecutiveKpiGrid({
  events,
  rawEventsCount,
  isConvoSelected,
  conversationId,
  processedInteractions,
}: ExecutiveKpiGridProps) {
  let totalIn = 0,
    totalOut = 0,
    totalCache = 0,
    plannerCount = 0,
    totalTools = 0;

  events.forEach((ev) => {
    totalIn += ev.inputTokens;
    totalOut += ev.outputTokens;
    totalCache += ev.cacheReadTokens;
    if (ev.type === 'PLANNER_RESPONSE') plannerCount++;
    totalTools += ev.toolCalls.length;
  });

  const grandTokens = totalIn + totalOut + totalCache;
  const avgTokensPerPlanner = plannerCount > 0 ? Math.round(grandTokens / plannerCount) : 0;
  const totalPromptContext = totalIn + totalCache;
  const cacheHitNum = totalPromptContext > 0 ? (totalCache / totalPromptContext) * 100 : 0;
  const cacheHitPct = cacheHitNum.toFixed(1);
  const toolsPerTurn = plannerCount > 0 ? (totalTools / plannerCount).toFixed(2) : '0.00';

  // Mean step cadence
  const deltas: number[] = [];
  const byConvo = new Map<string, number[]>();
  events.forEach((ev) => {
    if (!ev.timestampMs) return;
    if (!byConvo.has(ev.conversation_id)) byConvo.set(ev.conversation_id, []);
    byConvo.get(ev.conversation_id)!.push(ev.timestampMs);
  });
  byConvo.forEach((times) => {
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const diffSec = (times[i] - times[i - 1]) / 1000;
      if (diffSec >= 0.5 && diffSec <= 180) deltas.push(diffSec);
    }
  });

  const stepLatencyStr =
    deltas.length > 0
      ? `${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)}s`
      : '< 1.0s';
  const stepLatencySub =
    deltas.length > 0 ? `${deltas.length} step transitions` : 'Sub-second dispatch';

  // Second card (Conversations or Interaction Turns)
  const convosCount = new Set(events.map((e) => e.conversation_id)).size;
  const avgStepsPerConvo = convosCount > 0 ? (events.length / convosCount).toFixed(1) : '0.0';
  const completedTurns = processedInteractions.filter((i) => i.status === 'COMPLETED').length;
  const activeTurns = processedInteractions.length - completedTurns;

  const cards = [
    {
      title: 'Total Steps',
      value: events.length.toLocaleString(),
      sub: `${rawEventsCount.toLocaleString()} raw docs indexed`,
      icon: Layers,
      accent: 'text-white',
      iconColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      barPct: Math.min(100, Math.round((events.length / Math.max(1, rawEventsCount)) * 100)),
      barColor: 'bg-blue-500',
    },
    {
      title: isConvoSelected ? 'Interaction Turns' : 'Active Conversations',
      value: isConvoSelected
        ? processedInteractions.length.toLocaleString()
        : convosCount.toLocaleString(),
      sub: isConvoSelected
        ? `${completedTurns} COMPLETED • ${activeTurns} IN_PROGRESS`
        : `Avg ${avgStepsPerConvo} steps / session`,
      icon: MessageSquareCode,
      accent: 'text-blue-400',
      iconColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      barPct: isConvoSelected
        ? Math.round((completedTurns / Math.max(1, processedInteractions.length)) * 100)
        : 100,
      barColor: 'bg-indigo-500',
    },
    {
      title: 'Total Tokens',
      value: formatCompactNumber(grandTokens),
      sub: `Avg ${formatCompactNumber(avgTokensPerPlanner)} / planner turn`,
      icon: Coins,
      accent: 'text-white',
      iconColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      barPct: Math.min(100, plannerCount > 0 ? 82 : 0),
      barColor: 'bg-purple-500',
    },
    {
      title: 'Context Cache Hit',
      value: `${cacheHitPct}%`,
      sub: `${formatCompactNumber(totalCache)} cached tokens`,
      icon: DatabaseZap,
      accent: 'text-emerald-400',
      iconColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      barPct: Math.round(cacheHitNum),
      barColor: 'bg-emerald-400',
    },
    {
      title: 'Tool Invocations',
      value: totalTools.toLocaleString(),
      sub: `${toolsPerTurn} tools / planner turn`,
      icon: Wrench,
      accent: 'text-white',
      iconColor: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
      barPct: Math.min(100, Math.round(Number(toolsPerTurn) * 35)),
      barColor: 'bg-pink-500',
    },
    {
      title: 'Mean Step Cadence',
      value: stepLatencyStr,
      sub: stepLatencySub,
      icon: Gauge,
      accent: 'text-sky-400',
      iconColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
      barPct: 75,
      barColor: 'bg-sky-400',
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold">
            Executive Telemetry Overview
          </h2>
        </div>

        <span
          className={`text-[11px] font-mono px-2.5 py-0.5 rounded-md border ${
            isConvoSelected
              ? 'text-blue-300 bg-blue-500/10 border-blue-500/30'
              : 'text-slate-300 bg-[#0c101b] border-white/[0.08]'
          }`}
        >
          {isConvoSelected
            ? `Session Scope: ${conversationId.slice(0, 14)}…`
            : 'Global Scope: All Sessions'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {cards.map((card, idx) => {
          const IconComponent = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.04 }}
              className="glass-panel-interactive rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-medium">{card.title}</span>
                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${card.iconColor}`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div
                  className={`text-2xl font-bold font-mono tabular-nums mt-2 tracking-tight ${card.accent}`}
                >
                  {card.value}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-white/[0.05] space-y-1.5">
                <div className="w-full h-1 bg-[#060911] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${card.barPct}%` }}
                    transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                    className={`h-full rounded-full ${card.barColor}`}
                  />
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">{card.sub}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
