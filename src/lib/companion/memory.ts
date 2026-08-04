/* ═══════════════════════════════════════════════════════════════
   COMPANION MEMORY STORE
   Persists and retrieves long-term memory in localStorage.
   Implements top-k relevance retrieval via keyword salience.
   ═══════════════════════════════════════════════════════════════ */

import type { CompanionMemory, MemoryType } from './types'

const STORAGE_KEY_PREFIX = 'thoughtica-companion-memories-'

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`
}

/** Load all memories for a user from localStorage */
export function loadMemories(userId: string): CompanionMemory[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as CompanionMemory[]
  } catch {
    return []
  }
}

/** Persist the full memory list for a user */
export function saveMemories(userId: string, memories: CompanionMemory[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(memories))
  } catch {
    // localStorage unavailable — no-op
  }
}

/** Add or update a memory item */
export function upsertMemory(
  userId: string,
  type: MemoryType,
  content: string,
  salience = 0.7
): CompanionMemory {
  const memories = loadMemories(userId)
  // Check for near-duplicate (same type + similar content start)
  const existing = memories.find(
    m => m.type === type && m.content.slice(0, 60) === content.slice(0, 60)
  )
  if (existing) {
    existing.salience = Math.min(1, existing.salience + 0.05)
    existing.updatedAt = new Date().toISOString()
    saveMemories(userId, memories)
    return existing
  }
  const newMemory: CompanionMemory = {
    id: crypto.randomUUID(),
    userId,
    type,
    content,
    salience,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  // Cap at 200 memories: evict lowest salience when over limit
  const updated = [...memories, newMemory].sort((a, b) => b.salience - a.salience).slice(0, 200)
  saveMemories(userId, updated)
  return newMemory
}

/** Remove a specific memory by id */
export function forgetMemory(userId: string, memoryId: string): void {
  const memories = loadMemories(userId).filter(m => m.id !== memoryId)
  saveMemories(userId, memories)
}

/** Remove memories matching a content keyword */
export function forgetMemoriesByContent(userId: string, keyword: string): number {
  const lower = keyword.toLowerCase()
  const before = loadMemories(userId)
  const after = before.filter(m => !m.content.toLowerCase().includes(lower))
  saveMemories(userId, after)
  return before.length - after.length
}

/** Reset (delete) all memories for a user */
export function resetMemories(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // no-op
  }
}

/**
 * Retrieve top-k most relevant memories for a query.
 * Relevance = salience × keyword-overlap score.
 * Fallback: return top-k by salience if no keyword matches.
 */
export function retrieveTopKMemories(
  userId: string,
  query: string,
  k = 8
): CompanionMemory[] {
  const memories = loadMemories(userId)
  if (memories.length === 0) return []

  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3)

  const scored = memories.map(m => {
    const contentWords = m.content.toLowerCase().split(/\W+/)
    const overlap = queryWords.filter(qw => contentWords.some(cw => cw.includes(qw))).length
    const relevance = m.salience * (1 + overlap * 0.3)
    return { memory: m, relevance }
  })

  scored.sort((a, b) => b.relevance - a.relevance)
  return scored.slice(0, k).map(s => s.memory)
}

/** Format memories as a context block for prompt injection */
export function formatMemoriesForPrompt(memories: CompanionMemory[]): string {
  if (memories.length === 0) return ''
  const lines = memories
    .filter(m => m.salience >= 0.3)
    .map(m => `  [${m.type}] ${m.content}`)
    .join('\n')
  return lines ? `PERSISTENT MEMORY (reference naturally when relevant):\n${lines}` : ''
}
