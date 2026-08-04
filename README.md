# thoughtica.io – Life RPG Sanctuary

A gamified personal growth app with an AI companion named **Kora**.

## Kora AI Companion — Genuine Companion System

Kora is designed to be a persistent, adaptive companion that learns from users over time and supports them in emotional, coaching, and practical ways.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│        Frontend (index.html)    │
│                                 │
│  ┌──────────────────────────┐   │
│  │ Companion Memory Layer   │   │
│  │  • S.customAI.memories[] │   │
│  │  • S.customAI.memoryEnabled│ │
│  │  • S.customAI.supportMode │  │
│  └──────────────────────────┘   │
│              │                  │
│  ┌──────────────────────────┐   │
│  │ Memory Command Handler   │   │
│  │  sendCustomAIChat()      │   │
│  │  • "remember this"       │   │
│  │  • "forget X"            │   │
│  │  • "what do you remember"│   │
│  │  • "don't remember this" │   │
│  └──────────────────────────┘   │
│              │                  │
│  ┌──────────────────────────┐   │
│  │ Auto-Memory Extraction   │   │
│  │  extractCandidateMemories│   │
│  │  (preferences, goals,    │   │
│  │   routines, identity...) │   │
│  └──────────────────────────┘   │
│              │                  │
└──────────────┼──────────────────┘
               │ POST /api/chat
               │  { userText, messages,
               │    memoryContext[],
               │    supportMode }
               ▼
