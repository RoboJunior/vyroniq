'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Copy,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AlignmentTone, EnrichedInteraction } from '@/types/telemetry';
import {
  cleanSingleLinePreview,
  formatDeviationTypeLabel,
  getAlignmentToneClasses,
  safeJsonStringify,
} from '@/lib/telemetry-engine';

interface AlignmentMatrixSectionProps {
  isConvoSelected: boolean;
  processedInteractions: EnrichedInteraction[];
  selectedTurnIndex: number | null;
  isEvaluatingAlignment: boolean;
  allSessionEvaluations: any[];
  onSelectTurn: (turnIndex: number) => void;
  onRefreshAlignment: () => void;
  onOpenAlignmentModal: (turnIndex: number | null) => void;
}

export default function AlignmentMatrixSection({
  isConvoSelected,
  processedInteractions,
  selectedTurnIndex,
  isEvaluatingAlignment,
  allSessionEvaluations,
  onSelectTurn,
  onRefreshAlignment,
  onOpenAlignmentModal,
}: AlignmentMatrixSectionProps) {
  const [showInlineJson, setShowInlineJson] = useState(false);
  const [copiedInline, setCopiedInline] = useState(false);

  if (!isConvoSelected) return null;

  const evaluatedTurns = processedInteractions.filter((t) => t.alignment);
  const totalTurns = processedInteractions.length;

  if (evaluatedTurns.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl p-4 sm:p-5 border border-violet-500/30 shadow-xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${
                isEvaluatingAlignment ? 'bg-violet-400 animate-ping' : 'bg-slate-500'
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-mono uppercase tracking-wider text-violet-300 font-bold">
                  Agent Alignment &amp; SystemOne Evaluation Matrix
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  SystemOne
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {isEvaluatingAlignment
                  ? `Computing SystemOne alignment metrics (goal deviation, adherence, validity, completion) for ${totalTurns} interaction(s)…`
                  : 'No SystemOne evaluation entries available yet for this session.'}
              </p>
            </div>
          </div>

          <button
            onClick={onRefreshAlignment}
            disabled={isEvaluatingAlignment}
            className="px-3.5 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/35 text-xs font-mono font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isEvaluatingAlignment ? 'animate-spin' : ''}`} />
            <span>{isEvaluatingAlignment ? 'Evaluating…' : 'Run SystemOne Evaluation'}</span>
          </button>
        </div>
      </motion.section>
    );
  }

  // Aggregated Session Alignment Metrics
  const count = evaluatedTurns.length;
  const meanComposite = Math.round(
    evaluatedTurns.reduce((s, t) => s + t.alignment!.compositeScore, 0) / count
  );
  const minComposite = Math.min(...evaluatedTurns.map((t) => t.alignment!.compositeScore));
  const maxComposite = Math.max(...evaluatedTurns.map((t) => t.alignment!.compositeScore));

  const meanValidityPct = Math.round(
    (evaluatedTurns.reduce((s, t) => s + t.alignment!.choiceValidity, 0) / count) * 100
  );
  const meanAdherence =
    evaluatedTurns.reduce((s, t) => s + t.alignment!.instructionAdherence.score, 0) / count;
  const meanAdherenceConf = Math.round(
    (evaluatedTurns.reduce(
      (s, t) => s + (t.alignment!.instructionAdherence.confidence ?? 1),
      0
    ) /
      count) *
      100
  );

  const meanCompletion =
    evaluatedTurns.reduce((s, t) => s + t.alignment!.goalCompletion.score, 0) / count;
  const meanCompletionConf = Math.round(
    (evaluatedTurns.reduce((s, t) => s + (t.alignment!.goalCompletion.confidence ?? 1), 0) /
      count) *
      100
  );

  const meanGoalDevPct = Math.round(
    (evaluatedTurns.reduce((s, t) => s + t.alignment!.goalDeviation, 0) / count) * 100
  );
  const meanDevSeverity =
    evaluatedTurns.reduce((s, t) => s + t.alignment!.deviationSeverity.score, 0) / count;
  const maxDevSeverity = Math.max(
    ...evaluatedTurns.map((t) => t.alignment!.deviationSeverity.score)
  );

  const meanRepeatedPct = Math.round(
    (evaluatedTurns.reduce((s, t) => s + t.alignment!.repeatedActions, 0) / count) * 100
  );
  const maxRepeatedPct = Math.round(
    Math.max(...evaluatedTurns.map((t) => t.alignment!.repeatedActions)) * 100
  );

  const driftedCount = evaluatedTurns.filter((t) => t.alignment!.isDeviated).length;
  const alignedCount = count - driftedCount;

  const devTypeCounts: Record<string, number> = {};
  evaluatedTurns.forEach((t) => {
    const ch = t.alignment!.deviationType.choice || 'none';
    devTypeCounts[ch] = (devTypeCounts[ch] || 0) + 1;
  });
  const devTypeEntries = Object.entries(devTypeCounts).sort((a, b) => b[1] - a[1]);

  let sessionTone: AlignmentTone = 'emerald';
  let sessionVerdict = 'SESSION ALIGNED';
  if (meanComposite < 60 || maxDevSeverity >= 2.8) {
    sessionTone = 'rose';
    sessionVerdict = 'CRITICAL DRIFT';
  } else if (driftedCount > 0 || meanComposite < 78) {
    sessionTone = 'amber';
    sessionVerdict = `${driftedCount} TURN(S) DRIFTED`;
  } else if (meanComposite < 90) {
    sessionTone = 'sky';
    sessionVerdict = 'MINOR VARIANCE';
  }
  const sessionToneCls = getAlignmentToneClasses(sessionTone);

  const handleCopyInline = () => {
    navigator.clipboard.writeText(safeJsonStringify(allSessionEvaluations));
    setCopiedInline(true);
    setTimeout(() => setCopiedInline(false), 1500);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5 border border-violet-500/30 shadow-[0_10px_40px_-10px_rgba(139,92,246,0.18)] space-y-4"
    >
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-400 shadow-[0_0_10px_#a78bfa]" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-violet-400" />
            Agent Alignment &amp; SystemOne Telemetry Matrix
          </h2>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${sessionToneCls.badge}`}
          >
            {sessionVerdict} • {meanComposite}%
          </span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono glass-subcard text-slate-300">
            {count} / {totalTurns} Turns Evaluated
          </span>
          {isEvaluatingAlignment && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-violet-500/20 text-violet-200 border border-violet-500/35 animate-pulse">
              ⏳ Refreshing SystemOne…
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInlineJson((prev) => !prev)}
            className="px-2.5 py-1 rounded-lg glass-subcard hover:bg-white/[0.06] text-slate-200 hover:text-white border border-violet-500/35 text-[11px] font-mono transition cursor-pointer flex items-center gap-1.5"
          >
            <Braces className="w-3.5 h-3.5 text-violet-400" />
            <span>{showInlineJson ? 'Hide Inline JSON' : 'Inline Evaluations JSON'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenAlignmentModal(null)}
            className="px-2.5 py-1 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/35 text-[11px] font-mono transition cursor-pointer"
          >
            {'{ }'} Modal JSON
          </button>

          <button
            type="button"
            onClick={onRefreshAlignment}
            disabled={isEvaluatingAlignment}
            className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 border border-violet-500/40 text-[11px] font-mono font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isEvaluatingAlignment ? 'animate-spin' : ''}`} />
            <span>Re-evaluate</span>
          </button>
        </div>
      </div>

      {/* Expandable Inline JSON Drawer */}
      <AnimatePresence>
        {showInlineJson && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#05070e] border border-violet-500/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
                <span className="text-xs font-mono font-semibold text-violet-300">
                  All Session SystemOne Evaluations JSON ({count} turns)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyInline}
                    className="px-2.5 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 text-[11px] font-mono transition flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedInline ? 'Copied!' : 'Copy JSON'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInlineJson(false)}
                    className="px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 text-[11px] font-mono transition cursor-pointer"
                  >
                    ✕ Hide
                  </button>
                </div>
              </div>
              <pre className="max-h-72 overflow-y-auto text-xs font-mono text-blue-100 whitespace-pre-wrap break-words select-all">
                {safeJsonStringify(allSessionEvaluations)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6 SystemOne KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Composite Alignment */}
        <div
          className={`glass-subcard border ${sessionToneCls.border} rounded-xl p-3.5 flex flex-col justify-between`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">
              Composite Alignment
            </span>
            <span className="text-[10px] font-mono text-emerald-400">
              {alignedCount}/{count} aligned
            </span>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono tabular-nums ${sessionToneCls.text}`}>
              {meanComposite}%
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              range {minComposite}–{maxComposite}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${meanComposite}%` }}
              transition={{ duration: 0.6 }}
              className={`h-full ${sessionToneCls.bar} rounded-full`}
            />
          </div>
        </div>

        {/* 2. Choice Validity (noul) */}
        <div className="glass-subcard rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">Choice Validity</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/15 text-blue-300">
              noul
            </span>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono tabular-nums text-blue-300">
              {meanValidityPct}%
            </span>
            <span className="text-[10px] font-mono text-slate-500 truncate">valid decisions</span>
          </div>
          <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${meanValidityPct}%` }}
              transition={{ duration: 0.6 }}
              className="h-full bg-blue-400 rounded-full"
            />
          </div>
        </div>

        {/* 3. Instruction Adherence (score 0-4) */}
        <div className="glass-subcard rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">
              Instruction Adherence
            </span>
            <span className="text-[9px] font-mono text-slate-400">conf {meanAdherenceConf}%</span>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tabular-nums text-emerald-300">
              {meanAdherence.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 4.0</span>
          </div>
          <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.round((meanAdherence / 4) * 100)}%` }}
              transition={{ duration: 0.6 }}
              className="h-full bg-emerald-400 rounded-full"
            />
          </div>
        </div>

        {/* 4. Goal Completion (score 0-4) */}
        <div className="glass-subcard rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">Goal Completion</span>
            <span className="text-[9px] font-mono text-slate-400">conf {meanCompletionConf}%</span>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono tabular-nums text-sky-300">
              {meanCompletion.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-500">/ 4.0</span>
          </div>
          <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.round((meanCompletion / 4) * 100)}%` }}
              transition={{ duration: 0.6 }}
              className="h-full bg-sky-400 rounded-full"
            />
          </div>
        </div>

        {/* 5. Goal Deviation & Severity */}
        <div className="glass-subcard rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">
              Goal Deviation Risk
            </span>
            <span
              className={`text-[9px] font-mono ${
                meanDevSeverity >= 1.5 ? 'text-rose-300' : 'text-slate-400'
              }`}
            >
              sev {meanDevSeverity.toFixed(2)}/4
            </span>
          </div>
          <div className="my-2 flex items-baseline justify-between gap-1">
            <span
              className={`text-xl font-bold font-mono tabular-nums ${
                meanGoalDevPct >= 30 ? 'text-rose-400' : 'text-emerald-300'
              }`}
            >
              {meanGoalDevPct}%
            </span>
            <div className="flex flex-wrap justify-end gap-1">
              {devTypeEntries.slice(0, 2).map(([ch, cnt]) => (
                <span
                  key={ch}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                    ch === 'none'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {formatDeviationTypeLabel(ch)}:{cnt}
                </span>
              ))}
            </div>
          </div>
          <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, meanGoalDevPct)}%` }}
              transition={{ duration: 0.6 }}
              className={`h-full ${
                meanGoalDevPct >= 30 ? 'bg-rose-500' : 'bg-emerald-400'
              } rounded-full`}
            />
          </div>
        </div>

        {/* 6. Repeated Actions / Loop Risk */}
        <div className="glass-subcard rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">
              Repeated Actions
            </span>
            <span className="text-[9px] font-mono text-slate-400">max {maxRepeatedPct}%</span>
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span
              className={`text-xl font-bold font-mono tabular-nums ${
                meanRepeatedPct >= 35 ? 'text-amber-300' : 'text-violet-300'
              }`}
            >
              {meanRepeatedPct}%
            </span>
            <span className="text-[10px] font-mono text-slate-500">loop risk</span>
          </div>
          <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, meanRepeatedPct)}%` }}
              transition={{ duration: 0.6 }}
              className={`h-full ${
                meanRepeatedPct >= 35 ? 'bg-amber-400' : 'bg-violet-400'
              } rounded-full`}
            />
          </div>
        </div>
      </div>

      {/* Turn-by-Turn Interactive Alignment Strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono text-slate-400">
            Click any interaction turn below to inspect its full{' '}
            <strong className="text-violet-300">
              SystemOne Probability Distribution &amp; Criteria Breakdown
            </strong>
            :
          </span>
          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
            Matched by interaction_index
          </span>
        </div>

        <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2">
          {processedInteractions.map((turn) => {
            const al = turn.alignment;
            const isSelected = turn.interaction_index === selectedTurnIndex;
            const goalShort = cleanSingleLinePreview(
              turn.goal || al?.original_goal || 'No explicit prompt'
            );

            if (!al) {
              return (
                <div
                  key={turn.interaction_index}
                  onClick={() => onSelectTurn(turn.interaction_index)}
                  className={`min-w-[210px] max-w-[240px] shrink-0 rounded-xl p-3 glass-subcard border ${
                    isSelected
                      ? 'border-blue-500 ring-1 ring-blue-500/40'
                      : 'border-white/[0.06] hover:border-slate-600'
                  } cursor-pointer transition flex flex-col justify-between`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-blue-400">
                      Turn #{turn.interaction_index}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#0c101b] text-slate-500">
                      Pending Eval
                    </span>
                  </div>
                  <div
                    className="text-[11px] text-slate-300 truncate my-2"
                    title={goalShort}
                  >
                    {goalShort}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {turn.events.length} events • {turn.status}
                  </div>
                </div>
              );
            }

            const tCls = getAlignmentToneClasses(al.tone);
            const devChoice = al.deviationType.choice || 'none';
            const devConf =
              al.deviationType.confidence !== null
                ? `${Math.round(al.deviationType.confidence * 100)}%`
                : '';

            return (
              <motion.div
                key={turn.interaction_index}
                whileHover={{ y: -2 }}
                onClick={() => onSelectTurn(turn.interaction_index)}
                className={`min-w-[250px] max-w-[275px] shrink-0 rounded-xl p-3.5 glass-subcard border ${
                  isSelected
                    ? 'border-violet-400 ring-2 ring-violet-500/35 bg-violet-950/20'
                    : 'border-white/[0.08] hover:border-violet-500/40'
                } cursor-pointer transition flex flex-col justify-between gap-2`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      #{turn.interaction_index}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{turn.status}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${tCls.badge}`}
                  >
                    {al.compositeScore}% {al.verdict}
                  </span>
                </div>

                <div className="text-[11px] text-slate-200 truncate" title={goalShort}>
                  {goalShort}
                </div>

                <div className="flex items-center justify-between gap-1 text-[10px] font-mono">
                  <span className="text-slate-400">Deviation:</span>
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      devChoice === 'none'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {formatDeviationTypeLabel(devChoice)} {devConf ? `(${devConf})` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 pt-1.5 border-t border-white/[0.06] text-[10px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Valid:</span>
                    <span className="text-blue-300 font-semibold">{al.choiceValidityPct}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Adhere:</span>
                    <span className="text-emerald-300 font-semibold">
                      {al.instructionAdherence.score.toFixed(1)}/4
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Goal:</span>
                    <span className="text-sky-300 font-semibold">
                      {al.goalCompletion.score.toFixed(1)}/4
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">DevRisk:</span>
                    <span
                      className={`${
                        al.goalDeviationPct >= 30 ? 'text-rose-300' : 'text-slate-300'
                      } font-semibold`}
                    >
                      {al.goalDeviationPct}%
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
