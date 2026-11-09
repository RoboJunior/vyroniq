'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Command,
  Cpu,
  Layers,
  MessageSquare,
  RotateCcw,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { ConversationSummary, ModelMetricSummary } from '@/types/telemetry';
import { formatCompactNumber } from '@/lib/telemetry-engine';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  models: ModelMetricSummary[];
  tools: [string, number][];
  onSelectConversation: (cid: string) => void;
  onSelectModel: (modelName: string) => void;
  onSelectTool: (toolName: string) => void;
  onSwitchTab: (tab: 'overview' | 'antigravity') => void;
  onResetFilters: () => void;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  conversations,
  models,
  tools,
  onSelectConversation,
  onSelectModel,
  onSelectTool,
  onSwitchTab,
  onResetFilters,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const matchedConvos = conversations
    .filter(
      (c) =>
        !q ||
        c.id.toLowerCase().includes(q) ||
        (c.firstPrompt && c.firstPrompt.toLowerCase().includes(q))
    )
    .slice(0, 5);

  const matchedModels = models.filter((m) => !q || m.name.toLowerCase().includes(q));
  const matchedTools = tools
    .filter(([t]) => !q || t.toLowerCase().includes(q))
    .slice(0, 6);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[9998] bg-[#03050a]/80 backdrop-blur-md flex items-start justify-center pt-20 p-4"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: -10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: -10 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0c101d] border border-white/[0.12] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
        >
          {/* Search Input Header */}
          <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center gap-3 bg-[#080b14]">
            <Search className="w-4 h-4 text-blue-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to conversation session, filter by model, tool, or view..."
              className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
            />
            <button
              onClick={onClose}
              className="px-2 py-0.5 rounded bg-white/[0.06] text-slate-400 hover:text-white text-[10px] font-mono cursor-pointer"
            >
              ESC
            </button>
          </div>

          {/* Results List */}
          <div className="max-h-[65vh] overflow-y-auto p-3 space-y-4">
            {/* Quick Actions */}
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500">
                Quick Actions
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    onSelectConversation('ALL');
                    onSwitchTab('antigravity');
                    onClose();
                  }}
                  className="p-2.5 rounded-xl glass-subcard hover:border-blue-500/40 text-left flex items-center justify-between text-xs font-mono text-slate-200 cursor-pointer"
                >
                  <span>All Events Stream</span>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                </button>
                <button
                  onClick={() => {
                    onSwitchTab('overview');
                    onClose();
                  }}
                  className="p-2.5 rounded-xl glass-subcard hover:border-blue-500/40 text-left flex items-center justify-between text-xs font-mono text-slate-200 cursor-pointer"
                >
                  <span>Agents Directory</span>
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                </button>
                <button
                  onClick={() => {
                    onResetFilters();
                    onClose();
                  }}
                  className="p-2.5 rounded-xl glass-subcard hover:border-rose-500/40 text-left flex items-center justify-between text-xs font-mono text-slate-200 cursor-pointer"
                >
                  <span>Reset All Filters</span>
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                </button>
              </div>
            </div>

            {/* Conversations */}
            {matchedConvos.length > 0 && (
              <div>
                <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 text-blue-400" />
                  Conversation Sessions ({matchedConvos.length})
                </div>
                <div className="space-y-1">
                  {matchedConvos.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSwitchTab('antigravity');
                        onSelectConversation(c.id);
                        onClose();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-blue-500/15 border border-transparent hover:border-blue-500/30 flex items-center justify-between gap-3 text-left transition cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-semibold text-blue-300 truncate">
                          {c.id}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {c.firstPrompt || 'Session trace'}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {c.count} steps • {formatCompactNumber(c.tokens)} tok
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Foundation Models */}
            {matchedModels.length > 0 && (
              <div>
                <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-indigo-400" />
                  Foundation Models
                </div>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {matchedModels.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => {
                        onSwitchTab('antigravity');
                        onSelectModel(m.name);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg glass-subcard hover:border-blue-500/40 text-xs font-mono text-slate-200 cursor-pointer"
                    >
                      {m.name} <span className="text-slate-500">({m.steps})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tools */}
            {matchedTools.length > 0 && (
              <div>
                <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-pink-400" />
                  Tool Invocations
                </div>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {matchedTools.map(([tName, cnt]) => (
                    <button
                      key={tName}
                      onClick={() => {
                        onSwitchTab('antigravity');
                        onSelectTool(tName);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg glass-subcard hover:border-pink-500/40 text-xs font-mono text-pink-200 cursor-pointer"
                    >
                      🔧 {tName} <span className="text-slate-500">({cnt})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
