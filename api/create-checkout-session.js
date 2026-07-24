const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { tier, uid } = req.body;

  if (!tier || !uid) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let sessionConfig = {
      payment_method_types: ['card'],
      success_url: `${process.env.PUBLIC_URL || 'https://thoughtica.io'}/?payment_success=true&tier=${tier}`,
      cancel_url: `${process.env.PUBLIC_URL || 'https://thoughtica.io'}/?payment_cancelled=true`,
      client_reference_id: uid, // Links the payment to the Firebase Auth User ID
      metadata: { tier: tier }
    };

    if (tier === 'kindred') {
      // Tier 1: Kindred ($2.99/mo)
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'thoughtica.io - Kindred',
              description: 'Increased daily interactions and expanded memory.',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 299, // $2.99
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
    } else if (tier === 'soulbound') {
      // Tier 2: Soulbound ($9.99/mo)
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'thoughtica.io - Soulbound',
              description: 'Voice conversations, long-term memory, and companion evolution.',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 999, // $9.99
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
    } else if (tier === 'transcendence') {
      // Tier 3: Transcendence ($19.99/mo)
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'thoughtica.io - Transcendence',
              description: 'Multiple companions, max memory, and exclusive options.',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 1999, // $19.99
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
    } else if (tier === 'theme_midnight' || tier === 'theme_zen' || tier === 'aura_rain') {
      // Cosmetics ($1.99 one-time)
      let name = 'Cosmetic Unlock';
      if (tier === 'theme_midnight') name = 'Theme: Midnight Void';
      if (tier === 'theme_zen') name = 'Theme: Zen Garden';
      if (tier === 'aura_rain') name = 'Aura: Mountain Rain';

      sessionConfig.line_items = [
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
      ];
      sessionConfig.mode = 'payment';
    } else {
      return res.status(400).json({ error: 'Invalid tier specified' });
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