┌─────────────────────────────────┐
│        api/chat.js              │
│                                 │
│  • buildSystemPrompt()          │
│    - Injects memory items       │
│    - Injects support mode       │
│    - Safety guardrails          │
│  • Provider fallback chain:     │
│    Gemini → Groq → OpenAI       │
│  • Proper error envelopes       │
│    PROVIDER_NOT_CONFIGURED 503  │
│    PROVIDER_UNAVAILABLE 502     │
└─────────────────────────────────┘
```

---

## Memory Data Model

Each memory item stored in `S.customAI.memories[]`:

```json
{
  "id": "mem_1700000000000_ab12",
  "text": "Likes morning runs",
  "category": "preference",
  "confidence": 0.75,
  "source": "auto",
  "timestamp": 1700000000000
}
```

### Categories

| Category | Description |
|---|---|
| `preference` | Likes, dislikes, preferences |
| `goal` | Goals and ambitions |
| `routine` | Habits and routines |
| `identity` | Name, age, location |
| `challenge` | Current struggles |
| `tone` | Communication style preferences |
| `explicit` | User-commanded "remember this" |
| `general` | Other facts |

### Confidence Thresholds

- `>= 0.5`: Injected into system prompt
- `< 0.5`: Stored but not injected (reserved for uncertain extractions)
- `1.0`: Manual entries or explicit "remember this" commands

---

## Support Modes

Kora supports four modes that change her behavior:

| Mode | Trigger | Behavior |
|---|---|---|
| `emotional` | User selects or distress words detected | Active listening, reflection, validation |
| `coaching` | User selects or goal/accountability words | Structured check-ins, progress tracking |
| `practical` | User selects or task/decision words | Concise steps, decision frameworks |
| `crisis` | User selects or crisis signals detected | Warm support + professional help prompt |

**Auto-detection**: Kora detects the likely appropriate mode from user input when no mode is explicitly set.

---

## Kora Chat Commands

Users can type these in the companion chat:

| Command | Action |
|---|---|
| `"remember this"` | Stores the previous message as a memory fact |
| `"don't remember this"` | Signals this exchange should not be stored |
| `"forget my [X]"` | Removes memory items matching [X] |
| `"what do you remember about me?"` | Shows all stored memories |

---

## User Controls

**Memory Vault tab** in the Kora companion panel:

- **Memory ON/OFF toggle** — disable auto-learning at any time
- **Support Mode selector** — choose between Auto/Emotional/Coaching/Practical
- **Seal New Memory Fact** — manually add memory items
- **Edit/Delete individual memories** — full control over what's stored
- **Clear All** — permanently removes all memories

---

## API Reference

### `POST /api/chat`

**Request body:**

```json
{
  "userText": "string (required)",
  "messages": [{ "role": "user|assistant", "content": "string" }],
  "conversationId": "string (optional)",
  "companionName": "string (default: Kora)",
  "userName": "string (default: Seeker)",
  "userGoal": "string",
  "userLevel": 1,
  "memoryContext": [
    { "text": "string", "category": "string", "confidence": 0.0-1.0 }
  ],
  "supportMode": "emotional|coaching|practical|crisis|''"
}
```

**Success response (200):**

```json
{
  "reply": "string",
  "provider": "gemini|groq|openai",
  "conversationId": "string"
}
```

**Error responses:**

| Status | Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing/invalid userText |
| 400 | `INVALID_BODY` | Non-JSON body |
| 503 | `PROVIDER_NOT_CONFIGURED` | No API keys configured |
| 502 | `PROVIDER_UNAVAILABLE` | All providers failed |

---

## Safety Guardrails

1. **No manipulative language** — System prompt explicitly prohibits dependency-forming language
2. **Crisis detection** — Pattern matching for self-harm/crisis phrases triggers crisis support mode
3. **Non-professional disclaimer** — Kora's system prompt always clarifies she is a companion, not a licensed professional
4. **Conservative memory extraction** — Only high-confidence explicit phrases are auto-stored (confidence 0.75)
5. **User privacy** — Memory learning can be disabled at any time; all data stored locally

---

## Development

### Running tests

```bash
node --test test/chat-api.test.js test/chat-frontend-regression.test.js test/kora-companion.test.js test/kora-frontend.test.js
```

### Environment variables (for `api/chat.js`)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Gemini model (default: `gemini-1.5-flash`) |
| `GROQ_API_KEY` | Groq API key |
| `GROQ_MODEL` | Groq model (default: `llama3-8b-8192`) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | OpenAI model (default: `gpt-4o-mini`) |
| `AI_CHAT_TIMEOUT_MS` | Request timeout (default: 15000ms) |

---

## Design Decisions & Tradeoffs

**Memory storage**: Memories are stored in `localStorage` via the `S` state object. This keeps the system simple (no database required) and fully client-controlled, but means memory is per-device.

**Memory extraction**: Auto-extraction uses conservative regex patterns targeting only high-signal phrases (e.g., "my goal is", "I love", "every morning I"). This avoids false positives at the cost of missing some implicit preferences.

**Crisis detection**: Uses phrase-level matching (not single words) with negative lookahead for common figurative uses. This reduces false positives while catching clear distress signals. A note about limitations is important — this is not a substitute for professional crisis services.

**Provider fallback**: Kora's companion chat tries `/api/chat` first (which uses configured server-side keys), then falls back through Pollinations.ai (free), then BYOK (user-provided key), then offline wisdom. This maximizes availability.

**Support mode auto-detection**: The frontend infers support mode from keyword patterns. Users can override this in the Memory Vault settings. Auto-detection intentionally over-triggers (e.g., mentioning "anxious" → emotional mode) to err on the side of more supportive responses.

## Follow-up Recommendations

- **Server-side memory persistence**: Move memory to a database (Firestore is already configured) for cross-device sync
- **Embedding-based memory retrieval**: Replace recency-based selection with semantic similarity for more relevant context injection
- **Confirmation UX for uncertain extractions**: Show a toast asking "Should I remember this?" for auto-extracted memories
- **Proactive check-ins**: Use the existing `buildKoraMorningBriefing` infrastructure to add goal-based check-in notifications
- **Memory categories UI**: Add category filtering in the Memory Vault for easier organization

---

## AI Companion System (Full Implementation)

### Architecture

```
CompanionTurnInput
      │
      ▼
