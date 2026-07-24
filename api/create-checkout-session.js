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
      success_url: `${process.env.PUBLIC_URL || 'https://thoughtica.vercel.app'}/?payment_success=true&tier=${tier}`,
      cancel_url: `${process.env.PUBLIC_URL || 'https://thoughtica.vercel.app'}/?payment_cancelled=true`,
      client_reference_id: uid, // Links the payment to the Firebase Auth User ID
    };

    if (tier === 'coffee') {
      // Tier 1: One-Time Cup of Coffee ($4.99)
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Thoughtica - Sanctuary Key (One-Time)',
              description: 'Unlock premium UI themes, custom goals, and support the developer.',
              images: ['https://thoughtica.vercel.app/logo-book.jpg'],
            },
            unit_amount: 499, // $4.99
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'payment';
    } else if (tier === 'monthly') {
      // Tier 2: Sanctuary Subscription ($9.99/mo)
      sessionConfig.line_items = [
        {
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: 'Thoughtica - Sovereign Membership',
              description: 'Full access to voice narration, quantum essence analytics, and cloud backups.',
              images: ['https://thoughtica.vercel.app/logo-book.jpg'],
            },
            unit_amount: 999, // $9.99
          },
          quantity: 1,
        },
      ];
      sessionConfig.mode = 'subscription';
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
