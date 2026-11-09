'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUpDown,
  CheckSquare,
  Filter,
  Layers,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  EnrichedInteraction,
  NormalizedEvent,
  TelemetryFilters,
} from '@/types/telemetry';
import {
  buildFallbackInteractionsFromNormalized,
  computeConversationsList,
  computeModelMetricsAndSwitches,
  fetchAllEventsPaginated,
  fetchConversationWithInteractions,
  getEffectiveEvents,
  normalizeEvent,
  processBackendInteractions,
  safeJsonStringify,
} from '@/lib/telemetry-engine';

import Navbar from '@/components/Navbar';
import AgentsDirectoryView from '@/components/AgentsDirectoryView';
import AgentProfileHero from '@/components/AgentProfileHero';
import ExecutiveKpiGrid from '@/components/ExecutiveKpiGrid';
import ModelTelemetryMatrix from '@/components/ModelTelemetryMatrix';
import DeepInsightsGrid from '@/components/DeepInsightsGrid';
import AlignmentMatrixSection from '@/components/AlignmentMatrixSection';
import ConversationWorkbench from '@/components/ConversationWorkbench';
import EventsStreamList from '@/components/EventsStreamList';
import RawJsonModal from '@/components/RawJsonModal';
import CommandPaletteModal from '@/components/CommandPaletteModal';

