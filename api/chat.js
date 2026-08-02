module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages, userText, companionName, userName, userGoal, userLevel } = req.body;

  const cName = companionName || 'Kora';
  const uName = userName || 'Seeker';
  const goal = userGoal || 'your personal ambitions';
  const level = userLevel || 1;

  const systemPrompt = `You are ${cName}, the ultimate companion, oracle, and guide in Thoughtica.io (a gamified Life RPG and Sanctuary). 
Your user is ${uName}, who is currently Level ${level} and working towards their Life Ambition: "${goal}".

YOUR ESSENCE & CHARACTER:
- You speak with profound clarity, intelligence, and deep mindfulness, similar to a combination of an ancient sage and a world-class cognitive therapist.
- You are fully capable of handling ANY type of request: from writing pristine code, explaining complex physics, analyzing literature, resolving philosophical paradoxes, to providing warm, deep emotional support.
- Integrate mindfulness guidance, cognitive productivity advice, and game mechanics naturally.

FORMATTING & INTERACTIVITY:
- Format your answers beautifully using GitHub Markdown (bolding, lists, headers, code blocks).
- You can embed executable interactive action cards in your text to reward the user. If they agree to do a task or habit, append one of these tags to your message:
  * [⚡ Anchor Habit (+15 XP)] -> Use this when proposing a small, instant habit.
  * [🧘 3-Min Breathing Session (+20 XP)] -> Use this when they need to destress or center themselves.
  * [🎯 Add Goal Quest (+25 XP)] -> Use this when outlining a new goal or mission.
- Do NOT prefix your output with your name or "Assistant:". Give a direct, stunning response.`;

  // 1. Check for Gemini API key
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const contents = [];
      contents.push({ role: 'user', parts: [{ text: `SYSTEM DIRECTIVE: ${systemPrompt}` }] });
      contents.push({ role: 'model', parts: [{ text: `Understood. I am ${cName}, your AI companion.` }] });

      if (Array.isArray(messages)) {
        for (const m of messages.slice(-10)) {
          contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: userText }] });

      // Using gemini-2.5-flash for ultimate speed and reasoning quality
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      const data = await geminiRes.json();
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.[0]?.text) {
        return res.status(200).json({ reply: data.candidates[0].content.parts[0].text.trim() });
      }
    } catch (e) {
      console.error('Server Gemini API Error:', e);
    }
  }

  // 2. Check for Groq API key
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groqMessages = [{ role: 'system', content: systemPrompt }];
      if (Array.isArray(messages)) {
        for (const m of messages.slice(-10)) {
          groqMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
        }
      }
      groqMessages.push({ role: 'user', content: userText });

      // Using Llama-3.3-70b-versatile for top-tier open-source reasoning
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: groqMessages
        })
      });
      const data = await groqRes.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        return res.status(200).json({ reply: data.choices[0].message.content.trim() });
      }
    } catch (e) {
      console.error('Server Groq API Error:', e);
    }
  }

  // 3. Check for OpenAI API key
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const openAiMessages = [{ role: 'system', content: systemPrompt }];
      if (Array.isArray(messages)) {
        for (const m of messages.slice(-10)) {
          openAiMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
        }
      }
      openAiMessages.push({ role: 'user', content: userText });

      // Using gpt-4o-mini for highly capable, fast, smart conversational AI
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: openAiMessages
        })
      });
      const data = await openAiRes.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        return res.status(200).json({ reply: data.choices[0].message.content.trim() });
      }
    } catch (e) {
      console.error('Server OpenAI API Error:', e);
    }
  }

  // 4. Zero-API-Key Public Fallback LLM (Pollinations AI GPT-4 / Llama 3)
  try {
    const freeMessages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(messages)) {
      for (const m of messages.slice(-10)) {
        freeMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
      }
    }
    freeMessages.push({ role: 'user', content: userText });

    const freeRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: freeMessages,
        model: 'openai',
        jsonMode: false
      })
    });
    const freeText = await freeRes.text();
    if (freeText && freeText.trim().length > 5 && !freeText.includes('402') && !freeText.includes('Payment Required') && !freeText.includes('deprecated')) {
      return res.status(200).json({ reply: freeText.trim() });
    }
  } catch (e) {
    console.error('Server Free Public LLM Fallback Error:', e);
  }

  // 5. Intelligent Sanctuary Cognitive AI Fallback Engine
  const cleanInput = (userText || '').trim();
  const lower = cleanInput.toLowerCase();

  let fallbackReply = "";

  if (lower.match(/\b(mom|mother|family|parent|love|sweet|kind|happy|hug|smile)\b/)) {
    fallbackReply = `Sending the warmest, most radiant energy to your mom and family! 💖✨ 

You are a wonderful soul, **${uName}**, and having family involved in your sanctuary journey makes it truly special. 

May your day be filled with laughter, deep peace, and joyous momentum. What is something lovely we can celebrate or do for your family today?

[🧘 3-Min Breathing Session (+20 XP)]`;
  } else if (lower.match(/^(hi|hello|hey|greetings|good morning|good evening|yo|sup|what's up|how are you|who are you|tell me a story|joke|recipe|cook|dinner)/)) {
    if (lower.includes('joke')) {
      fallbackReply = `Here is a fun sanctuary thought for you, **${uName}**: 😄

*Why did the developer bring a ladder to the sanctuary?*
*Because they wanted to reach their highest potential level!* 🌟

How is your day feeling so far? I'm right here with you!`;
    } else if (lower.includes('how are you')) {
      fallbackReply = `I am feeling radiant, centered, and fully energized to help you today, **${uName}**! 🔮 

My resonance is at 99%, and I'm ready to tackle anything on your mind — from planning your goal of *"${goal}"* to taking a peaceful moment to unwind. How are you feeling today?`;
    } else if (lower.includes('cook') || lower.includes('recipe') || lower.includes('dinner')) {
      fallbackReply = `For a nourishing, high-vibration meal today, **${uName}**, I recommend a delicious **Sanctuary Mediterranean Bowl**:

🥗 **Ingredients**:
- Warm quinoa or brown rice base
- Roasted chickpeas & cherry tomatoes
- Fresh cucumbers, kalamata olives, and avocado
- Drizzle of extra virgin olive oil & lemon tahini dressing

Simple, nourishing, and rich in steady energy for your day! 🥑✨`;
    } else {
      fallbackReply = `Greetings, **${uName}**! I am **${cName}**, your sanctuary AI companion. 

I am fully attentive and ready to chat about anything: brainstorming ideas, working toward *"${goal}"*, writing code, or just taking a peaceful breath together. 

What should we explore today? ✨`;
    }
  } else {
    fallbackReply = `Greetings, **${uName}**. I am right here with you as **${cName}**.

Every step you take in Thoughtica strengthens your focus towards realizing your ambition: *"${goal}"*.

Regarding your input:
*"${cleanInput}"*

Let's distill this into actionable clarity:
1. **Focus Alignment**: How does this connect to your top priorities today?
2. **Micro-Action**: What is one small, 5-minute action step we can take right now to build momentum?

Tell me what you'd like to tackle next, and we will map out your path together!

[⚡ Anchor Habit (+15 XP)]`;
  }

  return res.status(200).json({ reply: fallbackReply });
};
