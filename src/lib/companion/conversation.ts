/* ═══════════════════════════════════════════════════════════════
   COMPANION CONVERSATION STORE
   Persists conversation history in localStorage for continuity.
   ═══════════════════════════════════════════════════════════════ */

import type { CompanionConversationMessage } from './types'

const STORAGE_KEY_PREFIX = 'thoughtica-companion-conversation-'
/** Keep last N messages in localStorage */
const MAX_STORED_MESSAGES = 100

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`
}

export function loadConversation(userId: string): CompanionConversationMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as CompanionConversationMessage[]
  } catch {
    return []
  }
}

export function appendMessages(
  userId: string,
  messages: CompanionConversationMessage[]
): CompanionConversationMessage[] {
  const existing = loadConversation(userId)
  const updated = [...existing, ...messages].slice(-MAX_STORED_MESSAGES)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(updated))
  } catch {
    // no-op
  }
  return updated
}

export function clearConversation(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // no-op
  }
}

/**
 * Build the messages array for the LLM API call.
 * Returns last N messages in {role, content} format.
 */
export function buildLLMHistory(
  userId: string,
  maxMessages = 20
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const history = loadConversation(userId)
  return history
    .slice(-maxMessages)
    .map(m => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }))
}
