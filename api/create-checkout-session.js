const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Whitelist of valid tiers to prevent arbitrary tier injection
const VALID_TIERS = {
  kindred: { mode: 'subscription', amount: 299, name: 'Kindred' },
  soulbound: { mode: 'subscription', amount: 999, name: 'Soulbound' },
  transcendence: { mode: 'subscription', amount: 1999, name: 'Transcendence' },
  theme_midnight: { mode: 'payment', amount: 199, name: 'Theme: Midnight Void' },
  theme_zen: { mode: 'payment', amount: 199, name: 'Theme: Zen Garden' },
  aura_rain: { mode: 'payment', amount: 199, name: 'Aura: Mountain Rain' }
};

// Validate Firebase UID format (basic check)
const isValidUID = (uid) => {
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(uid);
};

module.exports = async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://thoughtica.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { tier, uid } = req.body || {};

  // Validate required fields
  if (!tier || typeof tier !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid tier' });
  }
  if (!uid || !isValidUID(uid)) {
    return res.status(400).json({ error: 'Missing or invalid uid' });
  }

  // Validate tier against whitelist
  if (!VALID_TIERS[tier]) {
    return res.status(400).json({ error: 'Invalid tier specified' });
  }

  try {
    const tierConfig = VALID_TIERS[tier];
    const publicUrl = process.env.PUBLIC_URL || 'https://thoughtica.io';

    let sessionConfig = {
      payment_method_types: ['card'],
      success_url: `${publicUrl}/?payment_success=true&tier=${encodeURIComponent(tier)}`,
      cancel_url: `${publicUrl}/?payment_cancelled=true`,
      client_reference_id: uid,
      metadata: { tier: tier }
    };

    if (tierConfig.mode === 'subscription') {
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: `thoughtica.io - ${tierConfig.name}`,
              description: 'Premium companion tier for Thoughtica',
              images: ['https://thoughtica.io/logo-book.jpg']
            },
            unit_amount: tierConfig.amount
          },
          quantity: 1
        }
      ];
      sessionConfig.mode = 'subscription';
    } else {
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Thoughtica - ${tierConfig.name}`,
              description: 'Cosmetic upgrade for your sanctuary',
              images: ['https://thoughtica.io/logo-book.jpg']
            },
            unit_amount: tierConfig.amount
          },
          quantity: 1
        }
      ];
      sessionConfig.mode = 'payment';
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Error:', error.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};