┌─────────────────────────────────────────────┐
│  src/lib/companion/orchestrator.ts          │
│                                             │
│  1. loadPersonality() ──────────────────┐   │
│  2. retrieveTopKMemories(query, k=8) ───┤   │
│  3. evaluateCoachingTriggers() ─────────┤   │
│  4. buildSystemPrompt() ────────────────┤   │
│  5. buildLLMHistory(userId, 20) ────────┘   │
│  6. POST /api/chat                          │
│  7. parseCompanionOutput(raw)               │
│  8. appendMessages() (persist history)      │
│  9. upsertMemory() for each write           │
│ 10. applyToneAdjustment()                   │
│ 11. return CompanionResponse                │
└─────────────────────────────────────────────┘
```

### Key Modules

| File | Purpose |
|------|---------|
| `src/lib/companion/types.ts` | All shared TypeScript interfaces |
| `src/lib/companion/memory.ts` | Long-term memory store (localStorage) + top-k retrieval |
| `src/lib/companion/conversation.ts` | Conversation history persistence |
| `src/lib/companion/personality.ts` | Personality profile + tone adaptation |
| `src/lib/companion/sidecar.ts` | Structured JSON sidecar parser |
| `src/lib/companion/coaching.ts` | Deterministic coaching trigger evaluation |
| `src/lib/companion/orchestrator.ts` | Main turn orchestrator |
| `src/lib/companion/index.ts` | Public API exports |

### Data Model

**Memory** (`CompanionMemory`):
- `type`: `fact | preference | event | goal | insight`
- `content`: up to 300 chars
- `salience`: 0–1 relevance score (increases with reinforcement)
- Stored in localStorage under `thoughtica-companion-memories-{userId}`
- Top-k retrieval via keyword-salience scoring (graceful fallback when embeddings unavailable)

**Personality** (`CompanionPersonalityProfile`):
- `tonePreset`: `supportive | direct | playful | minimal`
- `verbosity`: 0–1
- `coachingStyle`: `gentle | structured | socratic`
- Gradually adapted from `tone_adjustment` sidecar signals

**Conversation** (`CompanionConversationMessage`):
- Full history stored in localStorage
- Last 20 messages injected into LLM context per turn
- Max 100 messages retained

**Sidecar Schema** (returned by LLM after visible reply):
```json
{
  "memory_writes": [{"type": "goal", "content": "...", "salience": 0.8}],
  "coaching_suggestion": "string or null",
  "rpg_action": {"type": "xp_grant|quest_complete|quest_add", "label": "...", "xp": 25} | null,
  "tone_adjustment": "supportive|direct|playful|minimal" | null
}
```

### Sanctuary Chat Natural Behavior

The system prompt explicitly instructs:
- Always respond naturally to greetings/small talk **first**
- Answer general questions directly before adding coaching context
- Never fabricate user history not present in memory

Saying "hi" will get a warm conversational response, not a coaching lecture.

### RPG Integration Safety

- `rpg_action.xp` is capped at 200 per turn in the orchestrator
- Only `xp_grant`, `quest_complete`, `quest_add` are valid RPG action types
- Invalid/unknown types are silently dropped by the sidecar normalizer
- XP is applied atomically via `setState` callback (no mutation of stale state)

### Environment Variables for LLM

The companion uses `/api/chat` which requires at least one provider key:

```env
GEMINI_API_KEY=...        # Google Gemini (tried first)
GROQ_API_KEY=...          # Groq (tried second)
OPENAI_API_KEY=...        # OpenAI (tried third)

GEMINI_MODEL=gemini-1.5-flash   # optional, default: gemini-1.5-flash
GROQ_MODEL=llama3-8b-8192       # optional
OPENAI_MODEL=gpt-4o-mini        # optional

AI_CHAT_TIMEOUT_MS=15000        # optional, default: 15000
```

### Testing the Companion

```bash
cd test
node --test companion-system.test.js    # companion-specific tests
node --test                             # full suite (64 tests)
```

Key test coverage:
- Greeting response: sidecar parser returns full text for plain replies
- Memory extraction: writes with empty content are dropped
- RPG safety: XP capped at 500 by normalizer, invalid action types rejected
- Coaching triggers: streak risk, daily check-in, goal staleness
- Pricing: $4.99 price in checkout handler, legacy tier mapping

---

## Pricing Model (Freemium)

Two plans only:

| Plan | Price | Features |
|------|-------|---------|
| **Free** | $0/mo | Core AI companion, 10 daily AI interactions, basic soundscapes |
| **Pro** | $4.99/mo | Unlimited AI, long-term memory, proactive coaching, all soundscapes, soul reports, full RPG |

Legacy tier names (`kindred`, `soulbound`, `plus`, `infinite`, `transcendence`) are all mapped to Pro in `api/create-checkout-session.js` for backward compatibility with any existing Stripe links.

Cosmetic one-time purchases ($1.99 each) remain supported: `theme_midnight`, `theme_zen`, `aura_rain`.

