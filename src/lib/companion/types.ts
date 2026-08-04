/* ═══════════════════════════════════════════════════════════════
   COMPANION SYSTEM — SHARED TYPES
   ═══════════════════════════════════════════════════════════════ */

/** Memory types tracked by the companion */
export type MemoryType = 'fact' | 'preference' | 'event' | 'goal' | 'insight'

/** A single long-term memory item */
export interface CompanionMemory {
  id: string
  userId: string
  type: MemoryType
  content: string
  /** 0–1 salience/priority, higher = more likely to be retrieved */
  salience: number
  createdAt: string
  updatedAt: string
}

/** Companion personality profile */
export type TonePreset = 'supportive' | 'direct' | 'playful' | 'minimal'

export interface CompanionPersonalityProfile {
  userId: string
  displayName: string
  tonePreset: TonePreset
  /** 0–1 verbosity level */
  verbosity: number
  coachingStyle: 'gentle' | 'structured' | 'socratic'
  updatedAt: string
}

/** A single message in the companion conversation history */
export interface CompanionConversationMessage {
  id: string
  userId: string
  role: 'user' | 'companion'
  content: string
  metadata?: {
    memoryWritesApplied?: number
    coachingSuggestion?: string
    rpgActionApplied?: boolean
    toneAdjustment?: TonePreset
  }
  createdAt: string
}

/** A proactive coaching event */
export type CoachingTriggerType =
  | 'streak_risk'
  | 'daily_checkin'
  | 'goal_stale'
  | 'habit_milestone'
  | 'level_up'

export interface CompanionCoachingEvent {
  id: string
  userId: string
  triggerType: CoachingTriggerType
  suggestion: string
  accepted: boolean
  createdAt: string
}

/** Current companion focus state */
export interface CompanionState {
  userId: string
  currentFocus: string
  activeGoals: string[]
  habitSummary: Record<string, unknown>
  lastCheckinAt: string | null
}

/** RPG progression context passed to the LLM */
export interface RpgContext {
  level: number
  xp: number
  streak: number
  activeQuestNames: string[]
  recentBadgeNames: string[]
}

/** Structured sidecar output from the LLM */
export interface CompanionSidecar {
  memory_writes: Array<{
    type: MemoryType
    content: string
    salience?: number
  }>
  coaching_suggestion: string | null
  rpg_action: {
    type: 'xp_grant' | 'quest_complete' | 'quest_add'
    label: string
    xp?: number
    questId?: string
  } | null
  tone_adjustment: TonePreset | null
}

/** Full response from the companion orchestrator */
export interface CompanionResponse {
  reply: string
  sidecar: CompanionSidecar
  updatedMemories: CompanionMemory[]
  updatedPersonality: CompanionPersonalityProfile
  coachingEvent: CompanionCoachingEvent | null
}

/** Input to the companion orchestrator for a single turn */
export interface CompanionTurnInput {
  userId: string
  userMessage: string
  rpgContext: RpgContext
  /** Max memories to inject into context */
  topKMemories?: number
}
