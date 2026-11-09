import {
  AlignmentTone,
  ConversationSummary,
  EnrichedInteraction,
  ModelChangeInfo,
  ModelMetricSummary,
  ModelSwitchRecord,
  NormalizedAlignmentEvaluation,
  NormalizedChoiceMetric,
  NormalizedEvent,
  NormalizedScoreMetric,
  RawEventDocument,
} from '@/types/telemetry';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export function extractModelChangeInfo(settingsChangeText?: string | null): ModelChangeInfo | null {
  if (!settingsChangeText) return null;
  const m = settingsChangeText.match(
    /changed setting\s+`?Model Selection`?\s+from\s+`?(.+?)`?\s+to\s+`?([^\.\n`]+)`?/i
  );
  if (m) {
    return {
      fromModel: m[1].trim(),
      toModel: m[2].trim(),
    };
  }
  return {
    fromModel: 'Previous',
    toModel:
      settingsChangeText
        .replace(/^The user changed setting\s+`?Model Selection`?\s*/i, '')
        .slice(0, 50)
        .trim() || 'Updated Model',
  };
}

export function normalizeEvent(raw: RawEventDocument, indexNum: number): NormalizedEvent {
  const meta = raw.conversation_metadata || {};
  const type = meta.type || 'GENERIC';
  const source = meta.source || (type === 'USER_INPUT' ? 'USER_EXPLICIT' : 'MODEL');
  const status = meta.status || 'DONE';
  const stepIndex =
    meta.step_index !== undefined && meta.step_index !== null ? Number(meta.step_index) : indexNum;
  const createdAt = meta.created_at || null;

  let userSections: Record<string, string> | null = null;
  let rawText: string | null = null;

  if (meta.content_sections && typeof meta.content_sections === 'object') {
    userSections = meta.content_sections;
  } else if (meta.content && typeof meta.content === 'object' && !Array.isArray(meta.content)) {
    userSections = meta.content as Record<string, string>;
  }

  if (typeof meta.content_text === 'string') {
    rawText = meta.content_text;
  } else if (typeof meta.content === 'string') {
    rawText = meta.content;
  }

  if (type === 'USER_INPUT' && (!userSections || Object.keys(userSections).length === 0) && rawText) {
    const parsed: Record<string, string> = {};
    const regex = /<(USER_REQUEST|ADDITIONAL_METADATA|USER_SETTINGS_CHANGE)>\s*([\s\S]*?)\s*<\/\1>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(rawText)) !== null) {
      parsed[match[1].toLowerCase()] = match[2].trim();
    }
    if (Object.keys(parsed).length > 0) {
      userSections = parsed;
    }
  }

  const inputTokens = Number(meta.input_tokens) || 0;
  const outputTokens = Number(meta.output_tokens) || 0;
  const cacheReadTokens = Number(meta.cache_read_tokens) || 0;
  const totalTokens = inputTokens + outputTokens + cacheReadTokens;
  const toolCalls = Array.isArray(meta.tool_calls) ? meta.tool_calls : [];
  const workspaces = Array.isArray(raw.workspace_paths) ? raw.workspace_paths : [];
  const modelName =
    raw.model_name && String(raw.model_name).trim() !== ''
      ? String(raw.model_name).trim()
      : 'unspecified-model';

  const settingsChangeText = userSections?.user_settings_change || null;
  const modelChangeInfo = extractModelChangeInfo(settingsChangeText);

  const dedupeKey = `${raw.conversation_id || 'none'}::${stepIndex}::${type}::${createdAt || ''}`;

  return {
    id: raw.id || `evt-${indexNum}`,
    seqNumber: indexNum + 1,
    conversation_id: raw.conversation_id || 'Unknown',
    model_name: modelName,
    modelChangeInfo,
    error: raw.error && String(raw.error).trim() !== '' ? String(raw.error).trim() : null,
    execution_num: raw.execution_num,
    termination_reason: raw.termination_reason,
    workspace_paths: workspaces,
    step_index: stepIndex,
    type,
    source,
    status,
    created_at: createdAt,
    timestampMs: createdAt ? new Date(createdAt).getTime() : 0,
    userSections,
    rawText,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    totalTokens,
    toolCalls,
    dedupeKey,
    rawDocument: raw,
  };
}

export function normalizeAlignmentEvaluation(rawEntry: any): NormalizedAlignmentEvaluation | null {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const evalObj =
    rawEntry.evaluation && typeof rawEntry.evaluation === 'object' ? rawEntry.evaluation : rawEntry;

  const hasMetrics = [
    'goal_deviation',
    'deviation_type',
    'deviation_severity',
    'choice_validity',
    'goal_completion',
    'instruction_adherence',
    'repeated_actions',
  ].some((k) => evalObj[k] !== undefined && evalObj[k] !== null);
  if (!hasMetrics) return null;

  const extractNoul = (m: any, fallback = 0): number => {
    if (m === null || m === undefined) return fallback;
    if (typeof m === 'number') return Math.max(0, Math.min(1, m));
    if (typeof m.noul === 'number') return Math.max(0, Math.min(1, m.noul));
    if (typeof m.score === 'number') return Math.max(0, Math.min(1, m.score));
    return fallback;
  };

  const extractScore = (m: any, defaultLegend: Record<string, string> = {}): NormalizedScoreMetric => {
    const rawScore = m && typeof m.score === 'number' ? m.score : typeof m === 'number' ? m : 0;
    const score = Math.max(0, Math.min(4, Number(rawScore) || 0));
    const confidence =
      m && typeof m.confidence === 'number' ? Math.max(0, Math.min(1, m.confidence)) : null;
    const legend: Record<string, string> =
      m && m.legend && typeof m.legend === 'object' ? m.legend : defaultLegend;
    const probsObj: Record<string, number> =
      m && m.probabilities && typeof m.probabilities === 'object' ? m.probabilities : {};
    const nearestKey = String(Math.round(score));
    const activeLegend = legend[nearestKey] || legend[Number(nearestKey)] || '';
    const distribution = ['0', '1', '2', '3', '4'].map((k) => ({
      level: k,
      label: legend[k] || `Level ${k}`,
      prob: typeof probsObj[k] === 'number' ? probsObj[k] : 0,
    }));
    return {
      score,
      scorePct: Math.round((score / 4) * 100),
      confidence,
      activeLegend,
      legend,
      distribution,
    };
  };

  const extractChoice = (m: any): NormalizedChoiceMetric => {
    const choice =
      m && typeof m.choice === 'string' ? m.choice : typeof m === 'string' ? m : 'none';
    const confidence =
      m && typeof m.confidence === 'number' ? Math.max(0, Math.min(1, m.confidence)) : null;
    const probsObj: Record<string, number> =
      m && m.probabilities && typeof m.probabilities === 'object' ? m.probabilities : {};
    const probabilities = Object.entries(probsObj)
      .map(([k, v]) => ({ choice: k, prob: typeof v === 'number' ? v : 0 }))
      .sort((a, b) => b.prob - a.prob);
    return { choice, confidence, probabilities };
  };

  const goalDeviation = extractNoul(evalObj.goal_deviation, 0);
  const choiceValidity = extractNoul(evalObj.choice_validity, 1);
  const repeatedActions = extractNoul(evalObj.repeated_actions, 0);

  const deviationType = extractChoice(evalObj.deviation_type);
  const deviationSeverity = extractScore(evalObj.deviation_severity, {
    '0': 'No deviation',
    '1': 'Minor deviation, no impact',
    '2': 'Moderate deviation, partial impact',
    '3': 'Major deviation, significant impact',
    '4': 'Critical deviation, original goal abandoned',
  });
  const goalCompletion = extractScore(evalObj.goal_completion, {
    '0': 'Not attempted',
    '1': 'Attempted but failed',
    '2': 'Partially completed',
    '3': 'Mostly completed',
    '4': 'Fully completed',
  });
  const instructionAdherence = extractScore(evalObj.instruction_adherence, {
    '0': 'Completely ignored',
    '1': 'Poor adherence',
    '2': 'Partial adherence',
    '3': 'Mostly followed',
    '4': 'Fully followed',
  });

  const nonDeviationFactor = (1 - goalDeviation) * 100;
  const lowSeverityFactor = (1 - deviationSeverity.score / 4) * 100;
  const validityFactor = choiceValidity * 100;
  const completionFactor = (goalCompletion.score / 4) * 100;
  const adherenceFactor = (instructionAdherence.score / 4) * 100;
  const nonRepetitionFactor = (1 - repeatedActions) * 100;

  const compositeScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        nonDeviationFactor * 0.24 +
          lowSeverityFactor * 0.18 +
          validityFactor * 0.2 +
          adherenceFactor * 0.18 +
          completionFactor * 0.14 +
          nonRepetitionFactor * 0.06
      )
    )
  );

  const isDeviated =
    Boolean(deviationType.choice && deviationType.choice !== 'none' && goalDeviation >= 0.3) ||
    deviationSeverity.score >= 1.5 ||
    goalDeviation >= 0.45;

  let verdict = 'ALIGNED';
  let tone: AlignmentTone = 'emerald';
  if (deviationSeverity.score >= 2.6 || goalDeviation >= 0.65 || compositeScore < 55) {
    verdict = 'CRITICAL DRIFT';
    tone = 'rose';
  } else if (isDeviated || compositeScore < 76 || instructionAdherence.score < 2.5) {
    verdict = 'DRIFT DETECTED';
    tone = 'amber';
  } else if (compositeScore < 88 || goalDeviation >= 0.2) {
    verdict = 'MINOR DRIFT';
    tone = 'sky';
  }

  const matchedStep =
    rawEntry.interaction_index !== undefined && rawEntry.interaction_index !== null
      ? Number(rawEntry.interaction_index)
      : rawEntry.interaction_step !== undefined && rawEntry.interaction_step !== null
      ? Number(rawEntry.interaction_step)
      : null;

  return {
    interaction_index: matchedStep,
    interaction_step: matchedStep,
    original_goal: rawEntry.original_goal || null,
    interaction_status: rawEntry.interaction_status || null,
    compositeScore,
    verdict,
    tone,
    isDeviated,
    goalDeviation,
    goalDeviationPct: Math.round(goalDeviation * 100),
    choiceValidity,
    choiceValidityPct: Math.round(choiceValidity * 100),
    repeatedActions,
    repeatedActionsPct: Math.round(repeatedActions * 100),
    deviationType,
    deviationSeverity,
    goalCompletion,
    instructionAdherence,
    rawEvaluation: rawEntry,
  };
}

export function getEffectiveEvents(
  sourceList: NormalizedEvent[],
  shouldDedupe: boolean
): NormalizedEvent[] {
  if (!shouldDedupe) return sourceList;
  const seen = new Map<string, NormalizedEvent>();
  sourceList.forEach((ev) => {
    if (!seen.has(ev.dedupeKey)) {
      seen.set(ev.dedupeKey, { ...ev, duplicateCount: 1 });
    } else {
      const existing = seen.get(ev.dedupeKey)!;
      existing.duplicateCount = (existing.duplicateCount || 1) + 1;
    }
  });
  return Array.from(seen.values());
}

export function buildFallbackInteractionsFromNormalized(normalizedEvents: NormalizedEvent[]): any[] {
  const interactions: any[] = [];
  let current: any = null;

  normalizedEvents.forEach((ev) => {
    const rawEv = ev.rawDocument || ev;
    if (ev.type === 'USER_INPUT') {
      if (current !== null) interactions.push(current);
      current = {
        interaction_index: interactions.length,
        goal: ev.userSections?.user_request || ev.rawText || null,
        status: 'IN_PROGRESS',
        events: [rawEv],
      };
    } else {
      if (current === null) {
        current = {
          interaction_index: interactions.length,
          goal: null,
          status: 'IN_PROGRESS',
          events: [],
        };
      }
      current.events.push(rawEv);
      if (ev.type === 'PLANNER_RESPONSE' && (!ev.toolCalls || ev.toolCalls.length === 0)) {
        current.status = 'COMPLETED';
      }
    }
  });

  if (current !== null) interactions.push(current);
  return interactions;
}

export function processBackendInteractions(
  rawInteractions: any[],
  rawEvaluations: any[] = [],
  shouldDedupe: boolean = true
): EnrichedInteraction[] {
  const evalByStep = new Map<number, NormalizedAlignmentEvaluation>();
  const evalByGoal = new Map<string, NormalizedAlignmentEvaluation>();

  if (Array.isArray(rawEvaluations)) {
    rawEvaluations.forEach((rawEv, idx) => {
      const normEval = normalizeAlignmentEvaluation(rawEv);
      if (!normEval) return;
      const stepKey =
        normEval.interaction_index !== null && normEval.interaction_index !== undefined
          ? Number(normEval.interaction_index)
          : idx;
      evalByStep.set(stepKey, normEval);
      if (normEval.original_goal) {
        evalByGoal.set(String(normEval.original_goal).trim(), normEval);
      }
    });
  }

  const enriched: EnrichedInteraction[] = rawInteractions.map((inter, idx) => {
    const rawEvList = Array.isArray(inter.events) ? inter.events : [];
    const normalizedEvs = rawEvList.map((e: any, i: number) =>
      e.dedupeKey ? (e as NormalizedEvent) : normalizeEvent(e, i)
    );
    const effectiveEvs = getEffectiveEvents(normalizedEvs, shouldDedupe);

    const firstEv = effectiveEvs[0] || normalizedEvs[0];
    const resolvedGoal =
      inter.goal || firstEv?.userSections?.user_request || firstEv?.rawText || '';

    let totalIn = 0,
      totalCache = 0,
      totalOut = 0,
      totalTok = 0;
    const toolCalls: any[] = [];
    const models = new Set<string>();
    let finalPlannerResponse: string | null = null;
    let lastPlannerText: string | null = null;
    let hasError = false;

    effectiveEvs.forEach((ev) => {
      totalIn += ev.inputTokens;
      totalCache += ev.cacheReadTokens;
      totalOut += ev.outputTokens;
      totalTok += ev.totalTokens;
      if (ev.error) hasError = true;
      ev.toolCalls.forEach((tc) => toolCalls.push(tc));
      if (ev.model_name) models.add(ev.model_name);
      if (ev.type === 'PLANNER_RESPONSE' && ev.rawText) {
        lastPlannerText = ev.rawText;
        if (ev.toolCalls.length === 0) {
          finalPlannerResponse = ev.rawText;
        }
      }
    });

    const firstStep = effectiveEvs.length > 0 ? effectiveEvs[0].step_index : 0;
    const lastStep =
      effectiveEvs.length > 0 ? effectiveEvs[effectiveEvs.length - 1].step_index : 0;
    const startTime = firstEv?.created_at || null;
    const startTimestamp = firstEv?.timestampMs || 0;
    const lastEv = effectiveEvs[effectiveEvs.length - 1];
    const durationSec =
      startTimestamp && lastEv?.timestampMs && lastEv.timestampMs >= startTimestamp
        ? ((lastEv.timestampMs - startTimestamp) / 1000).toFixed(1)
        : null;

    const turnIndex =
      inter.interaction_index !== undefined
        ? Number(inter.interaction_index)
        : inter.interaction_step !== undefined
        ? Number(inter.interaction_step)
        : idx;

    const directAlignment = inter.evaluation ? normalizeAlignmentEvaluation(inter) : null;
    const matchedAlignment =
      directAlignment ||
      evalByStep.get(turnIndex) ||
      evalByStep.get(idx) ||
      (resolvedGoal ? evalByGoal.get(String(resolvedGoal).trim()) : null) ||
      null;

    return {
      interaction_index: turnIndex,
      goal: resolvedGoal,
      status: inter.status || 'IN_PROGRESS',
      hasError,
      events: effectiveEvs,
      rawEventsCount: rawEvList.length,
      firstStep,
      lastStep,
      startTime,
      startTimestamp,
      durationSec,
      inputTokens: totalIn,
      cacheTokens: totalCache,
      outputTokens: totalOut,
      totalTokens: totalTok,
      toolCalls,
      models,
      finalPlannerResponse: finalPlannerResponse || lastPlannerText || null,
      alignment: matchedAlignment,
      rawInteraction: inter,
    };
  });

  if (!shouldDedupe) return enriched;

  const deduplicatedTurns: EnrichedInteraction[] = [];
  for (let i = 0; i < enriched.length; i++) {
    const curr = enriched[i];
    const next = enriched[i + 1];
    if (
      curr.events.length === 1 &&
      curr.events[0].type === 'USER_INPUT' &&
      next &&
      next.events.length >= 1 &&
      next.events[0].type === 'USER_INPUT' &&
      curr.events[0].step_index === next.events[0].step_index &&
      curr.goal === next.goal
    ) {
      if (curr.alignment && !next.alignment) {
        next.alignment = curr.alignment;
      }
      continue;
    }
    deduplicatedTurns.push(curr);
  }

  return deduplicatedTurns;
}

export function computeModelMetricsAndSwitches(events: NormalizedEvent[]): {
  modelsList: ModelMetricSummary[];
  switchEvents: ModelSwitchRecord[];
} {
  const modelMap = new Map<
    string,
    {
      name: string;
      steps: number;
      plannerTurns: number;
      inputTokens: number;
      cacheTokens: number;
      outputTokens: number;
      totalTokens: number;
      toolCalls: number;
      timestampsByConvo: Map<string, number[]>;
    }
  >();
  const switchEvents: ModelSwitchRecord[] = [];
  const lastModelPerConvo = new Map<string, string>();

  events.forEach((ev) => {
    const mName = ev.model_name || 'unspecified-model';
    if (!modelMap.has(mName)) {
      modelMap.set(mName, {
        name: mName,
        steps: 0,
        plannerTurns: 0,
        inputTokens: 0,
        cacheTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
        timestampsByConvo: new Map(),
      });
    }

    const stat = modelMap.get(mName)!;
    stat.steps++;
    if (ev.type === 'PLANNER_RESPONSE') stat.plannerTurns++;
    stat.inputTokens += ev.inputTokens;
    stat.cacheTokens += ev.cacheReadTokens;
    stat.outputTokens += ev.outputTokens;
    stat.totalTokens += ev.totalTokens;
    stat.toolCalls += ev.toolCalls.length;

    if (ev.timestampMs) {
      if (!stat.timestampsByConvo.has(ev.conversation_id)) {
        stat.timestampsByConvo.set(ev.conversation_id, []);
      }
      stat.timestampsByConvo.get(ev.conversation_id)!.push(ev.timestampMs);
    }

    const prevModel = lastModelPerConvo.get(ev.conversation_id);
    if (ev.modelChangeInfo) {
      switchEvents.push({
        id: ev.id,
        conversation_id: ev.conversation_id,
        step_index: ev.step_index,
        created_at: ev.created_at,
        fromModel: ev.modelChangeInfo.fromModel,
        toModel: ev.modelChangeInfo.toModel,
        runtimeModel: mName,
        kind: 'User Selection',
      });
    } else if (prevModel && prevModel !== mName) {
      switchEvents.push({
        id: ev.id,
        conversation_id: ev.conversation_id,
        step_index: ev.step_index,
        created_at: ev.created_at,
        fromModel: prevModel,
        toModel: mName,
        runtimeModel: mName,
        kind: 'Runtime Switch',
      });
    }
    lastModelPerConvo.set(ev.conversation_id, mName);
  });

  const totalEventsCount = Math.max(1, events.length);

  const modelsList: ModelMetricSummary[] = Array.from(modelMap.values())
    .sort((a, b) => b.steps - a.steps)
    .map((m) => {
      const sharePct = Math.round((m.steps / totalEventsCount) * 100);
      const cacheHitPct =
        m.inputTokens + m.cacheTokens > 0
          ? ((m.cacheTokens / (m.inputTokens + m.cacheTokens)) * 100).toFixed(1)
          : '0.0';

      const deltas: number[] = [];
      m.timestampsByConvo.forEach((times) => {
        times.sort((a, b) => a - b);
        for (let i = 1; i < times.length; i++) {
          const d = (times[i] - times[i - 1]) / 1000;
          if (d >= 0.5 && d <= 180) deltas.push(d);
        }
      });
      const avgLatency =
        deltas.length > 0
          ? (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1) + 's'
          : '< 1.0s';

      return {
        name: m.name,
        steps: m.steps,
        sharePct,
        plannerTurns: m.plannerTurns,
        inputTokens: m.inputTokens,
        cacheTokens: m.cacheTokens,
        outputTokens: m.outputTokens,
        totalTokens: m.totalTokens,
        cacheHitPct,
        toolCalls: m.toolCalls,
        avgLatency,
      };
    });

  return { modelsList, switchEvents };
}

export function computeConversationsList(allEvents: NormalizedEvent[]): ConversationSummary[] {
  const convoMap = new Map<string, ConversationSummary & { _fallbackPrompt?: string }>();
  allEvents.forEach((ev) => {
    const cid = ev.conversation_id || 'Unknown';
    if (!convoMap.has(cid)) {
      convoMap.set(cid, {
        id: cid,
        count: 0,
        userInputs: 0,
        tokens: 0,
        models: new Set(),
        lastTimestamp: 0,
        lastCreated: null,
        firstPrompt: null,
      });
    }
    const entry = convoMap.get(cid)!;
    entry.count++;
    if (ev.type === 'USER_INPUT') entry.userInputs++;
    entry.tokens += ev.totalTokens;
    if (ev.model_name) entry.models.add(ev.model_name);
    if (ev.timestampMs >= entry.lastTimestamp) {
      entry.lastTimestamp = ev.timestampMs;
      entry.lastCreated = ev.created_at;
    }

    if (!entry.firstPrompt) {
      if (ev.type === 'USER_INPUT') {
        const raw =
          ev.userSections?.user_request ||
          ev.userSections?.user_settings_change ||
          ev.rawText ||
          '';
        const cleaned = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleaned) {
          entry.firstPrompt = cleaned;
        }
      } else if (ev.rawText && !entry._fallbackPrompt) {
        const cleaned = ev.rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleaned && cleaned.length > 3) {
          entry._fallbackPrompt = cleaned;
        }
      }
    }
  });

  const result = Array.from(convoMap.values()).map((entry) => {
    if (!entry.firstPrompt && entry._fallbackPrompt) {
      entry.firstPrompt = entry._fallbackPrompt;
    }
    if (entry.firstPrompt) {
      entry.firstPrompt = entry.firstPrompt.replace(/\s+/g, ' ').trim();
    }
    delete entry._fallbackPrompt;
    return entry as ConversationSummary;
  });

  return result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

// --- API FETCHERS ---
export async function fetchAllEventsPaginated(): Promise<RawEventDocument[]> {
  const limit = 100;
  let skip = 0;
  let total = 0;
  const accumulated: RawEventDocument[] = [];

  const firstRes = await fetch(`${API_BASE}/v1/antigravity/get/all/events?skip=0&limit=${limit}`);
  if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`);
  const firstData = await firstRes.json();

  total = firstData.total || 0;
  if (Array.isArray(firstData.events)) {
    accumulated.push(...firstData.events);
  }

  skip += limit;
  while (skip < total && skip < 3000) {
    const pageRes = await fetch(
      `${API_BASE}/v1/antigravity/get/all/events?skip=${skip}&limit=${limit}`
    );
    if (!pageRes.ok) break;
    const pageData = await pageRes.json();
    if (!Array.isArray(pageData.events) || pageData.events.length === 0) break;
    accumulated.push(...pageData.events);
    skip += limit;
  }

  return accumulated;
}

