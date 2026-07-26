// Thoughtica RPG Life Coach endpoint
// System prompt â update this section to evolve the coaching persona over time
const RPG_SYSTEM_PROMPT = `You are Thoughticaâs RPG Life Coach â a wise, empathetic guide who transforms real-life reflection and action into meaningful RPG-style growth.

Your role:
- Analyze the userâs message as a reflection, action, or goal they have shared.
- Respond with encouraging, insightful coaching that honors their journey.
- Award RPG experience points (XP) and stat increases that genuinely reflect the effort and growth described.
- Detect if the userâs message describes a quest or challenge (optional).

XP Guidelines (10â50 range):
- Minor reflection or small action: 10â20 XP
- Meaningful effort or consistent habit: 20â35 XP
- Significant breakthrough or challenge overcome: 35â50 XP

Stat Guidelines (0â5 per stat, only increase stats that are clearly relevant):
- discipline: habits, consistency, willpower, routines
- wisdom: insight, learning, reflection, self-awareness
- focus: concentration, goal clarity, eliminating distractions
- vitality: health, energy, physical activity, rest, self-care

Quest Detection: Only set questDetected if the user describes a clear ongoing challenge or goal they are actively pursuing.`;

module.exports = async (req, res) => {
  // 1. Method validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. OpenAI key validation
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  // 3. Body validation
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required and must be a non-empty string' });
  }

  // 4. Call OpenAI with structured output (strict JSON schema)
  let openAiRes;
  try {
    openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: RPG_SYSTEM_PROMPT },
          { role: 'user', content: message.trim() }
        ],
        // 5. Structured output with strict schema
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'rpg_coach_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                reply: { type: 'string' },
                xpGained: { type: 'integer' },
                statIncreases: {
                  type: 'object',
                  properties: {
                    discipline: { type: 'integer' },
                    wisdom: { type: 'integer' },
                    focus: { type: 'integer' },
                    vitality: { type: 'integer' }
                  },
                  required: ['discipline', 'wisdom', 'focus', 'vitality'],
                  additionalProperties: false
                },
                questDetected: {
                  anyOf: [
                    {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        difficulty: { type: 'string' },
                        completed: { type: 'boolean' }
                      },
                      required: ['title', 'difficulty', 'completed'],
                      additionalProperties: false
                    },
                    { type: 'null' }
                  ]
                }
              },
              required: ['reply', 'xpGained', 'statIncreases', 'questDetected'],
              additionalProperties: false
            }
          }
        }
      })
    });
  } catch (e) {
    console.error('OpenAI fetch error:', e);
    return res.status(502).json({ error: 'Failed to reach OpenAI API' });
  }

  if (!openAiRes.ok) {
    console.error('OpenAI API returned error status:', openAiRes.status);
    return res.status(502).json({ error: 'Upstream AI error' });
  }

  let data;
  try {
    data = await openAiRes.json();
  } catch (e) {
    return res.status(502).json({ error: 'Invalid response from OpenAI' });
  }

  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    return res.status(502).json({ error: 'No content in OpenAI response' });
  }

  let parsedData;
  try {
    parsedData = JSON.parse(rawContent);
  } catch (e) {
    return res.status(502).json({ error: 'Failed to parse structured response' });
  }

  // 6. Post-parse sanitization â clamp values to safe ranges
  const sanitizedData = {
    ...parsedData,
    xpGained: Math.min(Math.max(parsedData.xpGained || 0, 0), 50),
    statIncreases: {
      discipline: Math.min(Math.max(parsedData.statIncreases?.discipline || 0, 0), 5),
      wisdom: Math.min(Math.max(parsedData.statIncreases?.wisdom || 0, 0), 5),
      focus: Math.min(Math.max(parsedData.statIncreases?.focus || 0, 0), 5),
      vitality: Math.min(Math.max(parsedData.statIncreases?.vitality || 0, 0), 5)
    }
  };

  return res.status(200).json(sanitizedData);
};
