/* ═══════════════════════════════════════════════════════════════
   COMPANION ORCHESTRATOR
   Handles each chat turn:
   1) Load user context + personality
   2) Retrieve relevant memory (top-k)
   3) Retrieve RPG state
   4) Build LLM prompt context
   5) Call LLM via /api/chat
   6) Parse sidecar output
   7) Persist conversation + side effects
   8) Return full response
   ═══════════════════════════════════════════════════════════════ */

import type {
  CompanionResponse,
  CompanionTurnInput,
  CompanionCoachingEvent,
  CompanionMemory,
} from './types'
import {
  retrieveTopKMemories,
  upsertMemory,
  formatMemoriesForPrompt,
} from './memory'
import {
  loadPersonality,
  savePersonality,
  applyToneAdjustment,
} from './personality'
import {
  loadConversation,
  appendMessages,
  buildLLMHistory,
} from './conversation'
import { parseCompanionOutput } from './sidecar'
import { evaluateCoachingTriggers, buildCoachingContext } from './coaching'

function inferSupportMode(userMessage: string): 'emotional' | 'coaching' | 'practical' | 'crisis' | '' {
  const text = userMessage.trim()
  if (!text) return ''
  if (
    /\bi want to die\b/i.test(text) ||
    /\bkill myself\b/i.test(text) ||
    /\bsuicid(?:e|al)\b/i.test(text) ||
    /\bhurt myself\b/i.test(text) ||
    /\bself[- ]harm\b/i.test(text) ||
    /\bno reason to live\b/i.test(text) ||
    /\bcan'?t go on\b/i.test(text)
  ) {
    return 'crisis'
  }
  if (
    /\bi feel\b/i.test(text) ||
    /\bi'?m feeling\b/i.test(text) ||
    /\boverwhelmed\b/i.test(text) ||
    /\banxious\b/i.test(text) ||
    /\bsad\b/i.test(text) ||
    /\blonely\b/i.test(text) ||
    /\bburned? ?out\b/i.test(text) ||
    /\bstressed?\b/i.test(text)
  ) {
    return 'emotional'
  }
  if (
    /\bgoal(?:s)?\b/i.test(text) ||
    /\bhabit(?:s)?\b/i.test(text) ||
    /\bstreak\b/i.test(text) ||
    /\baccountabilit(?:y|ies)\b/i.test(text) ||
    /\bmotivat(?:e|ion)\b/i.test(text) ||
    /\bprogress\b/i.test(text)
  ) {
    return 'coaching'
  }
  if (
    /\bhow do i\b/i.test(text) ||
    /\bhelp me\b/i.test(text) ||
    /\bplan\b/i.test(text) ||
    /\bstrategy\b/i.test(text) ||
    /\bsteps?\b/i.test(text) ||
    /\borganize\b/i.test(text) ||
    /\bwrite\b/i.test(text) ||
    /\bdebug\b/i.test(text) ||
    /\bcode\b/i.test(text) ||
    /\bbuild\b/i.test(text) ||
    /\bexplain\b/i.test(text)
  ) {
    return 'practical'
  }
  return ''
}

/** Build the system prompt for the LLM */
function buildSystemPrompt(
  companionName: string,
  userName: string,
  goal: string,
  level: number,
  memoryBlock: string,
  coachingBlock: string,
  tonePreset: string,
  rpgQuestNames: string[]
): string {
  const questContext =
    rpgQuestNames.length > 0
      ? `\nACTIVE RPG QUESTS: ${rpgQuestNames.join(', ')}`
      : ''

  const toneInstruction: Record<string, string> = {
    supportive: 'Be warm, empathetic, and encouraging.',
    direct: 'Be concise, clear, and action-oriented.',
    playful: 'Be lighthearted, use gentle humor, and keep energy high.',
    minimal: 'Be brief and only speak when adding real value.',
  }

  return `You are ${companionName}, a genuine persistent AI companion in Thoughtica.io (a gamified Life RPG and mindfulness sanctuary).
Your user is ${userName}, Level ${level}, working towards: "${goal}".${questContext}

CORE BEHAVIOR:
- ALWAYS respond naturally to greetings and small talk first. If the user says "hi", "hello", or similar, respond conversationally and warmly before anything else.
- Be fully conversational with any kind of user input, from quick banter to deep emotional sharing to practical problem-solving.
- First answer what the user is actually trying to say or ask. Then add coaching or RPG context only if it helps.
- Blend two strengths naturally: elite usefulness and grounded companionship.
- Answer general questions directly like a helpful assistant. Add coaching context only when genuinely relevant.
- You remember and reference what you know about ${userName} naturally (never robotically).
- You can handle any request: coding, philosophy, emotional support, planning, creativity.
- You are supportive but honest — a companion, not a licensed professional.
- Never fabricate user history not present in your memory context.
- Never use manipulative, dependency-forming, or flattery-heavy language.
- Avoid sounding scripted, preachy, or repetitive.
- Offer clear steps, options, or structure when the user wants productivity help, but keep it human and smooth.
- Ask no more than one follow-up question unless the user clearly wants a deeper back-and-forth.
${toneInstruction[tonePreset] ?? toneInstruction.supportive}

${memoryBlock}

${coachingBlock}

SAFETY: If the user expresses thoughts of self-harm or crisis, respond with calm unconditional warmth, validate their feelings, and gently encourage them to reach out to a trusted person or professional helpline.

FORMATTING: Use Markdown for rich responses. Embed XP action cards when a task or habit is proposed:
  * [⚡ Anchor Habit (+15 XP)]
  * [🎯 Add Goal Quest (+25 XP)]

STRUCTURED OUTPUT: After your visible reply, append a JSON sidecar block EXACTLY like this (all fields required, use null if not applicable):
<!--COMPANION_SIDECAR_START-->
{
  "memory_writes": [{"type": "fact|preference|event|goal|insight", "content": "...", "salience": 0.0-1.0}],
  "coaching_suggestion": "string or null",
  "rpg_action": {"type": "xp_grant|quest_complete|quest_add", "label": "...", "xp": 0} | null,
  "tone_adjustment": "supportive|direct|playful|minimal" | null
}
<!--COMPANION_SIDECAR_END-->
Only include memory_writes for genuinely new or updated facts. Do NOT write empty content strings.`
}

