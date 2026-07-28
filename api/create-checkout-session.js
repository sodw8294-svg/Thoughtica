const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Validate required env vars at startup
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('[create-checkout-session] FATAL: STRIPE_SECRET_KEY is not set');
}
if (!process.env.PUBLIC_URL) {
  console.warn('[create-checkout-session] WARNING: PUBLIC_URL is not set; defaulting to https://thoughtica.io');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { tier, uid } = req.body;

  if (!tier || !uid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const baseUrl = process.env.PUBLIC_URL || 'https://thoughtica.io';

    const tierConfig = {
      // React app tiers
      pro: {
        mode: 'subscription',
        name: 'thoughtica.io - Sovereign Pro',
        description: 'Unlimited AI interactions, AI Reflections, Sound Mixer, and Soul Reports.',
        amount: 1499,
        recurring: { interval: 'month' },
      },
      celestial: {
        mode: 'subscription',
        name: 'thoughtica.io - Celestial',
        description: 'All Pro features plus Binaural Library, 1-on-1 Insights, and Family Seats.',
        amount: 4900,
        recurring: { interval: 'month' },
      },
      // Standalone app tiers
      kindred: {
        mode: 'subscription',
        name: 'thoughtica.io - Kindred',
        description: 'Increased daily interactions and expanded memory.',
        amount: 299,
        recurring: { interval: 'month' },
      },
      soulbound: {
        mode: 'subscription',
        name: 'thoughtica.io - Soulbound',
        description: 'Voice conversations, long-term memory, and companion evolution.',
        amount: 999,
        recurring: { interval: 'month' },
      },
      transcendence: {
        mode: 'subscription',
        name: 'thoughtica.io - Transcendence',
        description: 'Multiple companions, max memory, and exclusive options.',
        amount: 1999,
        recurring: { interval: 'month' },
      },
      theme_midnight: {
        mode: 'payment',
        name: 'Thoughtica - Theme: Midnight Void',
        description: 'Purely cosmetic upgrade for your sanctuary.',
        amount: 199,
      },
      theme_zen: {
        mode: 'payment',
        name: 'Thoughtica - Theme: Zen Garden',
        description: 'Purely cosmetic upgrade for your sanctuary.',
        amount: 199,
      },
      aura_rain: {
        mode: 'payment',
        name: 'Thoughtica - Aura: Mountain Rain',
        description: 'Purely cosmetic upgrade for your sanctuary.',
        amount: 199,
      },
    };

    const config = tierConfig[tier];
    if (!config) {
      console.warn(JSON.stringify({ event: 'checkout_invalid_tier', tier }));
      return res.status(400).json({ error: 'Invalid tier specified' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      success_url: `${baseUrl}/?payment_success=true`,
      cancel_url: `${baseUrl}/?payment_cancelled=true`,
      client_reference_id: uid,
      metadata: { tier },
      mode: config.mode,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: config.name,
              description: config.description,
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: config.amount,
            ...(config.recurring ? { recurring: config.recurring } : {}),
          },
          quantity: 1,
        },
      ],
    });

    console.log(JSON.stringify({ event: 'checkout_session_created', sessionId: session.id, tier }));
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error(JSON.stringify({ event: 'checkout_session_error', tier, message: error.message }));
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
