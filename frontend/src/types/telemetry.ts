export interface RawToolCall {
  id?: string;
  name?: string;
  args?: Record<string, any>;
}

export interface RawConversationMetadata {
  type?: 'USER_INPUT' | 'PLANNER_RESPONSE' | 'GENERIC' | string;
  source?: string;
  status?: string;
  step_index?: number;
  created_at?: string;
  content?: string | Record<string, any>;
  content_text?: string;
  content_sections?: Record<string, string>;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  tool_calls?: RawToolCall[];
}

export interface RawEventDocument {
  id?: string;
  conversation_id?: string;
  model_name?: string;
  error?: string | null;
  execution_num?: number;
  termination_reason?: string | null;
  workspace_paths?: string[];
  conversation_metadata?: RawConversationMetadata;
  [key: string]: any;
}

export interface ModelChangeInfo {
  fromModel: string;
  toModel: string;
}

export interface NormalizedEvent {
  id: string;
  seqNumber: number;
  conversation_id: string;
  model_name: string;
  modelChangeInfo: ModelChangeInfo | null;
  error: string | null;
  execution_num?: number;
  termination_reason?: string | null;
  workspace_paths: string[];
  step_index: number;
  type: string;
  source: string;
  status: string;
  created_at: string | null;
  timestampMs: number;
  userSections: Record<string, string> | null;
  rawText: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  toolCalls: RawToolCall[];
  dedupeKey: string;
  duplicateCount?: number;
  rawDocument: RawEventDocument;
}

export interface ScoreDistributionItem {
  level: string;
  label: string;
  prob: number;
}

export interface NormalizedScoreMetric {
  score: number;
  scorePct: number;
  confidence: number | null;
  activeLegend: string;
  legend: Record<string, string>;
  distribution: ScoreDistributionItem[];
}

export interface ChoiceProbabilityItem {
  choice: string;
  prob: number;
}

export interface NormalizedChoiceMetric {
  choice: string;
  confidence: number | null;
  probabilities: ChoiceProbabilityItem[];
}

export type AlignmentTone = 'emerald' | 'sky' | 'amber' | 'rose';

export interface NormalizedAlignmentEvaluation {
  interaction_index: number | null;
  interaction_step: number | null;
  original_goal: string | null;
  interaction_status: string | null;
  compositeScore: number;
  verdict: string;
  tone: AlignmentTone;
  isDeviated: boolean;
  goalDeviation: number;
  goalDeviationPct: number;
  choiceValidity: number;
  choiceValidityPct: number;
  repeatedActions: number;
  repeatedActionsPct: number;
  deviationType: NormalizedChoiceMetric;
  deviationSeverity: NormalizedScoreMetric;
  goalCompletion: NormalizedScoreMetric;
  instructionAdherence: NormalizedScoreMetric;
  rawEvaluation: any;
}

export interface EnrichedInteraction {
  interaction_index: number;
  goal: string;
  status: string;
  hasError: boolean;
  events: NormalizedEvent[];
  rawEventsCount: number;
  firstStep: number;
  lastStep: number;
  startTime: string | null;
  startTimestamp: number;
  durationSec: string | null;
  inputTokens: number;
  cacheTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCalls: RawToolCall[];
  models: Set<string>;
  finalPlannerResponse: string | null;
  alignment: NormalizedAlignmentEvaluation | null;
  rawInteraction: any;
}

export interface ModelMetricSummary {
  name: string;
  steps: number;
  sharePct: number;
  plannerTurns: number;
  inputTokens: number;
  cacheTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitPct: string;
  toolCalls: number;
  avgLatency: string;
}

export interface ModelSwitchRecord {
  id: string;
  conversation_id: string;
  step_index: number;
  created_at: string | null;
  fromModel: string;
  toModel: string;
  runtimeModel: string;
  kind: 'User Selection' | 'Runtime Switch';
}

export interface ConversationSummary {
  id: string;
  count: number;
  userInputs: number;
  tokens: number;
  models: Set<string>;
  lastTimestamp: number;
  lastCreated: string | null;
  firstPrompt: string | null;
}

export interface TelemetryFilters {
  type: 'ALL' | 'USER_INPUT' | 'PLANNER_RESPONSE' | 'GENERIC';
  conversationId: string;
  workspace: string;
  toolName: string;
  modelName: string;
  search: string;
}
