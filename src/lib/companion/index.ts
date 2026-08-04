/* ═══════════════════════════════════════════════════════════════
   COMPANION SYSTEM — PUBLIC API
   ═══════════════════════════════════════════════════════════════ */

export { processCompanionTurn } from './orchestrator'
export { loadMemories, upsertMemory, forgetMemory, forgetMemoriesByContent, resetMemories, retrieveTopKMemories } from './memory'
export { loadPersonality, savePersonality, resetPersonality, applyToneAdjustment } from './personality'
export { loadConversation, appendMessages, clearConversation } from './conversation'
export { parseCompanionOutput } from './sidecar'
export { evaluateCoachingTriggers } from './coaching'
export type {
  CompanionMemory,
  CompanionPersonalityProfile,
  CompanionConversationMessage,
  CompanionCoachingEvent,
  CompanionState,
  CompanionResponse,
  CompanionTurnInput,
  CompanionSidecar,
  MemoryType,
  TonePreset,
  RpgContext,
  CoachingTriggerType,
} from './types'
