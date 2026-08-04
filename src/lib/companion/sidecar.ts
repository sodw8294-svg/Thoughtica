/* ═══════════════════════════════════════════════════════════════
   COMPANION SIDECAR PARSER
   Parses structured JSON sidecar from LLM replies.
   Falls back gracefully when output is partial / missing.
   ═══════════════════════════════════════════════════════════════ */

import type { CompanionSidecar, MemoryType, TonePreset } from './types'

const VALID_MEMORY_TYPES: MemoryType[] = ['fact', 'preference', 'event', 'goal', 'insight']
const VALID_TONES: TonePreset[] = ['supportive', 'direct', 'playful', 'minimal']

const EMPTY_SIDECAR: CompanionSidecar = {
  memory_writes: [],
  coaching_suggestion: null,
  rpg_action: null,
  tone_adjustment: null,
}

/**
 * Extract the companion reply text and sidecar JSON from a raw LLM response.
 *
 * The LLM is asked to append a JSON block delimited by:
 *   <!--COMPANION_SIDECAR_START-->
 *   { ... }
 *   <!--COMPANION_SIDECAR_END-->
 *
 * Everything before the start delimiter is the visible reply text.
 */
export function parseCompanionOutput(raw: string): {
  replyText: string
  sidecar: CompanionSidecar
} {
  const startTag = '<!--COMPANION_SIDECAR_START-->'
  const endTag = '<!--COMPANION_SIDECAR_END-->'

  const startIdx = raw.indexOf(startTag)
  if (startIdx === -1) {
    return { replyText: raw.trim(), sidecar: EMPTY_SIDECAR }
  }

  const replyText = raw.slice(0, startIdx).trim()
  const afterStart = raw.slice(startIdx + startTag.length)
  const endIdx = afterStart.indexOf(endTag)
  const jsonStr = endIdx === -1 ? afterStart.trim() : afterStart.slice(0, endIdx).trim()

  let sidecar: CompanionSidecar = { ...EMPTY_SIDECAR }
  try {
    const parsed = JSON.parse(jsonStr)
    sidecar = normalizeSidecar(parsed)
  } catch {
    // Partial or malformed — return empty sidecar, keep reply text
  }

  return { replyText, sidecar }
}

function normalizeSidecar(raw: unknown): CompanionSidecar {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SIDECAR }
  const obj = raw as Record<string, unknown>

  const memory_writes: CompanionSidecar['memory_writes'] = []
  if (Array.isArray(obj.memory_writes)) {
    for (const item of obj.memory_writes) {
      if (!item || typeof item !== 'object') continue
      const i = item as Record<string, unknown>
      const type = VALID_MEMORY_TYPES.includes(i.type as MemoryType)
        ? (i.type as MemoryType)
        : 'fact'
      const content = typeof i.content === 'string' ? i.content.slice(0, 300) : ''
      if (!content) continue
      const salience =
        typeof i.salience === 'number' ? Math.min(1, Math.max(0, i.salience)) : 0.7
      memory_writes.push({ type, content, salience })
    }
  }

  const coaching_suggestion =
    typeof obj.coaching_suggestion === 'string' && obj.coaching_suggestion.trim()
      ? obj.coaching_suggestion.trim().slice(0, 400)
      : null

  let rpg_action: CompanionSidecar['rpg_action'] = null
  if (obj.rpg_action && typeof obj.rpg_action === 'object') {
    const a = obj.rpg_action as Record<string, unknown>
    const validTypes = ['xp_grant', 'quest_complete', 'quest_add']
    if (validTypes.includes(a.type as string)) {
      rpg_action = {
        type: a.type as 'xp_grant' | 'quest_complete' | 'quest_add',
        label: typeof a.label === 'string' ? a.label.slice(0, 100) : 'RPG Action',
        xp: typeof a.xp === 'number' ? Math.min(500, Math.max(0, a.xp)) : undefined,
        questId: typeof a.questId === 'string' ? a.questId.slice(0, 80) : undefined,
      }
    }
  }

  const tone_adjustment =
    VALID_TONES.includes(obj.tone_adjustment as TonePreset)
      ? (obj.tone_adjustment as TonePreset)
      : null

  return { memory_writes, coaching_suggestion, rpg_action, tone_adjustment }
}
