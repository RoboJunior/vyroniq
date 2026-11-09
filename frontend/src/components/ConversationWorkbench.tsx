'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Braces,
  ChevronDown,
  Copy,
  FileCode,
  GitBranch,
  Layers,
  Maximize2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  EnrichedInteraction,
  NormalizedEvent,
  NormalizedScoreMetric,
} from '@/types/telemetry';
import {
  cleanSingleLinePreview,
  formatDeviationTypeLabel,
  formatTableTimestamp,
  getAlignmentToneClasses,
  safeJsonStringify,
} from '@/lib/telemetry-engine';

interface ConversationWorkbenchProps {
  conversationId: string;
  interactions: EnrichedInteraction[];
  filteredInteractions: EnrichedInteraction[];
  selectedTurnIndex: number | null;
  selectedInspectTarget: string; // 'TURN_ROOT' | 'EVENT::<id>' | 'TOOL::<id>::<idx>'
  isEvaluatingAlignment: boolean;
  onSelectTurn: (turnIndex: number) => void;
  onSelectInspectTarget: (targetKey: string) => void;
  onRefreshAlignment: () => void;
  onOpenJsonModal: (title: string, payload: any) => void;
  onOpenAlignmentModal: (turnIndex: number) => void;
}

function ScoreDistributionCard({
  title,
  metricObj,
  accentColorClass,
  barColorClass,
}: {
  title: string;
  metricObj: NormalizedScoreMetric;
  accentColorClass: string;
  barColorClass: string;
}) {
  const confStr =
    metricObj.confidence !== null ? `${Math.round(metricObj.confidence * 100)}% conf` : '';

  return (
    <div className="glass-subcard rounded-xl p-3 space-y-2 border border-white/[0.07]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-semibold text-slate-200">{title}</span>
        <div className="flex items-center gap-1.5">
          {confStr && <span className="text-[10px] font-mono text-slate-400">{confStr}</span>}
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-white/[0.05] ${accentColorClass}`}
          >
            {metricObj.score.toFixed(2)} / 4.0
          </span>
        </div>
      </div>

      {metricObj.activeLegend && (
        <div className="text-[11px] text-slate-300 bg-[#0c101b] border border-white/[0.05] rounded-lg px-2.5 py-1 font-mono">
          Criterion: <span className={accentColorClass}>{metricObj.activeLegend}</span>
        </div>
      )}

      <div className="space-y-1 pt-0.5">
        {metricObj.distribution.map((d) => {
          const pct = Math.round(d.prob * 100);
          return (
            <div
              key={d.level}
              className="flex items-center gap-2 text-[10px] font-mono"
              title={`${d.label}: ${(d.prob * 100).toFixed(1)}%`}
            >
              <span className="w-4 text-slate-400 font-semibold">{d.level}</span>
              <span className="w-36 truncate text-slate-400">{d.label}</span>
              <div className="flex-1 h-1.5 bg-[#060911] rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColorClass} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-slate-300 tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ConversationWorkbench({
  conversationId,
  interactions,
  filteredInteractions,
  selectedTurnIndex,
  selectedInspectTarget,
  isEvaluatingAlignment,
  onSelectTurn,
  onSelectInspectTarget,
  onRefreshAlignment,
  onOpenJsonModal,
  onOpenAlignmentModal,
}: ConversationWorkbenchProps) {
  const [flowZoom, setFlowZoom] = useState(1);
  const [inspectInlineRawMode, setInspectInlineRawMode] = useState(false);
  const [showTurnEvalInline, setShowTurnEvalInline] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [prettyMode, setPrettyMode] = useState<{ input: boolean; output: boolean }>({
    input: true,
    output: true,
  });
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sec: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return next;
    });
  };

  const activeTurn =
    filteredInteractions.find((t) => t.interaction_index === selectedTurnIndex) ||
    filteredInteractions[0] ||
    null;

  const completedCount = filteredInteractions.filter((t) => t.status === 'COMPLETED').length;
  const evalFiltered = filteredInteractions.filter((t) => t.alignment);
  const avgAlignScore =
    evalFiltered.length > 0
      ? Math.round(
          evalFiltered.reduce((s, t) => s + t.alignment!.compositeScore, 0) / evalFiltered.length
        )
      : null;
  const driftCnt = evalFiltered.filter((t) => t.alignment!.isDeviated).length;
  const errCount = filteredInteractions.filter((t) => t.hasError).length;
  const errRate =
    filteredInteractions.length > 0
      ? ((errCount / filteredInteractions.length) * 100).toFixed(1)
      : '0.0';

  const chartTurns = filteredInteractions.slice(-8);
  const maxEvCount = Math.max(...chartTurns.map((t) => t.events.length), 1);

  const findEventInTurn = (turn: EnrichedInteraction | null, evId: string): NormalizedEvent | null => {
    if (!turn || !Array.isArray(turn.events)) return null;
    return (
      turn.events.find(
        (e) => e.id === evId || e.dedupeKey === evId || String(e.step_index) === String(evId)
      ) || null
    );
  };

  // Resolve right-pane inspector target
  let inspectTitle = activeTurn ? `Interaction #${activeTurn.interaction_index}` : 'No selection';
  let badgeSymbol = activeTurn ? `#${activeTurn.interaction_index}` : '#';
  let badgeColor = 'bg-violet-500 text-white';
  let createdAt = activeTurn?.startTime || null;
  let durationStr = activeTurn?.durationSec !== null && activeTurn?.durationSec !== undefined ? `${activeTurn.durationSec}s` : null;
  let inputTokens = activeTurn?.inputTokens || 0;
  let outputTokens = activeTurn?.outputTokens || 0;
  let cacheReadTokens = activeTurn?.cacheTokens || 0;
  let totalTokens = activeTurn?.totalTokens || 0;
  let modelName = activeTurn ? Array.from(activeTurn.models).join(', ') || 'unspecified-model' : '--';
  let inputContent = activeTurn?.goal || '';
  let outputContent = activeTurn?.finalPlannerResponse || '';
  let toolCallsList = activeTurn?.toolCalls || [];
  let rawPayloadObject: any = activeTurn
    ? activeTurn.alignment
      ? {
          ...activeTurn.rawInteraction,
          alignment_evaluation: activeTurn.alignment.rawEvaluation,
        }
      : activeTurn.rawInteraction || activeTurn
    : null;

  let metadataEntries: [string, any][] = activeTurn
    ? [
        ['conversation_id', conversationId],
        ['interaction_index', activeTurn.interaction_index],
        ['status', activeTurn.status],
        [
          'alignment_score',
          activeTurn.alignment
            ? `${activeTurn.alignment.compositeScore}% (${activeTurn.alignment.verdict})`
            : 'Pending',
        ],
        ['events_count', activeTurn.events.length],
        ['step_range', `#${activeTurn.firstStep} – #${activeTurn.lastStep}`],
        ['models', modelName],
      ]
    : [];

  if (activeTurn && selectedInspectTarget.startsWith('EVENT::')) {
    const evId = selectedInspectTarget.split('::')[1];
    const ev = findEventInTurn(activeTurn, evId);
    if (ev) {
      inspectTitle = `Step #${ev.step_index} (${ev.type})`;
      badgeSymbol =
        ev.type === 'USER_INPUT' ? 'U' : ev.type === 'PLANNER_RESPONSE' ? 'P' : 'G';
      badgeColor =
        ev.type === 'USER_INPUT'
          ? 'bg-emerald-500 text-[#05070b]'
          : ev.type === 'PLANNER_RESPONSE'
          ? 'bg-sky-500 text-white'
          : 'bg-amber-500 text-[#05070b]';
      createdAt = ev.created_at;
      durationStr = null;
      inputTokens = ev.inputTokens;
      outputTokens = ev.outputTokens;
      cacheReadTokens = ev.cacheReadTokens;
      totalTokens = ev.totalTokens;
      modelName = ev.model_name;
      toolCallsList = ev.toolCalls || [];
      rawPayloadObject = ev.rawDocument || ev;

      if (ev.type === 'USER_INPUT') {
        inputContent = ev.userSections?.user_request || ev.rawText || '';
        outputContent =
          ev.userSections?.user_settings_change || ev.userSections?.additional_metadata || '';
      } else {
        inputContent = activeTurn.goal || '';
        outputContent = ev.rawText || '';
      }

      metadataEntries = [
        ['id', ev.id],
        ['conversation_id', ev.conversation_id],
        ['step_index', ev.step_index],
        ['type', ev.type],
        ['source', ev.source],
        ['status', ev.status],
        ['model_name', ev.model_name],
        ['termination_reason', ev.termination_reason || 'None'],
        ['workspace_paths', ev.workspace_paths.join(', ') || 'None'],
      ];
    }
  } else if (activeTurn && selectedInspectTarget.startsWith('TOOL::')) {
    const parts = selectedInspectTarget.split('::');
    const ev = findEventInTurn(activeTurn, parts[1]);
    const tc = ev?.toolCalls[Number(parts[2])];
    if (ev && tc) {
      inspectTitle = `Tool: ${tc.name}`;
      badgeSymbol = 'T';
      badgeColor = 'bg-pink-500 text-white';
      createdAt = ev.created_at;
      durationStr = null;
      inputTokens = ev.inputTokens;
      outputTokens = ev.outputTokens;
      cacheReadTokens = ev.cacheReadTokens;
      totalTokens = ev.totalTokens;
      modelName = ev.model_name;
      inputContent = '```json\n' + JSON.stringify(tc.args || {}, null, 2) + '\n```';
      outputContent = ev.rawText || '';
      toolCallsList = [tc];
      rawPayloadObject = tc;
      metadataEntries = [
        ['tool_call_id', tc.id || 'N/A'],
        ['tool_name', tc.name],
        ['step_index', ev.step_index],
        ['model_name', ev.model_name],
      ];
    }
  }

  const tokenYamlLines: [string, number][] = [
    ['input_tokens', inputTokens],
    ['output_tokens', outputTokens],
    ['cache_read_tokens', cacheReadTokens],
    ['total_tokens', totalTokens],
  ];

  const handleCopyInspectorJson = () => {
    navigator.clipboard.writeText(safeJsonStringify(rawPayloadObject));
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl overflow-hidden shadow-2xl border border-white/[0.09]"
    >
      <div className="convo-workbench-grid divide-y xl:divide-y-0 xl:divide-x divide-white/[0.08]">
        {/* =============================================================== */}
        {/* LEFT PANE: CONVERSATION INTERACTIONS TABLE & TURN CHART         */}
        {/* =============================================================== */}
        <div className="flex flex-col bg-[#080b13]/70 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.07] bg-[#0a0e18] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/antigravity-logo.png"
                alt="Antigravity"
                className="w-4 h-4 rounded-xs object-contain bg-white p-[1px]"
              />
              <span className="text-xs font-bold text-white truncate">
                Conversation Interactions
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30 truncate max-w-[170px]">
              {conversationId}
            </span>
          </div>

          {/* Summary Strip + Turn Step Count Bar Chart */}
          <div className="p-3 border-b border-white/[0.07] bg-[#060911]/60 space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div className="glass-subcard rounded-xl px-2.5 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-300 font-medium">Turns</span>
                  <span className="text-sm font-bold text-white font-mono tabular-nums">
                    {filteredInteractions.length}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">
                  {completedCount} DONE
                </span>
              </div>

              <div className="glass-subcard border border-violet-500/25 rounded-xl px-2.5 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-violet-200 font-medium">Align</span>
                  <span
                    className={`text-sm font-bold font-mono tabular-nums ${
                      avgAlignScore !== null
                        ? driftCnt > 0
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                        : 'text-violet-300'
                    }`}
                  >
                    {avgAlignScore !== null
                      ? `${avgAlignScore}%`
                      : isEvaluatingAlignment
                      ? '…'
                      : '--'}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono ${
                    avgAlignScore !== null
                      ? driftCnt > 0
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                      : 'text-slate-400'
                  }`}
                >
                  {avgAlignScore !== null
                    ? driftCnt > 0
                      ? `${driftCnt} DRIFT`
                      : 'ALIGNED'
                    : 'SystemOne'}
                </span>
              </div>

              <div className="glass-subcard rounded-xl px-2.5 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-300 font-medium">Errors</span>
                  <span className="text-sm font-bold text-white font-mono tabular-nums">
                    {errCount}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">{errRate}%</span>
              </div>
            </div>

            {/* Turn Step Count Bar Chart */}
            <div className="glass-subcard rounded-xl px-3 pt-2 pb-1.5">
              <div className="flex items-stretch gap-2 h-14">
                <div className="flex flex-col justify-between text-[9px] font-mono text-slate-500 pr-1 select-none">
                  <span>{chartTurns.length > 0 ? maxEvCount : 0}</span>
                  <span>0</span>
                </div>
                <div className="flex-1 flex items-end justify-around gap-1.5 border-b border-white/[0.05] pb-1">
                  {chartTurns.length === 0 ? (
                    <div className="text-[11px] font-mono text-slate-600 self-center">
                      No turns
                    </div>
                  ) : (
                    chartTurns.map((t) => {
                      const hPct = Math.max(20, Math.round((t.events.length / maxEvCount) * 100));
                      const isSel = t.interaction_index === activeTurn?.interaction_index;
                      const al = t.alignment;
                      let barColor = isSel
                        ? 'bg-emerald-400 ring-2 ring-emerald-400/40'
                        : 'bg-emerald-500/80 group-hover:bg-emerald-400';
                      if (al && al.tone === 'rose') {
                        barColor = isSel
                          ? 'bg-rose-400 ring-2 ring-rose-400/40'
                          : 'bg-rose-500/80 group-hover:bg-rose-400';
                      } else if (al && al.tone === 'amber') {
                        barColor = isSel
                          ? 'bg-amber-400 ring-2 ring-amber-400/40'
                          : 'bg-amber-500/80 group-hover:bg-amber-400';
                      }

                      return (
                        <div
                          key={t.interaction_index}
                          onClick={() => onSelectTurn(t.interaction_index)}
                          title={`Interaction #${t.interaction_index} (${t.status}) — ${t.events.length} events • ${t.totalTokens.toLocaleString()} tokens`}
                          className="flex-1 max-w-[40px] h-full flex items-end justify-center cursor-pointer group"
                        >
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${hPct}%` }}
                            transition={{ duration: 0.4 }}
                            className={`w-full rounded-t-xs transition-all ${barColor}`}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex items-center justify-around pl-4 pt-1 text-[9px] font-mono text-slate-500">
                {chartTurns.map((t) => (
                  <span key={t.interaction_index} className="flex-1 text-center truncate">
                    #{t.interaction_index}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Interactions Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-[#0a0e18] border-b border-white/[0.08] text-[10px] font-mono uppercase text-slate-400 select-none">
                <tr>
                  <th className="w-12 py-2.5 pl-3 pr-1">Turn</th>
                  <th className="w-24 py-2.5 px-1.5">Created At</th>
                  <th className="py-2.5 px-2 border-l border-white/[0.05]">
                    <div>Goal (User Input)</div>
                    <div className="text-[9px] text-slate-500 font-normal">
                      count {filteredInteractions.filter((t) => t.goal).length}
                    </div>
                  </th>
                  <th className="w-28 py-2.5 px-2 border-l border-white/[0.05]">
                    <div className="text-violet-300">Alignment</div>
                    <div className="text-[9px] text-slate-500 font-normal">
                      eval {filteredInteractions.filter((t) => t.alignment).length}
                    </div>
                  </th>
                  <th className="py-2.5 px-2 border-l border-white/[0.05]">
                    <div>Planner Response</div>
                    <div className="text-[9px] text-slate-500 font-normal">
                      count {filteredInteractions.filter((t) => t.finalPlannerResponse).length}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-white/[0.04]">
                {filteredInteractions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-slate-500 font-mono text-xs"
                    >
                      No interactions match active filters
                    </td>
                  </tr>
                ) : (
                  filteredInteractions.map((turn) => {
                    const isSelected = turn.interaction_index === activeTurn?.interaction_index;
                    const timeStr = turn.startTime
                      ? formatTableTimestamp(turn.startTime)
                      : `Step #${turn.firstStep}`;
                    const goalPreview = cleanSingleLinePreview(turn.goal || '-');
                    const respPreview = turn.finalPlannerResponse
                      ? cleanSingleLinePreview(turn.finalPlannerResponse)
                      : turn.status;
                    const al = turn.alignment;
                    const tCls = al ? getAlignmentToneClasses(al.tone) : null;
                    const devChoice = al?.deviationType.choice || 'none';

                    return (
                      <tr
                        key={turn.interaction_index}
                        onClick={() => onSelectTurn(turn.interaction_index)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-500/15'
                            : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-2.5 pl-3 pr-1 font-mono text-[11px] text-blue-400 font-semibold">
                          #{turn.interaction_index}
                        </td>
                        <td className="py-2.5 px-1.5 font-mono text-[10px] text-slate-300 whitespace-nowrap truncate">
                          {timeStr}
                        </td>
                        <td className="py-2.5 px-2 border-l border-white/[0.04]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-0.5 h-4 rounded-full bg-emerald-400 shrink-0" />
                            <span className="text-slate-200 truncate" title={goalPreview}>
                              {goalPreview}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 border-l border-white/[0.04]">
                          {!al ? (
                            <span className="text-[10px] font-mono text-slate-500">
                              {isEvaluatingAlignment ? '⏳ eval…' : '—'}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${tCls?.badge}`}
                                >
                                  {al.compositeScore}%
                                </span>
                                <span
                                  className={`text-[9px] font-mono truncate ${
                                    devChoice === 'none' ? 'text-emerald-400' : 'text-amber-300'
                                  }`}
                                >
                                  {formatDeviationTypeLabel(devChoice)}
                                </span>
                              </div>
                              <div className="text-[9px] font-mono text-slate-400 truncate">
                                G:{al.goalCompletion.score.toFixed(1)} • I:
                                {al.instructionAdherence.score.toFixed(1)} • V:
                                {al.choiceValidityPct}%
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 border-l border-white/[0.04]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-0.5 h-4 rounded-full bg-indigo-400 shrink-0" />
                            <span className="text-slate-300 truncate" title={respPreview}>
                              {respPreview}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =============================================================== */}
        {/* CENTER PANE: HIERARCHICAL SPAN TREE + TURN EXECUTION FLOW       */}
        {/* =============================================================== */}
        <div className="flex flex-col bg-[#070a12]/60 overflow-hidden">
          {/* Top Half: Span & Event Tree */}
          <div className="flex-1 flex flex-col min-h-[270px] border-b border-white/[0.08] overflow-hidden">
            <div className="px-3.5 py-3 border-b border-white/[0.07] bg-[#0a0e18] flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                Interaction Events ({activeTurn ? activeTurn.events.length : 0})
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {activeTurn ? `Steps #${activeTurn.firstStep} – #${activeTurn.lastStep}` : ''}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {!activeTurn ? (
                <div className="py-10 text-center text-xs font-mono text-slate-500">
                  Select an interaction turn
                </div>
              ) : (
                <>
                  {/* Root Node */}
                  <div
                    onClick={() => onSelectInspectTarget('TURN_ROOT')}
                    className={`rounded-lg py-2 px-2.5 cursor-pointer flex items-start justify-between gap-2 border-l-2 transition ${
                      selectedInspectTarget === 'TURN_ROOT'
                        ? 'bg-violet-500/15 border-l-violet-400'
                        : 'border-l-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-mono font-bold bg-violet-500 text-white shrink-0 mt-0.5">
                        #{activeTurn.interaction_index}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">
                            Interaction #{activeTurn.interaction_index} ({activeTurn.status})
                          </span>
                          {activeTurn.alignment && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                                getAlignmentToneClasses(activeTurn.alignment.tone).badge
                              }`}
                            >
                              🛡️ {activeTurn.alignment.compositeScore}%{' '}
                              {activeTurn.alignment.verdict}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {activeTurn.durationSec !== null ? `⏱ ${activeTurn.durationSec}s • ` : ''}
                          {activeTurn.events.length} events •{' '}
                          {activeTurn.totalTokens.toLocaleString()} tok
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Child Event Nodes */}
                  {activeTurn.events.map((ev, idx) => {
                    const prevEv = idx > 0 ? activeTurn.events[idx - 1] : null;
                    let stepDelta: string | null = null;
                    if (
                      prevEv &&
                      ev.timestampMs &&
                      prevEv.timestampMs &&
                      ev.timestampMs >= prevEv.timestampMs
                    ) {
                      const d = (ev.timestampMs - prevEv.timestampMs) / 1000;
                      if (d <= 300) stepDelta = `${d.toFixed(1)}s`;
                    }

                    const evTargetKey = `EVENT::${ev.id}`;
                    const isEvSelected = selectedInspectTarget === evTargetKey;

                    let badgeClass = 'bg-emerald-500 text-[#05070b]';
                    let badgeSymbol = 'U';
                    if (ev.type === 'PLANNER_RESPONSE') {
                      badgeClass = 'bg-sky-500 text-white';
                      badgeSymbol = 'P';
                    } else if (ev.type === 'GENERIC') {
                      badgeClass = 'bg-amber-500 text-[#05070b]';
                      badgeSymbol = 'G';
                    }

                    return (
                      <React.Fragment key={ev.id}>
                        <div
                          onClick={() => onSelectInspectTarget(evTargetKey)}
                          className={`rounded-lg py-1.5 pr-2.5 pl-6 cursor-pointer flex items-start justify-between gap-2 border-l-2 transition ${
                            isEvSelected
                              ? 'bg-violet-500/15 border-l-violet-400'
                              : 'border-l-transparent hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="text-slate-600 font-mono text-xs -ml-2 select-none">
                              ├
                            </span>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-mono font-bold shrink-0 mt-0.5 ${badgeClass}`}
                            >
                              {badgeSymbol}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-200 truncate">
                                Step #{ev.step_index} • {ev.type}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                                {stepDelta ? `⏱ ${stepDelta} • ` : ''}
                                {ev.totalTokens > 0
                                  ? `${ev.totalTokens.toLocaleString()} tok • `
                                  : ''}
                                {ev.model_name}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Nested Tool Call Nodes */}
                        {ev.toolCalls.map((tc, tcIdx) => {
                          const toolKey = `TOOL::${ev.id}::${tcIdx}`;
                          const isToolSelected = selectedInspectTarget === toolKey;
                          return (
                            <div
                              key={toolKey}
                              onClick={() => onSelectInspectTarget(toolKey)}
                              className={`rounded-lg py-1 pr-2.5 pl-11 cursor-pointer flex items-start justify-between gap-2 border-l-2 transition ${
                                isToolSelected
                                  ? 'bg-pink-500/15 border-l-pink-400'
                                  : 'border-l-transparent hover:bg-white/[0.04]'
                              }`}
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="text-slate-600 font-mono text-xs -ml-2 select-none">
                                  └
                                </span>
                                <span className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-mono font-bold bg-pink-500 text-white shrink-0 mt-0.5">
                                  T
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-mono font-medium text-pink-200 truncate">
                                    {tc.name || 'tool_call'}
                                  </div>
                                  {tc.args?.toolSummary && (
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {tc.args.toolSummary}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Bottom Half: Interactive Step Execution Flow Graph */}
          <div className="h-[45%] min-h-[240px] flex flex-col overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-white/[0.07] bg-[#0a0e18] flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                Turn Execution Flow
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setFlowZoom((z) => Math.max(0.6, Math.min(1.6, +(z + 0.15).toFixed(2))))
                  }
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    setFlowZoom((z) => Math.max(0.6, Math.min(1.6, +(z - 0.15).toFixed(2))))
                  }
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setFlowZoom(1)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 flow-graph-canvas relative overflow-auto flex items-start justify-center p-4">
              {activeTurn && (
                <div
                  style={{ transform: `scale(${flowZoom})` }}
                  className="transition-transform duration-200 origin-top flex flex-col items-center text-[10px] font-mono select-none"
                >
                  {activeTurn.events.map((ev, idx) => {
                    const evKey = `EVENT::${ev.id}`;
                    const isSel = selectedInspectTarget === evKey;

                    let boxStyle = 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200';
                    if (ev.type === 'PLANNER_RESPONSE') {
                      boxStyle = 'bg-sky-500/15 border-sky-400/50 text-sky-200';
                    } else if (ev.type === 'GENERIC') {
                      boxStyle = 'bg-amber-500/15 border-amber-400/50 text-amber-200';
                    }

                    return (
                      <React.Fragment key={ev.id}>
                        <div
                          onClick={() => onSelectInspectTarget(evKey)}
                          className={`px-3 py-1.5 rounded-lg border cursor-pointer transition ${boxStyle} ${
                            isSel
                              ? 'ring-2 ring-white/50 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                              : 'hover:brightness-125'
                          }`}
                        >
                          Step #{ev.step_index}: {ev.type}
                        </div>

                        {ev.toolCalls.length > 0 && (
                          <>
                            <div className="h-3 w-px bg-pink-400/60" />
                            <div className="flex flex-wrap justify-center gap-1.5 max-w-[235px]">
                              {ev.toolCalls.map((tc, tcIdx) => {
                                const tKey = `TOOL::${ev.id}::${tcIdx}`;
                                return (
                                  <div
                                    key={tKey}
                                    onClick={() => onSelectInspectTarget(tKey)}
                                    className="px-2 py-1 rounded-md bg-pink-500/15 border border-pink-400/50 text-pink-200 text-[9px] cursor-pointer hover:bg-pink-500/25 transition"
                                  >
                                    🔧 {tc.name}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}

                        {idx < activeTurn.events.length - 1 && (
                          <div className="h-4 w-px bg-slate-600 relative my-0.5">
                            <span className="absolute -bottom-1.5 -left-[3.5px] text-[8px] text-slate-400">
                              ▼
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* RIGHT PANE: DEEP INSPECTOR                                      */}
        {/* =============================================================== */}
        <div className="flex flex-col bg-[#080b13]/70 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.07] bg-[#0a0e18] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-slate-400 font-medium shrink-0">Inspect:</span>
              <span
                className={`px-1.5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${badgeColor}`}
              >
                {badgeSymbol}
              </span>
              <span className="text-xs font-mono font-semibold text-white truncate">
                {inspectTitle}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setInspectInlineRawMode((prev) => !prev)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition cursor-pointer ${
                  inspectInlineRawMode
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'glass-subcard text-slate-300 hover:text-white border-white/[0.1]'
                }`}
              >
                Inline JSON
              </button>
              <button
                type="button"
                onClick={() => onOpenJsonModal(inspectTitle, rawPayloadObject)}
                className="p-1.5 rounded-lg glass-subcard text-slate-300 hover:text-blue-300 border border-white/[0.1] transition cursor-pointer"
                title="Open in full Raw JSON Modal"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Telemetry Ribbon */}
          <div className="px-4 py-2 border-b border-white/[0.06] bg-[#060911]/80 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
            {createdAt && <span>📅 {formatTableTimestamp(createdAt)}</span>}
            {durationStr && <span>⏱ {durationStr}</span>}
            <span># {totalTokens.toLocaleString()} tok</span>
            <span className="text-blue-300">{modelName}</span>
            {activeTurn?.alignment && (
              <span className="text-violet-300 font-semibold">
                🛡️ Align {activeTurn.alignment.compositeScore}%
              </span>
            )}
            {toolCallsList.length > 0 && (
              <span className="text-pink-300">🔧 {toolCallsList.length} tool(s)</span>
            )}
          </div>

          {/* Inspector Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.07]">
            {!activeTurn ? (
              <div className="p-8 text-center text-xs font-mono text-slate-500">
                Select an interaction turn on the left to inspect
              </div>
            ) : inspectInlineRawMode ? (
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold text-blue-300">
                    Raw JSON ({inspectTitle})
                  </span>
                  <button
                    onClick={handleCopyInspectorJson}
                    className="px-2.5 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-[11px] font-mono transition cursor-pointer"
                  >
                    {copiedRaw ? 'Copied!' : 'Copy JSON'}
                  </button>
                </div>
                <div className="bg-[#05070e] border border-blue-500/25 rounded-xl p-3.5 overflow-x-auto">
                  <pre className="text-xs font-mono text-blue-100 whitespace-pre-wrap break-words select-all">
                    {safeJsonStringify(rawPayloadObject)}
                  </pre>
                </div>
              </div>
            ) : (
              <>
                {/* 0. SYSTEMONE ALIGNMENT METRICS */}
                <div className="p-4 bg-violet-950/[0.08]">
                  <div
                    onClick={() => toggleSection('alignment')}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-violet-200">
                        🛡️ SystemOne Alignment Metrics
                      </span>
                      {activeTurn.alignment ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            getAlignmentToneClasses(activeTurn.alignment.tone).badge
                          }`}
                        >
                          {activeTurn.alignment.compositeScore}% • {activeTurn.alignment.verdict}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono glass-subcard text-slate-400">
                          {isEvaluatingAlignment ? 'Evaluating…' : 'Not Evaluated'}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        !collapsedSections.has('alignment') ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  {!collapsedSections.has('alignment') && (
                    <div className="mt-3 space-y-3">
                      {!activeTurn.alignment ? (
                        <div className="glass-subcard rounded-xl p-3 text-xs font-mono text-slate-400 flex items-center justify-between gap-2">
                          <span>
                            {isEvaluatingAlignment
                              ? 'Computing SystemOne metrics via Ollama…'
                              : 'No evaluation record matched for this turn.'}
                          </span>
                          <button
                            onClick={onRefreshAlignment}
                            className="px-2.5 py-1 rounded bg-violet-500/20 text-violet-200 border border-violet-500/35 text-[11px] hover:bg-violet-500/30 transition cursor-pointer"
                          >
                            ↻ Evaluate
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 glass-subcard rounded-xl px-3 py-2 text-[11px] font-mono">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">Matched Step:</span>
                              <span className="text-white font-semibold">
                                #
                                {activeTurn.alignment.interaction_index ??
                                  activeTurn.interaction_index}
                              </span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400">Status:</span>
                              <span className="text-emerald-300">
                                {activeTurn.alignment.interaction_status || activeTurn.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setShowTurnEvalInline((p) => !p)}
                                className="px-2 py-0.5 rounded bg-violet-500/15 hover:bg-violet-500/25 text-violet-200 border border-violet-500/35 text-[10px] font-mono transition cursor-pointer"
                              >
                                {showTurnEvalInline ? 'Hide JSON' : 'Inline JSON'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenAlignmentModal(activeTurn.interaction_index)
                                }
                                className="px-2 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 text-[10px] font-mono font-semibold transition cursor-pointer"
                              >
                                {'{ }'} Modal
                              </button>
                            </div>
                          </div>

                          {showTurnEvalInline && (
                            <div className="bg-[#05070e] border border-violet-500/40 rounded-xl p-3 space-y-2">
                              <pre className="max-h-56 overflow-y-auto text-[11px] font-mono text-blue-100 whitespace-pre-wrap break-words select-all">
                                {safeJsonStringify(activeTurn.alignment.rawEvaluation)}
                              </pre>
                            </div>
                          )}

                          {/* 3 Noul Gauges */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="glass-subcard rounded-xl p-2.5">
                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                <span>Choice Validity</span>
                                <span className="text-[9px] text-blue-300">noul</span>
                              </div>
                              <div className="text-base font-bold font-mono text-blue-300 my-1">
                                {activeTurn.alignment.choiceValidityPct}%
                              </div>
                              <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-400 rounded-full"
                                  style={{ width: `${activeTurn.alignment.choiceValidityPct}%` }}
                                />
                              </div>
                            </div>

                            <div className="glass-subcard rounded-xl p-2.5">
                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                <span>Goal Deviation</span>
                                <span className="text-[9px] text-rose-300">noul</span>
                              </div>
                              <div
                                className={`text-base font-bold font-mono my-1 ${
                                  activeTurn.alignment.goalDeviationPct >= 30
                                    ? 'text-rose-400'
                                    : 'text-emerald-300'
                                }`}
                              >
                                {activeTurn.alignment.goalDeviationPct}%
                              </div>
                              <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    activeTurn.alignment.goalDeviationPct >= 30
                                      ? 'bg-rose-500'
                                      : 'bg-emerald-400'
                                  }`}
                                  style={{
                                    width: `${Math.max(3, activeTurn.alignment.goalDeviationPct)}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <div className="glass-subcard rounded-xl p-2.5">
                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                <span>Repeated Actions</span>
                                <span className="text-[9px] text-violet-300">noul</span>
                              </div>
                              <div
                                className={`text-base font-bold font-mono my-1 ${
                                  activeTurn.alignment.repeatedActionsPct >= 35
                                    ? 'text-amber-300'
                                    : 'text-violet-300'
                                }`}
                              >
                                {activeTurn.alignment.repeatedActionsPct}%
                              </div>
                              <div className="w-full h-1.5 bg-[#060911] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    activeTurn.alignment.repeatedActionsPct >= 35
                                      ? 'bg-amber-400'
                                      : 'bg-violet-400'
                                  }`}
                                  style={{
                                    width: `${Math.max(
                                      3,
                                      activeTurn.alignment.repeatedActionsPct
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Deviation Classification */}
                          <div className="glass-subcard rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-mono font-semibold text-slate-200">
                                Deviation Classification (choice)
                              </span>
                              <div className="flex items-center gap-1.5">
                                {activeTurn.alignment.deviationType.confidence !== null && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {Math.round(
                                      activeTurn.alignment.deviationType.confidence * 100
                                    )}
                                    % conf
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                    activeTurn.alignment.deviationType.choice === 'none'
                                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                                  }`}
                                >
                                  {formatDeviationTypeLabel(
                                    activeTurn.alignment.deviationType.choice
                                  )}
                                </span>
                              </div>
                            </div>

                            {activeTurn.alignment.deviationType.probabilities.length > 0 && (
                              <div className="space-y-1 pt-1">
                                {activeTurn.alignment.deviationType.probabilities.map((item) => {
                                  const pct = Math.round(item.prob * 100);
                                  const isTop =
                                    item.choice === activeTurn.alignment!.deviationType.choice;
                                  return (
                                    <div
                                      key={item.choice}
                                      className="flex items-center gap-2 text-[10px] font-mono"
                                    >
                                      <span
                                        className={`w-36 truncate ${
                                          isTop ? 'text-white font-semibold' : 'text-slate-400'
                                        }`}
                                      >
                                        {formatDeviationTypeLabel(item.choice)}
                                      </span>
                                      <div className="flex-1 h-1.5 bg-[#060911] rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            item.choice === 'none'
                                              ? 'bg-emerald-400'
                                              : 'bg-amber-400'
                                          }`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className="w-9 text-right text-slate-300 tabular-nums">
                                        {(item.prob * 100).toFixed(0)}%
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* 3 Score Distribution Cards */}
                          <ScoreDistributionCard
                            title="Instruction Adherence (0–4)"
                            metricObj={activeTurn.alignment.instructionAdherence}
                            accentColorClass="text-emerald-300"
                            barColorClass="bg-emerald-400"
                          />
                          <ScoreDistributionCard
                            title="Goal Completion (0–4)"
                            metricObj={activeTurn.alignment.goalCompletion}
                            accentColorClass="text-sky-300"
                            barColorClass="bg-sky-400"
                          />
                          <ScoreDistributionCard
                            title="Deviation Severity (0–4)"
                            metricObj={activeTurn.alignment.deviationSeverity}
                            accentColorClass={
                              activeTurn.alignment.deviationSeverity.score >= 1.5
                                ? 'text-rose-300'
                                : 'text-slate-200'
                            }
                            barColorClass={
                              activeTurn.alignment.deviationSeverity.score >= 1.5
                                ? 'bg-rose-500'
                                : 'bg-violet-400'
                            }
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 1. INPUT / GOAL */}
                <div className="p-4">
                  <div
                    onClick={() => toggleSection('input')}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <span className="text-xs font-semibold text-white">Input / Goal</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        !collapsedSections.has('input') ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {!collapsedSections.has('input') && (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() =>
                            setPrettyMode((p) => ({ ...p, input: !p.input }))
                          }
                          className="px-2 py-0.5 rounded glass-subcard text-[11px] font-mono text-slate-300 hover:border-blue-500/40 cursor-pointer"
                        >
                          {prettyMode.input ? 'Pretty ✨ ⌄' : 'Raw Text ⌄'}
                        </button>
                      </div>
                      <div className="glass-subcard rounded-xl p-3 max-h-[240px] overflow-y-auto">
                        {prettyMode.input ? (
                          <div className="md-prose">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {inputContent || '_Empty_'}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words">
                            {inputContent}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. OUTPUT / PLANNER RESPONSE */}
                <div className="p-4">
                  <div
                    onClick={() => toggleSection('output')}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <span className="text-xs font-semibold text-white">Output / Response</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        !collapsedSections.has('output') ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {!collapsedSections.has('output') && (
                    <div className="mt-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() =>
                            setPrettyMode((p) => ({ ...p, output: !p.output }))
                          }
                          className="px-2 py-0.5 rounded glass-subcard text-[11px] font-mono text-slate-300 hover:border-blue-500/40 cursor-pointer"
                        >
                          {prettyMode.output ? 'Pretty ✨ ⌄' : 'Raw Text ⌄'}
                        </button>
                      </div>
                      <div className="glass-subcard rounded-xl p-3 max-h-[320px] overflow-y-auto">
                        {prettyMode.output ? (
                          <div className="md-prose">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {outputContent || '_No response text in this step_'}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words">
                            {outputContent}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. TOOL CALLS */}
                {toolCallsList.length > 0 && (
                  <div className="p-4">
                    <div
                      onClick={() => toggleSection('tools')}
                      className="flex items-center justify-between cursor-pointer select-none"
                    >
                      <span className="text-xs font-semibold text-white">
                        Tool Calls ({toolCallsList.length})
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform ${
                          !collapsedSections.has('tools') ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                    {!collapsedSections.has('tools') && (
                      <div className="mt-2.5 space-y-2 max-h-[260px] overflow-y-auto">
                        {toolCallsList.map((tc, i) => (
                          <div key={i} className="glass-subcard rounded-xl p-2.5">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="text-pink-300 font-semibold">
                                #{i + 1} {tc.name}
                              </span>
                              {tc.id && (
                                <span className="text-[10px] text-slate-500">{tc.id}</span>
                              )}
                            </div>
                            <pre className="mt-1.5 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(tc.args || {}, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. METADATA */}
                <div className="p-4">
                  <div
                    onClick={() => toggleSection('metadata')}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <span className="text-xs font-semibold text-white">Metadata</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        !collapsedSections.has('metadata') ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {!collapsedSections.has('metadata') && (
                    <div className="mt-2.5 glass-subcard rounded-xl p-3 text-[11px] font-mono space-y-1.5">
                      {metadataEntries.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <span className="text-slate-500 shrink-0">{k}:</span>
                          <span className="text-slate-200 truncate text-right">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. TOKEN USAGE */}
                <div className="p-4">
                  <div
                    onClick={() => toggleSection('tokens')}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <span className="text-xs font-semibold text-white">Token usage</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        !collapsedSections.has('tokens') ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {!collapsedSections.has('tokens') && (
                    <div className="mt-2.5 glass-subcard rounded-xl py-2.5 px-3 font-mono text-[11px] leading-relaxed">
                      {tokenYamlLines.map(([k, v], i) => (
                        <div key={k} className="flex items-baseline gap-3">
                          <span className="w-4 text-right text-slate-600 select-none">
                            {i + 1}
                          </span>
                          <div>
                            <span className="text-sky-400">{k}</span>
                            <span className="text-slate-400">: </span>
                            <span className="text-blue-300 font-semibold">{String(v)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
