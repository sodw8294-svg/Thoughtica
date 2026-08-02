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

  try {
    let sessionConfig = {
      payment_method_types: ['card'],
      success_url: `${process.env.PUBLIC_URL || 'https://thoughtica.io'}/?payment_success=true&tier=${tier}`,
      cancel_url: `${process.env.PUBLIC_URL || 'https://thoughtica.io'}/?payment_cancelled=true`,
      client_reference_id: uid, // Links the payment to the Firebase Auth User ID
      metadata: { tier: tier }
    };

    if (tier === 'plus' || tier === 'kindred') {
      // Plus Tier: $9.99/mo
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'Thoughtica - Sanctuary Plus',
              description: 'Unlocks 12 Premium Soundscapes, Full AI Voice Resonance & Unlimited AI Memory.',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 999, // $9.99/mo
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
    } else if (tier === 'plus_annual') {
      // Plus Annual: $79.99/yr
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'year' },
            product_data: {
              name: 'Thoughtica - Sanctuary Plus (Annual)',
              description: '1 Year of Sanctuary Plus (Save 33%).',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 7999, // $79.99/yr
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
    } else if (tier === 'infinite' || tier === 'soulbound' || tier === 'transcendence') {
      // Sovereign Infinite: $19.99/mo
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'Thoughtica - Sovereign Infinite',
              description: 'All Specialized AI Guides, Custom RPG Aura Wheel, Goal Architect & Supporter Seal Badge.',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 1999, // $19.99/mo
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
    } else if (tier === 'infinite_annual') {
      // Sovereign Infinite Annual: $149.99/yr
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'year' },
            product_data: {
              name: 'Thoughtica - Sovereign Infinite (Annual)',
              description: '1 Year of Sovereign Infinite (Save 37%).',
              images: ['https://thoughtica.io/logo-book.jpg'],
            },
            unit_amount: 14999, // $149.99/yr
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
    res.status(500).json({ error: error.message || 'Stripe payment initialization error.' });
  }
};