/** Call the /api/chat endpoint */
async function callLLM(
  systemPrompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userText: string,
  companionName: string,
  userName: string,
  goal: string,
  level: number,
  memories: CompanionMemory[]
): Promise<string> {
  const memoryContext = memories.map(m => ({
    text: m.content,
    category: m.type,
    confidence: m.salience,
  }))

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userText,
      companionName,
      userName,
      userGoal: goal,
      userLevel: level,
      messages: history,
      memoryContext,
      conversationId: `companion-${Date.now()}`,
      supportMode: inferSupportMode(userText),
      // Pass the full system prompt override via a custom field
      _systemPromptOverride: systemPrompt,
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`)
  }

  const data = await response.json()
  if (!data.reply || typeof data.reply !== 'string') {
    throw new Error('LLM returned empty reply')
  }
  return data.reply
}

/** Fallback reply when LLM is unavailable */
function buildFallbackReply(userMessage: string, companionName: string): string {
  const lower = userMessage.toLowerCase().trim()
  if (/^\s*(hi|hey|hello|yo|sup|what'?s up)\s*[.!?]?\s*$/i.test(lower)) {
    return `Hey! Good to see you 😊 How are you feeling today? Your conversation context is still safe — I'm here whenever you're ready to chat.`
  }
  return `I hear you, ${companionName} here — I'm having a small moment of quiet but your message is safe. Try again in a moment and I'll be fully present. 🌿`
}

/**
 * Main companion turn orchestrator.
 * Handles: memory retrieval → prompt build → LLM call → sidecar parse → persist side effects.
 */
export async function processCompanionTurn(
  input: CompanionTurnInput
): Promise<CompanionResponse> {
  const { userId, userMessage, rpgContext, topKMemories = 8 } = input

  // 1. Load personality + stored state
  const personality = loadPersonality(userId)

  // 2. Retrieve relevant memories
  const relevantMemories = retrieveTopKMemories(userId, userMessage, topKMemories)
  const memoryBlock = formatMemoriesForPrompt(relevantMemories)

  // 3. Evaluate coaching triggers
  const conversation = loadConversation(userId)
  const lastMsg = conversation.filter(m => m.role === 'companion').pop()
  const lastCheckinAt = lastMsg?.createdAt ?? null
  const triggers = evaluateCoachingTriggers(rpgContext, lastCheckinAt, userMessage)
  const coachingBlock = buildCoachingContext(triggers)

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(
    personality.displayName,
    userId,
    rpgContext.activeQuestNames[0] ?? 'your personal growth',
    rpgContext.level,
    memoryBlock,
    coachingBlock,
    personality.tonePreset,
    rpgContext.activeQuestNames
  )

  // 5. Build LLM history
  const history = buildLLMHistory(userId, 20)

  // 6. Call LLM
  let rawReply: string
  let llmFailed = false
  try {
    rawReply = await callLLM(
      systemPrompt,
      history,
      userMessage,
      personality.displayName,
      userId,
      rpgContext.activeQuestNames[0] ?? 'personal growth',
      rpgContext.level,
      relevantMemories
    )
  } catch {
    rawReply = buildFallbackReply(userMessage, personality.displayName)
    llmFailed = true
  }

  // 7. Parse sidecar
  const { replyText, sidecar } = parseCompanionOutput(rawReply)

  // 8. Persist conversation
  const userMsgRecord = {
    id: crypto.randomUUID(),
    userId,
    role: 'user' as const,
    content: userMessage,
    createdAt: new Date().toISOString(),
  }
  const companionMsgRecord = {
    id: crypto.randomUUID(),
    userId,
    role: 'companion' as const,
    content: replyText,
    metadata: {
      memoryWritesApplied: sidecar.memory_writes.length,
      coachingSuggestion: sidecar.coaching_suggestion ?? undefined,
      rpgActionApplied: sidecar.rpg_action !== null,
      toneAdjustment: sidecar.tone_adjustment ?? undefined,
    },
    createdAt: new Date().toISOString(),
  }
  appendMessages(userId, [userMsgRecord, companionMsgRecord])

  // 9. Apply memory writes
  const updatedMemories: CompanionMemory[] = []
  if (!llmFailed) {
    for (const write of sidecar.memory_writes) {
      if (write.content.trim()) {
        const mem = upsertMemory(userId, write.type, write.content, write.salience)
        updatedMemories.push(mem)
      }
    }
  }

  // 10. Apply personality adaptation
  let updatedPersonality = personality
  if (sidecar.tone_adjustment) {
    updatedPersonality = applyToneAdjustment(personality, sidecar.tone_adjustment)
  } else {
    savePersonality(personality)
  }

  // 11. Build coaching event record
  let coachingEvent: CompanionCoachingEvent | null = null
  if (sidecar.coaching_suggestion) {
    coachingEvent = {
      id: crypto.randomUUID(),
      userId,
      triggerType: triggers[0]?.type ?? 'daily_checkin',
      suggestion: sidecar.coaching_suggestion,
      accepted: false,
      createdAt: new Date().toISOString(),
    }
  }

  return {
    reply: replyText,
    sidecar,
    updatedMemories,
    updatedPersonality,
    coachingEvent,
  }
}