export default function ObservabilityDashboardPage() {
  // Primary View & Sub-Mode
  const [activeTab, setActiveTab] = useState<'overview' | 'antigravity'>('antigravity');
  const [convoDisplaySubMode, setConvoDisplaySubMode] = useState<'interactions' | 'events'>(
    'interactions'
  );

  // Core Data State
  const [allEvents, setAllEvents] = useState<NormalizedEvent[]>([]);
  const [conversationEvents, setConversationEvents] = useState<NormalizedEvent[] | null>(null);
  const [conversationInteractions, setConversationInteractions] = useState<any[]>([]);
  const [conversationEvaluations, setConversationEvaluations] = useState<any[]>([]);
  const [isEvaluatingAlignment, setIsEvaluatingAlignment] = useState<boolean>(false);

  // Workbench Selection State
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [selectedInspectTarget, setSelectedInspectTarget] = useState<string>('TURN_ROOT');

  // Stream & Sync Controls
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [backendConnected, setBackendConnected] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('--:--:--');
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(5000);

  // Filter & Sort Controls
  const [dedupeSteps, setDedupeSteps] = useState<boolean>(true);
  const [sortNewestFirst, setSortNewestFirst] = useState<boolean>(true);
  const [filters, setFilters] = useState<TelemetryFilters>({
    type: 'ALL',
    conversationId: 'ALL',
    workspace: 'ALL',
    toolName: 'ALL',
    modelName: 'ALL',
    search: '',
  });

  // Modals
  const [rawModalState, setRawModalState] = useState<{
    isOpen: boolean;
    title: string;
    payload: any;
  }>({
    isOpen: false,
    title: 'Payload',
    payload: null,
  });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Refs for background polling & caching
  const knownEventIdsRef = useRef<Set<string>>(new Set());
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Set<string>>(new Set());
  const evaluationsByConvoRef = useRef<Map<string, any[]>>(new Map());
  const convoEventsSigByConvoRef = useRef<Map<string, string>>(new Map());
  const fetchSeqRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const activeConvoIdRef = useRef<string>('ALL');
  const globalSigRef = useRef<string>('');
  const allEventsRef = useRef<NormalizedEvent[]>([]);

  useEffect(() => {
    activeConvoIdRef.current = filters.conversationId;
  }, [filters.conversationId]);

  // Keyboard shortcut for Command Palette (Ctrl+K / Cmd+K) and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setRawModalState((prev) => ({ ...prev, isOpen: false }));
        setIsCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch All Data (Global + Active Conversation)
  const fetchAllData = useCallback(async (options: { silent?: boolean } = {}) => {
    const isSilent = Boolean(options.silent);
    if (isFetchingRef.current && isSilent) return;

    const reqId = ++fetchSeqRef.current;
    isFetchingRef.current = true;
    if (!isSilent) setIsFetching(true);

    try {
      const rawAll = await fetchAllEventsPaginated();
      if (reqId !== fetchSeqRef.current) return;

      setBackendConnected(true);

      // Skip re-normalizing & re-rendering when the backend data hasn't changed
      const globalSig = `${rawAll.length}::${rawAll[rawAll.length - 1]?.id || 'none'}::${
        rawAll[0]?.id || 'none'
      }`;
      const globalUnchanged = isSilent && globalSig === globalSigRef.current;
      globalSigRef.current = globalSig;

      let normalizedAll: NormalizedEvent[];
      if (globalUnchanged) {
        normalizedAll = allEventsRef.current;
      } else {
        normalizedAll = rawAll.map((ev, idx) => normalizeEvent(ev, idx));

        const isFirstLoad = knownEventIdsRef.current.size === 0;
        const newlyFound = new Set<string>();
        normalizedAll.forEach((ev) => {
          if (!knownEventIdsRef.current.has(ev.id)) {
            knownEventIdsRef.current.add(ev.id);
            if (!isFirstLoad) newlyFound.add(ev.id);
          }
        });

        allEventsRef.current = normalizedAll;
        setAllEvents(normalizedAll);
        if (newlyFound.size > 0) {
          setNewlyArrivedIds(newlyFound);
        }
      }

      const targetConvoId = activeConvoIdRef.current;
      if (targetConvoId !== 'ALL') {
        const fallbackEvents = normalizedAll.filter((e) => e.conversation_id === targetConvoId);
        const convoSig = `${fallbackEvents.length}::${
          fallbackEvents[fallbackEvents.length - 1]?.id || 'none'
        }`;
        const prevConvoSig = convoEventsSigByConvoRef.current.get(targetConvoId);
        const hasCachedEvals = evaluationsByConvoRef.current.has(targetConvoId);

        const shouldRefetchConvo = !isSilent || convoSig !== prevConvoSig || !hasCachedEvals;

        if (shouldRefetchConvo) {
          setIsEvaluatingAlignment(true);
          try {
            const convoData = await fetchConversationWithInteractions(targetConvoId);
            if (reqId !== fetchSeqRef.current) return;

            const rawConvoEvents =
              Array.isArray(convoData.events) && convoData.events.length > 0
                ? convoData.events
                : fallbackEvents.map((e) => e.rawDocument);
            const nextConvoEvents = rawConvoEvents.map((ev: any, idx: number) =>
              normalizeEvent(ev, idx)
            );
            const nextConvoInteractions =
              Array.isArray(convoData.interactions) && convoData.interactions.length > 0
                ? convoData.interactions
                : buildFallbackInteractionsFromNormalized(nextConvoEvents);

            setConversationEvents(nextConvoEvents);
            setConversationInteractions(nextConvoInteractions);

            if (Array.isArray(convoData.evaluations)) {
              setConversationEvaluations(convoData.evaluations);
              evaluationsByConvoRef.current.set(targetConvoId, convoData.evaluations);
            } else if (evaluationsByConvoRef.current.has(targetConvoId)) {
              setConversationEvaluations(evaluationsByConvoRef.current.get(targetConvoId) || []);
            }
            convoEventsSigByConvoRef.current.set(targetConvoId, convoSig);
          } catch (convoErr) {
            setConversationEvents(fallbackEvents);
            setConversationInteractions(buildFallbackInteractionsFromNormalized(fallbackEvents));
            setConversationEvaluations(evaluationsByConvoRef.current.get(targetConvoId) || []);
          } finally {
            setIsEvaluatingAlignment(false);
          }
        }
      } else {
        // Functional updates return the same reference when already empty → no re-render
        setConversationEvents((prev) => (prev === null ? prev : null));
        setConversationInteractions((prev) => (prev.length === 0 ? prev : []));
        setConversationEvaluations((prev) => (prev.length === 0 ? prev : []));
      }

      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Backend stream error:', err);
      setBackendConnected(false);
    } finally {
      if (reqId === fetchSeqRef.current) {
        isFetchingRef.current = false;
        setIsFetching(false);
      }
    }
  }, []);

  // Initial Load & Polling Effect
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      fetchAllData({ silent: true });
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [isStreaming, pollIntervalMs, fetchAllData]);

  // Select a Conversation Session
  const handleSelectConversation = useCallback(
    async (
      cid: string,
      options: { preserveTurnSelection?: boolean; skipScroll?: boolean } = {}
    ) => {
      activeConvoIdRef.current = cid;
      setFilters((prev) => ({ ...prev, conversationId: cid }));
      setConvoDisplaySubMode('interactions');

      if (cid === 'ALL') {
        setSelectedTurnIndex(null);
        setSelectedInspectTarget('TURN_ROOT');
        setConversationEvents(null);
        setConversationInteractions([]);
        setConversationEvaluations([]);
        setIsEvaluatingAlignment(false);
        return;
      }

      // Immediate zero-latency population from in-memory events
      const immediateEvents = allEvents.filter((e) => e.conversation_id === cid);
      setConversationEvents(immediateEvents);
      setConversationInteractions(buildFallbackInteractionsFromNormalized(immediateEvents));
      setConversationEvaluations(evaluationsByConvoRef.current.get(cid) || []);
      setIsEvaluatingAlignment(true);

      if (!options.preserveTurnSelection) {
        setSelectedTurnIndex(null);
        setSelectedInspectTarget('TURN_ROOT');
      }

      if (!options.skipScroll) {
        setTimeout(() => {
          const el =
            document.getElementById('alignmentMatrixAnchor') ||
            document.getElementById('bottomTraceAnchor');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }

      try {
        const convoData = await fetchConversationWithInteractions(cid);
        if (activeConvoIdRef.current !== cid) return;
        if (Array.isArray(convoData.events) && convoData.events.length > 0) {
          setConversationEvents(
            convoData.events.map((ev: any, idx: number) => normalizeEvent(ev, idx))
          );
        }
        if (Array.isArray(convoData.interactions) && convoData.interactions.length > 0) {
          setConversationInteractions(convoData.interactions);
        }
        if (Array.isArray(convoData.evaluations)) {
          setConversationEvaluations(convoData.evaluations);
          evaluationsByConvoRef.current.set(cid, convoData.evaluations);
        }
        const convoSig = `${immediateEvents.length}::${
          immediateEvents[immediateEvents.length - 1]?.id || 'none'
        }`;
        convoEventsSigByConvoRef.current.set(cid, convoSig);
      } catch (e) {
        console.warn('Using client-side interactions fallback for conversation:', cid, e);
      } finally {
        if (activeConvoIdRef.current === cid) {
          setIsEvaluatingAlignment(false);
        }
      }
    },
    [allEvents]
  );

  // Refresh SystemOne Alignment Evaluations for active session
  const handleRefreshAlignment = useCallback(async () => {
    const cid = filters.conversationId;
    if (!cid || cid === 'ALL' || isEvaluatingAlignment) return;
    setIsEvaluatingAlignment(true);
    try {
      const convoData = await fetchConversationWithInteractions(cid);
      if (activeConvoIdRef.current !== cid) return;
      if (Array.isArray(convoData.events) && convoData.events.length > 0) {
        setConversationEvents(
          convoData.events.map((ev: any, idx: number) => normalizeEvent(ev, idx))
        );
      }
      if (Array.isArray(convoData.interactions) && convoData.interactions.length > 0) {
        setConversationInteractions(convoData.interactions);
      }
      if (Array.isArray(convoData.evaluations)) {
        setConversationEvaluations(convoData.evaluations);
        evaluationsByConvoRef.current.set(cid, convoData.evaluations);
      }
    } catch (e) {
      console.warn('Alignment refresh failed:', e);
    } finally {
      setIsEvaluatingAlignment(false);
    }
  }, [filters.conversationId, isEvaluatingAlignment]);

  // Derived & Memoized Telemetry Data
  const deferredSearch = useDeferredValue(filters.search);
  const isConvoSelected = filters.conversationId !== 'ALL';
  const baseEvents = useMemo(
    () => (isConvoSelected ? conversationEvents || [] : allEvents),
    [isConvoSelected, conversationEvents, allEvents]
  );

  const effectiveEvents = useMemo(
    () => getEffectiveEvents(baseEvents, dedupeSteps),
    [baseEvents, dedupeSteps]
  );

  const effectiveGlobal = useMemo(
    () => getEffectiveEvents(allEvents, dedupeSteps),
    [allEvents, dedupeSteps]
  );

  const modelScopedEvents = useMemo(
    () =>
      filters.modelName === 'ALL'
        ? effectiveEvents
        : effectiveEvents.filter((e) => e.model_name === filters.modelName),
    [effectiveEvents, filters.modelName]
  );

  const { modelsList, switchEvents } = useMemo(
    () => computeModelMetricsAndSwitches(effectiveEvents),
    [effectiveEvents]
  );

  const conversationsList = useMemo(
    () => computeConversationsList(effectiveGlobal),
    [effectiveGlobal]
  );

  const processedInteractions = useMemo(() => {
    if (!isConvoSelected) return [];
    const sourceInteractions =
      (!conversationInteractions || conversationInteractions.length === 0) &&
      baseEvents.length > 0
        ? buildFallbackInteractionsFromNormalized(baseEvents)
        : conversationInteractions;
    const sourceEvaluations =
      conversationEvaluations && conversationEvaluations.length > 0
        ? conversationEvaluations
        : evaluationsByConvoRef.current.get(filters.conversationId) || [];

    return processBackendInteractions(sourceInteractions, sourceEvaluations, dedupeSteps);
  }, [
    isConvoSelected,
    conversationInteractions,
    conversationEvaluations,
    baseEvents,
    filters.conversationId,
    dedupeSteps,
  ]);

  // Ensure selectedTurnIndex defaults to latest turn when a conversation is opened
  useEffect(() => {
    if (isConvoSelected && processedInteractions.length > 0) {
      const exists = processedInteractions.some(
        (t) => t.interaction_index === selectedTurnIndex
      );
      if (!exists) {
        setSelectedTurnIndex(
          processedInteractions[processedInteractions.length - 1].interaction_index
        );
        setSelectedInspectTarget('TURN_ROOT');
      }
    }
  }, [isConvoSelected, processedInteractions, selectedTurnIndex]);

  // Filtered Interactions for Workbench
  const filteredInteractions = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const list = processedInteractions.filter((turn) => {
      if (filters.modelName !== 'ALL' && !turn.models.has(filters.modelName)) return false;
      if (
        filters.toolName !== 'ALL' &&
        !turn.toolCalls.some((tc) => tc.name === filters.toolName)
      )
        return false;
      if (filters.type !== 'ALL' && !turn.events.some((e) => e.type === filters.type))
        return false;
      if (query) {
        const hay = (
          turn.goal +
          ' ' +
          JSON.stringify(turn.rawInteraction) +
          ' ' +
          JSON.stringify(turn.alignment?.rawEvaluation || {})
        ).toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const diff = a.interaction_index - b.interaction_index;
      return sortNewestFirst ? -diff : diff;
    });
  }, [processedInteractions, filters.modelName, filters.toolName, filters.type, deferredSearch, sortNewestFirst]);

  // Filtered Individual Events for Stream View
  const filteredStreamEvents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const list = effectiveEvents.filter((ev) => {
      if (filters.type !== 'ALL' && ev.type !== filters.type) return false;
      if (filters.modelName !== 'ALL' && ev.model_name !== filters.modelName) return false;
      if (filters.workspace !== 'ALL' && !ev.workspace_paths.includes(filters.workspace))
        return false;
      if (
        filters.toolName !== 'ALL' &&
        !ev.toolCalls.some((tc) => tc.name === filters.toolName)
      )
        return false;
      if (query) {
        const hay = JSON.stringify(ev.rawDocument).toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const stepDiff = a.step_index - b.step_index || a.timestampMs - b.timestampMs;
      return sortNewestFirst ? -stepDiff : stepDiff;
    });
  }, [effectiveEvents, filters.type, filters.modelName, filters.workspace, filters.toolName, deferredSearch, sortNewestFirst]);

  // Type counts for Filter Bar
  const typeCounts = useMemo(() => {
    let user = 0,
      planner = 0,
      generic = 0;
    modelScopedEvents.forEach((ev) => {
      if (ev.type === 'USER_INPUT') user++;
      else if (ev.type === 'PLANNER_RESPONSE') planner++;
      else generic++;
    });
    return {
      all: modelScopedEvents.length,
      user,
      planner,
      generic,
    };
  }, [modelScopedEvents]);

  // Global summary for Directory View
  const directorySummary = useMemo(() => {
    const models = new Set<string>();
    let tokens = 0;
    let cacheTok = 0;
    let inTok = 0;
    let tools = 0;
    const toolMap = new Map<string, number>();

    effectiveGlobal.forEach((e) => {
      models.add(e.model_name);
      tokens += e.totalTokens;
      cacheTok += e.cacheReadTokens;
      inTok += e.inputTokens;
      tools += e.toolCalls.length;
      e.toolCalls.forEach((tc) => {
        const n = tc.name || 'unknown';
        toolMap.set(n, (toolMap.get(n) || 0) + 1);
      });
    });

    const cacheHitPct =
      inTok + cacheTok > 0 ? ((cacheTok / (inTok + cacheTok)) * 100).toFixed(1) : '0.0';
    const sortedTools = Array.from(toolMap.entries()).sort((a, b) => b[1] - a[1]);

    return {
      modelsCount: models.size,
      totalTokens: tokens,
      toolsCount: tools,
      cacheHitPct,
      sortedTools,
    };
  }, [effectiveGlobal]);

  // Inspect Model Switch Event handler
  const handleInspectModelSwitch = useCallback(
    async (conversationId: string, stepIndex: number, eventId: string) => {
      setFilters((prev) => ({
        ...prev,
        type: 'ALL',
        toolName: 'ALL',
        search: '',
      }));

      await handleSelectConversation(conversationId, {
        preserveTurnSelection: true,
        skipScroll: true,
      });

      const targetEvents = allEvents.filter((e) => e.conversation_id === conversationId);
      const fallbackTurns = processBackendInteractions(
        buildFallbackInteractionsFromNormalized(targetEvents),
        evaluationsByConvoRef.current.get(conversationId) || [],
        dedupeSteps
      );

      for (const turn of fallbackTurns) {
        const found = turn.events.find(
          (e) => e.id === eventId || Number(e.step_index) === Number(stepIndex)
        );
        if (found) {
          setSelectedTurnIndex(turn.interaction_index);
          setSelectedInspectTarget(`EVENT::${found.id}`);
          break;
        }
      }

      setTimeout(() => {
        const el = document.getElementById('bottomTraceAnchor');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [allEvents, dedupeSteps, handleSelectConversation]
  );

  // Open Raw Modal for Event ID
  const handleOpenEventRawModal = useCallback(
    (eventId: string) => {
      const turnEvents = processedInteractions.flatMap((t) => t.events || []);
      const pool = [...turnEvents, ...(conversationEvents || []), ...allEvents];
      const ev = pool.find(
        (e) =>
          e.id === eventId || e.dedupeKey === eventId || String(e.step_index) === String(eventId)
      );
      if (!ev) return;
      setRawModalState({
        isOpen: true,
        title: `Step #${ev.step_index} • ${ev.type} • ${ev.model_name}`,
        payload: ev.rawDocument || ev,
      });
    },
    [processedInteractions, conversationEvents, allEvents]
  );

  // Open Alignment Modal
  const handleOpenAlignmentModal = useCallback(
    (turnIndex: number | null) => {
      const allSessionEvals =
        conversationEvaluations.length > 0
          ? conversationEvaluations
          : processedInteractions
              .map((t) => t.alignment?.rawEvaluation || t.alignment)
              .filter(Boolean);

      if (turnIndex !== null && turnIndex !== undefined) {
        const turn =
          processedInteractions.find((t) => Number(t.interaction_index) === Number(turnIndex)) ||
          processedInteractions[0];
        if (turn && turn.alignment) {
          setRawModalState({
            isOpen: true,
            title: `Turn #${turn.interaction_index} SystemOne Evaluation (${turn.alignment.compositeScore}% ${turn.alignment.verdict})`,
            payload: turn.alignment.rawEvaluation || turn.alignment,
          });
          return;
        }
      }

      setRawModalState({
        isOpen: true,
        title: `Session SystemOne Evaluations (${allSessionEvals.length} turns)`,
        payload: allSessionEvals,
      });
    },
    [conversationEvaluations, processedInteractions]
  );

  // Export Telemetry Snapshot
  const handleExportTelemetry = useCallback(() => {
    const snapshot = {
      exported_at: new Date().toISOString(),
      scope: filters.conversationId,
      total_events: effectiveEvents.length,
      events: effectiveEvents.map((e) => e.rawDocument),
      evaluations: conversationEvaluations,
    };
    const blob = new Blob([safeJsonStringify(snapshot)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity-telemetry-${filters.conversationId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filters.conversationId, effectiveEvents, conversationEvaluations]);

  const handleResetAllFilters = useCallback(() => {
    setFilters((prev) => ({
      type: 'ALL',
      conversationId: prev.conversationId,
      workspace: 'ALL',
      toolName: 'ALL',
      modelName: 'ALL',
      search: '',
    }));
  }, []);

  const hasActiveFilters =
    filters.modelName !== 'ALL' ||
    filters.workspace !== 'ALL' ||
    filters.toolName !== 'ALL' ||
    filters.search.trim() !== '';

  // Alignment Summary for Mode Bar
  const evalTurns = processedInteractions.filter((i) => i.alignment);
  const meanAlign =
    evalTurns.length > 0
      ? Math.round(
          evalTurns.reduce((s, t) => s + t.alignment!.compositeScore, 0) / evalTurns.length
        )
      : null;
  const driftedTurnsCount = evalTurns.filter((t) => t.alignment!.isDeviated).length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        onSwitchTab={setActiveTab}
        totalEventsCount={effectiveGlobal.length}
        lastSyncTime={lastSyncTime}
        isStreaming={isStreaming}
        isFetching={isFetching}
        backendConnected={backendConnected}
        pollIntervalMs={pollIntervalMs}
        onChangePollInterval={setPollIntervalMs}
        onToggleStream={() => setIsStreaming((prev) => !prev)}
        onManualRefresh={() => fetchAllData({ silent: false })}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onExportTelemetry={handleExportTelemetry}
      />

      {/* VIEW 1: AGENTS DIRECTORY / OVERVIEW */}
      {activeTab === 'overview' ? (
        <AgentsDirectoryView
          totalEvents={effectiveGlobal.length}
          modelsCount={directorySummary.modelsCount}
          totalTokens={directorySummary.totalTokens}
          conversationsCount={conversationsList.length}
          toolsCount={directorySummary.toolsCount}
          cacheHitPct={directorySummary.cacheHitPct}
          onOpenAntigravity={() => setActiveTab('antigravity')}
        />
      ) : (
        /* VIEW 2: ANTIGRAVITY TELEMETRY WORKSPACE */
        <main className="max-w-[1680px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* 1. Antigravity Agent Profile Hero */}
          <AgentProfileHero
            allEvents={effectiveGlobal}
            selectedWorkspace={filters.workspace}
            onSelectWorkspace={(ws) =>
              setFilters((prev) => ({
                ...prev,
                workspace: prev.workspace === ws ? 'ALL' : ws,
              }))
            }
            onSelectConversation={(cid) => handleSelectConversation(cid)}
          />

          {/* 2. Executive 6-Card KPI Bento Grid */}
          <ExecutiveKpiGrid
            events={modelScopedEvents}
            rawEventsCount={baseEvents.length}
            isConvoSelected={isConvoSelected}
            conversationId={filters.conversationId}
            processedInteractions={processedInteractions}
          />

          {/* 3. Model-Level Telemetry & Switching Matrix */}
          <ModelTelemetryMatrix
            modelsList={modelsList}
            switchEvents={switchEvents}
            totalEventsCount={effectiveEvents.length}
            selectedModel={filters.modelName}
            onSelectModel={(mName) =>
              setFilters((prev) => ({
                ...prev,
                modelName: mName === 'ALL' || prev.modelName === mName ? 'ALL' : mName,
              }))
            }
            onInspectSwitchEvent={handleInspectModelSwitch}
          />

          {/* 4. Deep Insights & Conversations Selector 3-Col Bento Grid */}
          <DeepInsightsGrid
            events={modelScopedEvents}
            conversationsList={conversationsList}
            selectedConversationId={filters.conversationId}
            selectedToolName={filters.toolName}
            onSelectConversation={(cid) => handleSelectConversation(cid)}
            onSelectTool={(tName) =>
              setFilters((prev) => ({
                ...prev,
                toolName: prev.toolName === tName ? 'ALL' : tName,
              }))
            }
            onOpenEventRawModal={handleOpenEventRawModal}
          />

          {/* 5. Mode & Conversation Navigation Bar */}
          <section className="glass-panel rounded-2xl p-5 border-l-4 border-l-blue-500">
            {!isConvoSelected ? (
              <div className="space-y-4">
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-mono font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.25)]">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      All Events Mode
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Global Telemetry Stream</span>
                        <span className="text-xs font-normal font-mono text-slate-400">
                          ({effectiveEvents.length} events across {conversationsList.length} sessions)
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Aggregated cross-session telemetry stream. Select any conversation session below to launch its{' '}
                        <strong className="text-blue-300 font-medium">
                          3-Pane Interactions Trace Workbench &amp; SystemOne Alignment Matrix
                        </strong>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                    <span className="px-3 py-1.5 rounded-xl glass-subcard text-xs font-mono text-slate-300 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      <span>{conversationsList.length} Sessions</span>
                    </span>
                    <span className="px-3 py-1.5 rounded-xl glass-subcard text-xs font-mono text-slate-300 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{effectiveEvents.length} Events</span>
                    </span>
                  </div>
                </div>

                {/* Session Selector Strip */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-medium">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      Quick Conversation Session Switcher:
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Select session to open 3-Pane Workbench
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {conversationsList.map((c) => {
                      const cleanPrompt = c.firstPrompt?.trim().replace(/\s+/g, ' ');
                      return (
                        <button
                          key={c.id}
                          onClick={() => handleSelectConversation(c.id)}
                          title={cleanPrompt || c.id}
                          className="group px-3 py-1.5 rounded-xl bg-blue-950/40 hover:bg-blue-600/20 border border-blue-500/20 hover:border-blue-400/50 transition-all duration-150 flex items-center gap-2 cursor-pointer shadow-xs hover:shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover:scale-125 transition-transform" />
                          <span className="font-mono text-xs font-semibold text-blue-300 group-hover:text-blue-100">
                            Session {c.id.slice(0, 8)}…
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[#060911] text-[10px] font-mono text-slate-300 border border-white/[0.06]">
                            {c.count} steps
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 group-hover:text-blue-300 group-hover:translate-x-0.5 transition">
                            Trace →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleSelectConversation('ALL')}
                    className="px-3 py-1.5 rounded-xl glass-subcard hover:bg-white/[0.06] text-slate-200 border border-white/[0.1] text-xs font-mono font-medium transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to All Events</span>
                  </button>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                        Conversation Trace Active
                      </span>
                      <span className="text-xs font-mono text-white font-semibold">
                        {filters.conversationId}
                      </span>
                      {meanAlign !== null && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                            driftedTurnsCount > 0
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/35'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
                          }`}
                        >
                          🛡️ Alignment {meanAlign}% •{' '}
                          {driftedTurnsCount > 0 ? `${driftedTurnsCount} Drift` : 'Aligned'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {processedInteractions.length} Interactions (
                      {processedInteractions.filter((i) => i.status === 'COMPLETED').length}{' '}
                      COMPLETED) • {evalTurns.length}/{processedInteractions.length} SystemOne
                      Evaluated • {effectiveEvents.length} events
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-[#070a12] border border-white/[0.09] rounded-xl p-1 text-xs font-mono">
                    <button
                      onClick={() => setConvoDisplaySubMode('interactions')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                        convoDisplaySubMode === 'interactions'
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Interactions Workbench ({processedInteractions.length})
                    </button>
                    <button
                      onClick={() => setConvoDisplaySubMode('events')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                        convoDisplaySubMode === 'events'
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Conversation Events ({effectiveEvents.length})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 6. Sticky Filters & Search Bar */}
          <section className="glass-panel rounded-2xl p-3.5 sticky top-[68px] z-30">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              {/* Step Type Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'ALL', label: 'All', count: typeCounts.all },
                  { key: 'USER_INPUT', label: 'User Input', count: typeCounts.user },
                  {
                    key: 'PLANNER_RESPONSE',
                    label: 'Planner Response',
                    count: typeCounts.planner,
                  },
                  {
                    key: 'GENERIC',
                    label: 'Tool / System Output',
                    count: typeCounts.generic,
                  },
                ].map((btn) => {
                  const isActive = filters.type === btn.key;
                  return (
                    <button
                      key={btn.key}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          type: btn.key as TelemetryFilters['type'],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono transition cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold shadow-[0_0_14px_rgba(37,99,235,0.4)]'
                          : 'glass-subcard text-slate-300 hover:border-slate-500 font-medium'
                      }`}
                    >
                      {btn.label} ({btn.count})
                    </button>
                  );
                })}
              </div>

              {/* Search Input, Dedupe Toggle & Sort Toggle */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 sm:flex-initial sm:w-72">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, search: e.target.value }))
                    }
                    placeholder="Search prompts, goals, models, paths..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-[#060911] border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  {filters.search && (
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-subcard text-xs font-mono text-slate-300 cursor-pointer hover:border-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={dedupeSteps}
                    onChange={(e) => setDedupeSteps(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                  />
                  <span>Deduplicate Steps</span>
                </label>

                <button
                  onClick={() => setSortNewestFirst((prev) => !prev)}
                  className="px-3 py-1.5 rounded-xl glass-subcard hover:border-slate-600 text-xs font-mono text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    {sortNewestFirst ? 'Newest First' : 'Oldest First (Chronological)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Active Filters Banner */}
            {hasActiveFilters && (
              <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500">Active Filters:</span>
                  {filters.modelName !== 'ALL' && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                      Model: {filters.modelName}
                      <button
                        onClick={() => setFilters((p) => ({ ...p, modelName: 'ALL' }))}
                        className="hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {filters.workspace !== 'ALL' && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                      Workspace: {filters.workspace}
                      <button
                        onClick={() => setFilters((p) => ({ ...p, workspace: 'ALL' }))}
                        className="hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {filters.toolName !== 'ALL' && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                      Tool: {filters.toolName}
                      <button
                        onClick={() => setFilters((p) => ({ ...p, toolName: 'ALL' }))}
                        className="hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {filters.search.trim() !== '' && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                      Search: &quot;{filters.search}&quot;
                      <button
                        onClick={() => setFilters((p) => ({ ...p, search: '' }))}
                        className="hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
                <button
                  onClick={handleResetAllFilters}
                  className="text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Reset filters
                </button>
              </div>
            )}
          </section>

          {/* 6B. Agent Alignment & SystemOne Evaluation Matrix (Conversation View) */}
          <div id="alignmentMatrixAnchor">
            <AlignmentMatrixSection
              isConvoSelected={isConvoSelected}
              processedInteractions={processedInteractions}
              selectedTurnIndex={selectedTurnIndex}
              isEvaluatingAlignment={isEvaluatingAlignment}
              allSessionEvaluations={
                conversationEvaluations.length > 0
                  ? conversationEvaluations
                  : processedInteractions
                      .map((t) => t.alignment?.rawEvaluation || t.alignment)
                      .filter(Boolean)
              }
              onSelectTurn={(tIdx) => {
                setSelectedTurnIndex(tIdx);
                setSelectedInspectTarget('TURN_ROOT');
              }}
              onRefreshAlignment={handleRefreshAlignment}
              onOpenAlignmentModal={handleOpenAlignmentModal}
            />
          </div>

          {/* 7. Bottom Trace Section: 3-Pane Workbench OR All Events Stream */}
          <section id="bottomTraceAnchor" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold">
                  {isConvoSelected && convoDisplaySubMode === 'interactions'
                    ? 'Conversation Interactions Trace Workbench'
                    : isConvoSelected
                    ? 'Conversation Events Stream'
                    : 'All Events Telemetry Stream'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono glass-subcard text-slate-400">
                  {isConvoSelected && convoDisplaySubMode === 'interactions'
                    ? `${filteredInteractions.length} of ${processedInteractions.length} interactions`
                    : `${filteredStreamEvents.length} of ${effectiveEvents.length} events`}
                </span>
              </div>
            </div>

            {isConvoSelected && convoDisplaySubMode === 'interactions' ? (
              <ConversationWorkbench
                conversationId={filters.conversationId}
                interactions={processedInteractions}
                filteredInteractions={filteredInteractions}
                selectedTurnIndex={selectedTurnIndex}
                selectedInspectTarget={selectedInspectTarget}
                isEvaluatingAlignment={isEvaluatingAlignment}
                onSelectTurn={(tIdx) => {
                  setSelectedTurnIndex(tIdx);
                  setSelectedInspectTarget('TURN_ROOT');
                }}
                onSelectInspectTarget={(targetKey) => setSelectedInspectTarget(targetKey)}
                onRefreshAlignment={handleRefreshAlignment}
                onOpenJsonModal={(title, payload) =>
                  setRawModalState({ isOpen: true, title, payload })
                }
                onOpenAlignmentModal={(tIdx) => handleOpenAlignmentModal(tIdx)}
              />
            ) : (
              <EventsStreamList
                key={`${filters.conversationId}|${filters.type}|${filters.modelName}|${filters.workspace}|${filters.toolName}|${deferredSearch}|${sortNewestFirst}|${dedupeSteps}`}
                events={filteredStreamEvents}
                newlyArrivedIds={newlyArrivedIds}
                onSelectModel={(mName) =>
                  setFilters((prev) => ({
                    ...prev,
                    modelName: prev.modelName === mName ? 'ALL' : mName,
                  }))
                }
                onSelectConversation={(cid) => handleSelectConversation(cid)}
                onOpenRawModal={handleOpenEventRawModal}
                onResetFilters={handleResetAllFilters}
              />
            )}
          </section>
        </main>
      )}

      {/* Raw JSON Modal */}
      <RawJsonModal
        isOpen={rawModalState.isOpen}
        title={rawModalState.title}
        payload={rawModalState.payload}
        onClose={() => setRawModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Command Palette Modal (Ctrl+K / Cmd+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        conversations={conversationsList}
        models={modelsList}
        tools={directorySummary.sortedTools}
        onSelectConversation={(cid) => handleSelectConversation(cid)}
        onSelectModel={(mName) =>
          setFilters((prev) => ({
            ...prev,
            modelName: mName === 'ALL' || prev.modelName === mName ? 'ALL' : mName,
          }))
        }
        onSelectTool={(tName) =>
          setFilters((prev) => ({
            ...prev,
            toolName: prev.toolName === tName ? 'ALL' : tName,
          }))
        }
        onSwitchTab={setActiveTab}
        onResetFilters={handleResetAllFilters}
      />
    </div>
  );
}