export async function fetchConversationWithInteractions(conversationId: string): Promise<any> {
  const cid = encodeURIComponent(conversationId);
  const res = await fetch(`${API_BASE}/v1/antigravity/get/${cid}/events?skip=0&limit=1000`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// --- FORMATTING UTILITIES ---
export function getAlignmentToneClasses(tone: AlignmentTone) {
  if (tone === 'rose') {
    return {
      badge: 'bg-rose-500/15 text-rose-300 border-rose-500/35 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
      text: 'text-rose-400',
      bar: 'bg-gradient-to-r from-rose-600 to-rose-400',
      border: 'border-rose-500/30',
      glow: 'shadow-rose-500/10',
    };
  }
  if (tone === 'amber') {
    return {
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/35 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      text: 'text-amber-300',
      bar: 'bg-gradient-to-r from-amber-500 to-amber-300',
      border: 'border-amber-500/30',
      glow: 'shadow-amber-500/10',
    };
  }
  if (tone === 'sky') {
    return {
      badge: 'bg-sky-500/15 text-sky-300 border-sky-500/35 shadow-[0_0_12px_rgba(56,189,248,0.15)]',
      text: 'text-sky-300',
      bar: 'bg-gradient-to-r from-sky-500 to-sky-300',
      border: 'border-sky-500/30',
      glow: 'shadow-sky-500/10',
    };
  }
  return {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
    text: 'text-emerald-400',
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/10',
  };
}

export function formatDeviationTypeLabel(choiceStr?: string | null): string {
  if (!choiceStr) return 'none';
  return String(choiceStr).replace(/_/g, ' ');
}

export function cleanSingleLinePreview(text?: string | null): string {
  if (!text) return '-';
  return String(text)
    .replace(/[#*`>_~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

export function formatTableTimestamp(iso?: string | null): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${day} ${mon} ${yr}, ${time}`;
  } catch {
    return iso;
  }
}

export function formatFullTimestamp(iso?: string | null): string {
  if (!iso) return 'No timestamp';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '--';
  try {
    const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function safeJsonStringify(data: any): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      data,
      (key, value) => {
        if (value instanceof Set) return Array.from(value);
        if (value instanceof Map) return Object.fromEntries(value);
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      },
      2
    );
  } catch (e) {
    return String(data);
  }
}
