'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { formatCompactNumber } from '@/lib/telemetry-engine';

interface AgentsDirectoryViewProps {
  totalEvents: number;
  modelsCount: number;
  totalTokens: number;
  conversationsCount: number;
  toolsCount: number;
  cacheHitPct: string;
  onOpenAntigravity: () => void;
}

export default function AgentsDirectoryView({
  totalEvents,
  modelsCount,
  totalTokens,
  conversationsCount,
  toolsCount,
  cacheHitPct,
  onOpenAntigravity,
}: AgentsDirectoryViewProps) {
  const metrics = [
    { label: 'Total Events', value: totalEvents.toLocaleString(), color: 'text-white' },
    { label: 'Sessions', value: conversationsCount.toLocaleString(), color: 'text-blue-400' },
    { label: 'Models Used', value: modelsCount.toLocaleString(), color: 'text-indigo-300' },
    { label: 'Tokens Used', value: formatCompactNumber(totalTokens), color: 'text-slate-100' },
    { label: 'Cache Hit', value: `${cacheHitPct}%`, color: 'text-emerald-400' },
    { label: 'Tool Calls', value: toolsCount.toLocaleString(), color: 'text-pink-300' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-[1680px] w-full mx-auto px-4 sm:px-6 py-8 space-y-6"
    >
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Agents</h1>
        <p className="text-xs text-slate-400 mt-1">
          Select an agent to inspect its live telemetry and conversation traces.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          onClick={onOpenAntigravity}
          className="glass-panel-interactive rounded-2xl p-6 sm:p-7 cursor-pointer group relative overflow-hidden border border-blue-500/30"
        >
          <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-blue-500/15 via-violet-500/10 to-transparent rounded-bl-full pointer-events-none" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src="/antigravity-logo.png"
                alt="Antigravity Logo"
                className="w-14 h-14 rounded-2xl object-contain bg-white p-2 shadow-xl shrink-0"
              />
              <div>
                <h2 className="text-xl font-bold text-white group-hover:text-blue-400 transition">
                  Antigravity
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Autonomous Coding &amp; Reasoning Agent
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 group-hover:bg-blue-600 text-blue-300 group-hover:text-white border border-blue-500/35 text-xs font-mono font-semibold transition shrink-0">
              <span>Open</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          <div className="relative grid grid-cols-2 sm:grid-cols-3 gap-3 mt-7 pt-5 border-t border-white/[0.08]">
            {metrics.map((m) => (
              <div key={m.label} className="glass-subcard rounded-xl p-3">
                <div className="text-[10px] font-mono text-slate-400 uppercase">{m.label}</div>
                <div className={`text-base font-mono font-bold mt-1 tabular-nums ${m.color}`}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
