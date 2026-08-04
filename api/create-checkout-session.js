module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY is missing.');
    return res.status(500).json({ error: 'Stripe gateway key missing. Please ensure STRIPE_SECRET_KEY is set in Vercel settings.' });
  }

  const stripe = require('stripe')(secretKey);

  const { tier, uid } = req.body;

  if (!tier || !uid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Only two plans: free (no checkout needed) and pro ($4.99/mo).
  // Legacy tier names (kindred, soulbound, plus, infinite, transcendence) are mapped to pro.
  const LEGACY_PRO_TIERS = new Set(['pro', 'kindred', 'soulbound', 'plus', 'infinite', 'transcendence']);

  try {
    const baseUrl = process.env.PUBLIC_URL || 'https://thoughtica.io';

    if (LEGACY_PRO_TIERS.has(tier)) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              recurring: { interval: 'month' },
              product_data: {
                name: 'Thoughtica Pro',
                description: 'Unlimited AI companion, long-term memory, proactive coaching & full RPG features.',
                images: ['https://thoughtica.io/logo-book.jpg'],
              },
              unit_amount: 499, // $4.99/mo
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/?payment_success=true&tier=pro`,
        cancel_url: `${baseUrl}/?payment_cancelled=true`,
        client_reference_id: uid,
        metadata: { tier: 'pro' },
      });
      return res.status(200).json({ sessionId: session.id, url: session.url });
    }

    // Cosmetic one-time purchases remain supported
    const COSMETICS = {
      theme_midnight: 'Theme: Midnight Void',
      theme_zen: 'Theme: Zen Garden',
      aura_rain: 'Aura: Mountain Rain',
    };

    if (Object.prototype.hasOwnProperty.call(COSMETICS, tier)) {
      const name = COSMETICS[tier];
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Thoughtica - ${name}`,
                description: 'Purely cosmetic upgrade for your sanctuary.',
                images: ['https://thoughtica.io/logo-book.jpg'],
              },
              unit_amount: 199, // $1.99
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/?payment_success=true&tier=${tier}`,
        cancel_url: `${baseUrl}/?payment_cancelled=true`,
        client_reference_id: uid,
        metadata: { tier },
      });
      return res.status(200).json({ sessionId: session.id, url: session.url });
    }

    return res.status(400).json({ error: 'Invalid tier specified' });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    res.status(500).json({ error: error.message || 'Stripe payment initialization error.' });
  }
};
