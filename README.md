# Thoughtica Life RPG

## Local development

```bash
npm ci
npm run dev
```

## AI Companion chatbot configuration

The chatbot backend endpoint is `/api/chat` and supports multi-turn context via `conversationId` + recent message history.

Set at least one provider key:

- `GEMINI_API_KEY` (optional `GEMINI_MODEL`, default: `gemini-1.5-flash`)
- `GROQ_API_KEY` (optional `GROQ_MODEL`, default: `llama3-8b-8192`)
- `OPENAI_API_KEY` (optional `OPENAI_MODEL`, default: `gpt-4o-mini`)

Optional reliability tuning:

- `AI_CHAT_TIMEOUT_MS` (default `15000`, clamped between `3000` and `30000`)

If no provider key is configured, `/api/chat` returns a structured error envelope so the client can gracefully fall back.

## Verification commands

```bash
npm test
npm run build
```

## Deployment notes

- Ensure at least one AI provider API key is configured in deployment environment variables.
- Chat endpoint gracefully fails with `PROVIDER_NOT_CONFIGURED` / `PROVIDER_UNAVAILABLE` error codes (no secrets returned).
- Rollback is low risk: revert `/api/chat.js`, `src/index.html`, and chatbot tests/docs changes.
