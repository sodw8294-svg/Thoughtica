const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
  // Handle CORS preflight
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Validate required environment variable before use
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe] STRIPE_SECRET_KEY is not configured');
    return res.status(503).json({ error: 'Payment service is not configured. Contact support.' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  const { tier, uid } = req.body;

  if (!tier || !uid) {
    return res.status(400).json({ error: 'Missing required fields: tier and uid' });
  }

  try {
    const baseUrl = process.env.PUBLIC_URL || 'https://thoughtica.io';

    const tierConfig = {
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
      return res.status(400).json({ error: 'Invalid tier specified' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      success_url: `${baseUrl}/?payment_success=true&tier=${tier}`,
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

    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    const userMessage = error.type === 'StripeAuthenticationError'
      ? 'Payment service configuration error. Contact support.'
      : 'Failed to start checkout. Please try again.';
    res.status(500).json({ error: userMessage });
  }
};
