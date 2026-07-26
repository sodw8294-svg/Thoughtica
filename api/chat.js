module.exports = async (req, res) => {
  // 1) Method guard
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // 2) Environment key validation
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: OPENAI_API_KEY is missing.' });
  }

  try {
    const { message } = req.body ?? {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: "Invalid request: 'message' must be a non-empty string." });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content:
              "You are Thoughtica's RPG Life Coach. Analyze the user's reflection or action, then return an encouraging RPG-style narrative response with fair XP and stat increases. Keep output strictly valid to the provided JSON schema.",
          },
          {
            role: 'user',
            content: message.trim(),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'thoughtica_life_rpg_response',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                reply: {
                  type: 'string',
                  description:
                    "An encouraging, RPG-style narrative message responding to the user's reflection or action.",
                },
                xpGained: {
                  type: 'integer',
                  description: 'Total XP granted (10 to 50).',
                },
                statIncreases: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    discipline: { type: 'integer' },
                    wisdom: { type: 'integer' },
                    focus: { type: 'integer' },
                    vitality: { type: 'integer' },
                  },
                  required: ['discipline', 'wisdom', 'focus', 'vitality'],
                },
                questDetected: {
                  anyOf: [
                    { type: 'null' },
                    {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        title: { type: 'string' },
                        difficulty: {
                          type: 'string',
                          enum: ['easy', 'medium', 'hard', 'epic'],
                        },
                        completed: { type: 'boolean' },
                      },
                      required: ['title', 'difficulty', 'completed'],
                    },
                  ],
                },
              },
              required: ['reply', 'xpGained', 'statIncreases', 'questDetected'],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return res.status(500).json({
        error: 'OpenAI request failed.',
        details: errorText || `HTTP ${response.status}`,
      });
    }

    const data = await response.json();

    // Responses API returns structured output text in output[0].content[0].text or output_text
    let parsed;
    try {
      const text = data?.output?.[0]?.content?.[0]?.text ?? data?.output_text;
      parsed = typeof text === 'string' ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!parsed) {
      return res.status(500).json({ error: 'Model returned invalid structured output.' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: 'Internal server error.',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
};
