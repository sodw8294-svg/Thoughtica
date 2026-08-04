/* ═══════════════════════════════════════════════════════════════
   COMPANION COACHING ENGINE
   Deterministic trigger conditions + proactive nudge detection.
   ═══════════════════════════════════════════════════════════════ */

import type { CoachingTriggerType, RpgContext } from './types'

export interface CoachingTrigger {
  type: CoachingTriggerType
  /** Prompt fragment to pass to LLM for nudge generation */
  nudgeHint: string
}

/**
 * Evaluates deterministic conditions and returns zero or more
 * coaching triggers. The LLM will then generate the actual text.
 */
export function evaluateCoachingTriggers(
  rpgContext: RpgContext,
  lastCheckinAt: string | null,
  userMessage: string
): CoachingTrigger[] {
  const triggers: CoachingTrigger[] = []
  const now = Date.now()

  // Streak risk: streak > 0 but hasn't checked in today
  if (rpgContext.streak >= 2) {
    const lastCheckin = lastCheckinAt ? new Date(lastCheckinAt).getTime() : 0
    const hoursSinceCheckin = (now - lastCheckin) / (1000 * 60 * 60)
    if (hoursSinceCheckin >= 20) {
      triggers.push({
        type: 'streak_risk',
        nudgeHint: `The user has a ${rpgContext.streak}-day streak that may be at risk. Gently encourage them to keep it going.`,
      })
    }
  }

  // Daily check-in: no checkin today
  if (lastCheckinAt === null) {
    triggers.push({
      type: 'daily_checkin',
      nudgeHint: `This is the user's first interaction today. Welcome them warmly and offer a brief intention-setting prompt.`,
    })
  }

  // Goal stale: has active quests but user hasn't mentioned them
  if (
    rpgContext.activeQuestNames.length > 0 &&
    !rpgContext.activeQuestNames.some(q =>
      userMessage.toLowerCase().includes(q.toLowerCase().slice(0, 10))
    )
  ) {
    // Only trigger this occasionally (not every message)
    // Simple heuristic: trigger if user message is short greeting
    const isShortGreeting = /^\s*(hi|hey|hello|yo|sup|what'?s up)\s*[.!?]?\s*$/i.test(
      userMessage.trim()
    )
    if (isShortGreeting) {
      triggers.push({
        type: 'goal_stale',
        nudgeHint: `The user has active quests: ${rpgContext.activeQuestNames.slice(0, 3).join(', ')}. After greeting them, gently ask if they want to check in on any of these.`,
      })
    }
  }

  // Habit milestone: level-up or high XP
  if (rpgContext.xp > 0 && rpgContext.xp % 500 < 50) {
    triggers.push({
      type: 'habit_milestone',
      nudgeHint: `The user is near a milestone (${rpgContext.xp} XP). Acknowledge their progress warmly.`,
    })
  }

  return triggers
}

/** Build coaching context block for system prompt injection */
export function buildCoachingContext(triggers: CoachingTrigger[]): string {
  if (triggers.length === 0) return ''
  const hints = triggers.map(t => `  - ${t.nudgeHint}`).join('\n')
  return `COACHING CONTEXT (weave naturally into response — do not list these mechanically):\n${hints}`
}
