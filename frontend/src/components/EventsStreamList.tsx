'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, Maximize2 } from 'lucide-react';
import { NormalizedEvent } from '@/types/telemetry';
import {
  formatFullTimestamp,
  formatRelativeTime,
  safeJsonStringify,
} from '@/lib/telemetry-engine';

const PAGE_SIZE = 40;
const REMARK_PLUGINS = [remarkGfm];

interface EventsStreamListProps {
  events: NormalizedEvent[];
  newlyArrivedIds: Set<string>;
  onSelectModel: (modelName: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onOpenRawModal: (eventId: string) => void;
  onResetFilters: () => void;
}

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md-prose">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{text}</ReactMarkdown>
    </div>
  );
});

interface EventCardProps {
  ev: NormalizedEvent;
  isNew: boolean;
  onSelectModel: (modelName: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onOpenRawModal: (eventId: string) => void;
}

const EventCard = memo(function EventCard({
  ev,
  isNew,
  onSelectModel,
  onSelectConversation,
  onOpenRawModal,
}: EventCardProps) {
  const [isRawView, setIsRawView] = useState(false);

  let borderAccent = 'border-l-emerald-500';
  let badgeStyle = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
  let labelText = 'GENERIC OUTPUT';
  if (ev.type === 'USER_INPUT') {
    borderAccent = 'border-l-sky-500';
    badgeStyle = 'bg-sky-500/10 text-sky-300 border-sky-500/25';
    labelText = 'USER INPUT';
  } else if (ev.type === 'PLANNER_RESPONSE') {
    borderAccent = 'border-l-purple-500';
    badgeStyle = 'bg-purple-500/10 text-purple-300 border-purple-500/25';
    labelText = 'PLANNER RESPONSE';
  }

  const timeFormatted = ev.created_at ? formatFullTimestamp(ev.created_at) : 'No timestamp';
  const relTime = ev.created_at ? formatRelativeTime(ev.created_at) : '';
  const reqText = ev.userSections?.user_request || ev.rawText || '';
  const metaText = ev.userSections?.additional_metadata || null;
  const settingsChange = ev.userSections?.user_settings_change || null;

  return (
    <article
      className={`stream-card glass-panel rounded-2xl border-l-4 ${borderAccent} p-4 sm:p-5 ${
        isNew ? 'flash-new-event' : ''
      }`}
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md glass-subcard text-xs font-mono font-bold text-white">
            Step #{ev.step_index}
          </span>
          <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold border ${badgeStyle}`}>
            {labelText}
          </span>
          <button
            onClick={() => onSelectModel(ev.model_name)}
            className="px-2.5 py-0.5 rounded-md text-[11px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/25 hover:bg-blue-500/20 transition cursor-pointer"
          >
            {ev.model_name}
          </button>
          <button
            onClick={() => onSelectConversation(ev.conversation_id)}
            className="px-2.5 py-0.5 rounded-md text-[11px] font-mono glass-subcard text-slate-300 hover:text-blue-300 transition cursor-pointer"
            title="Open Conversation Interactions Workbench"
          >
            Session: {ev.conversation_id.slice(0, 8)}…
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          {ev.totalTokens > 0 && (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-0.5 rounded-md glass-subcard text-[11px]">
              <span className="text-blue-300">In: {ev.inputTokens.toLocaleString()}</span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-300">Cache: {ev.cacheReadTokens.toLocaleString()}</span>
              <span className="text-slate-600">|</span>
              <span className="text-purple-300">Out: {ev.outputTokens.toLocaleString()}</span>
            </div>
          )}
          <span className="text-slate-400 text-[11px]" title={timeFormatted}>
            {relTime}
          </span>
          <button
            onClick={() => setIsRawView((v) => !v)}
            className={`px-2.5 py-0.5 rounded-md text-[11px] border transition cursor-pointer ${
              isRawView
                ? 'bg-blue-600 text-white border-blue-500'
                : 'glass-subcard text-slate-300 hover:border-slate-500'
            }`}
          >
            {isRawView ? 'Formatted' : 'Raw'}
          </button>
          <button
            onClick={() => onOpenRawModal(ev.id)}
            className="p-1 rounded-md glass-subcard text-slate-400 hover:text-blue-300 transition cursor-pointer"
            title="Open in Modal Inspector"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Card Body */}
      {isRawView ? (
        <div className="glass-subcard rounded-xl p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-[480px] overflow-y-auto">
          <pre className="whitespace-pre-wrap break-words">{safeJsonStringify(ev.rawDocument)}</pre>
        </div>
      ) : ev.type === 'USER_INPUT' ? (
        <div className="space-y-3">
          {settingsChange && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-3.5 py-2 flex items-center justify-between gap-2">
              <span className="text-xs font-mono text-blue-300 font-semibold">Model / Setting Change</span>
              <span className="text-xs font-mono text-slate-200">{settingsChange}</span>
            </div>
          )}
          {reqText && (
            <div className="glass-subcard rounded-xl p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-sky-400 mb-1.5 font-semibold">
                User Prompt
              </div>
              <Markdown text={reqText} />
            </div>
          )}
          {metaText && (
            <details className="glass-subcard rounded-xl px-3.5 py-2 text-xs">
              <summary className="cursor-pointer font-mono text-[11px] text-slate-400 hover:text-slate-200 select-none">
                Additional Metadata
              </summary>
              <pre className="mt-2 pt-2 border-t border-white/[0.05] text-[11px] font-mono text-slate-400 whitespace-pre-wrap">
                {metaText}
              </pre>
            </details>
          )}
        </div>
      ) : ev.type === 'PLANNER_RESPONSE' ? (
        <div className="space-y-3">
          {ev.rawText && (
            <div className="glass-subcard rounded-xl p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-purple-300 mb-2 font-semibold">
                Response (Markdown)
              </div>
              <Markdown text={ev.rawText} />
            </div>
          )}
          {ev.toolCalls.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Tool Invocations ({ev.toolCalls.length})
              </div>
              <div className="grid grid-cols-1 gap-2">
                {ev.toolCalls.map((tc, idx) => {
                  const name = tc.name || 'tool';
                  const args = tc.args || {};
                  const summary = args.toolSummary || args.Path || args.CommandLine || '';
                  return (
                    <div key={idx} className="glass-subcard rounded-xl overflow-hidden border border-white/[0.07]">
                      <div className="px-3 py-2 bg-[#0a0e18] border-b border-white/[0.05] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold shrink-0">
                            #{idx + 1} {name}
                          </span>
                          {summary && <span className="text-slate-300 truncate max-w-md">{String(summary)}</span>}
                        </div>
                        {tc.id && <span className="text-[10px] text-slate-500">{tc.id}</span>}
                      </div>
                      <div className="p-3 text-xs font-mono">
                        <pre className="text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {JSON.stringify(args, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : ev.rawText ? (
        <div className="glass-subcard rounded-xl p-3.5">
          <Markdown text={ev.rawText} />
        </div>
      ) : (
        <div className="glass-subcard rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>
            Step #{ev.step_index} completed ({ev.status})
          </span>
          <span>Source: {ev.source}</span>
        </div>
      )}
    </article>
  );
});

export default function EventsStreamList({
  events,
  newlyArrivedIds,
  onSelectModel,
  onSelectConversation,
  onOpenRawModal,
  onResetFilters,
}: EventsStreamListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Stable callback refs so memoized cards don't re-render when parent re-renders
  const handlersRef = useRef({ onSelectModel, onSelectConversation, onOpenRawModal });
  handlersRef.current = { onSelectModel, onSelectConversation, onOpenRawModal };
  const stableSelectModel = useCallback((m: string) => handlersRef.current.onSelectModel(m), []);
  const stableSelectConvo = useCallback((c: string) => handlersRef.current.onSelectConversation(c), []);
  const stableOpenRaw = useCallback((id: string) => handlersRef.current.onOpenRawModal(id), []);

  // Infinite scroll: load next page when the sentinel enters the viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, events.length));
        }
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [events.length, visibleCount]);

  if (events.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center">
        <div className="text-slate-400 font-mono text-xs">No telemetry events match your active filters.</div>
        <button
          onClick={onResetFilters}
          className="mt-3.5 px-4 py-1.5 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/30 text-xs font-mono hover:bg-blue-500/25 transition cursor-pointer"
        >
          Reset Filters
        </button>
      </div>
    );
  }

  const visible = events.slice(0, visibleCount);
  const hasMore = visibleCount < events.length;

  return (
    <div className="space-y-3">
      {visible.map((ev) => (
        <EventCard
          key={ev.id}
          ev={ev}
          isNew={newlyArrivedIds.has(ev.id)}
          onSelectModel={stableSelectModel}
          onSelectConversation={stableSelectConvo}
          onOpenRawModal={stableOpenRaw}
        />
      ))}

      <div ref={sentinelRef} className="h-px" />

      <div className="flex items-center justify-center py-3 text-[11px] font-mono text-slate-500 gap-2">
        {hasMore ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>
              Showing {visibleCount} of {events.length.toLocaleString()} events
            </span>
            <button
              onClick={() => setVisibleCount(events.length)}
              className="ml-2 px-2 py-0.5 rounded-md glass-subcard text-slate-300 hover:text-white cursor-pointer"
            >
              Show all
            </button>
          </>
        ) : (
          <span>All {events.length.toLocaleString()} events loaded</span>
        )}
      </div>
    </div>
  );
}
