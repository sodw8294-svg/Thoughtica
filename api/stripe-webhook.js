const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Validate environment variables early
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!endpointSecret) {
  console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured in environment');
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not configured in environment');
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.type) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.error('Invalid Firebase service account configuration');
    }
  } catch (e) {
    console.error('Failed to parse Firebase service account:', e.message);
  }
}

const db = admin.firestore();

// Vercel raw body parsing for Stripe signatures
const config = {
  api: {
    bodyParser: false
  }
};

const getRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://thoughtica.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Validate webhook secret is configured
  if (!endpointSecret) {
    console.error('Webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not properly configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('Missing Stripe signature header');
    return res.status(400).json({ error: 'Missing signature' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Signature verification failed' });
  }

  // Process only checkout.session.completed events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.client_reference_id;
    const mode = session.mode;

    // Validate session data
    if (!uid || typeof uid !== 'string') {
      console.error('Invalid or missing uid in session');
      return res.status(200).json({ received: true }); // Return 200 to prevent Stripe retries
    }

    if (!mode || (mode !== 'subscription' && mode !== 'payment')) {
      console.error('Invalid session mode:', mode);
      return res.status(200).json({ received: true });
    }

    // Valid tiers for database updates
    const VALID_TIERS = new Set(['kindred', 'soulbound', 'transcendence', 'theme_midnight', 'theme_zen', 'aura_rain']);

    const userRef = db.collection('users').doc(uid);
    try {
      // Determine tier from metadata or fallback to amount
      let assignedTier = session.metadata?.tier || null;

      if (!assignedTier || !VALID_TIERS.has(assignedTier)) {
        // Fallback: map amount to tier
        const amountMap = {
          299: 'kindred',
          999: 'soulbound',
          1999: 'transcendence',
          199: 'theme_cosmetic'
        };
        assignedTier = amountMap[session.amount_total] || null;
      }

      if (!assignedTier || !VALID_TIERS.has(assignedTier)) {
        console.error(`Invalid tier determined for session: ${assignedTier}`);
        return res.status(200).json({ received: true });
      }

      if (mode === 'subscription') {
        // Update user tier for subscription
        await userRef.set(
          {
            isPremium: true,
            tier: assignedTier,
            stripeSubscriptionId: session.subscription || null,
            premiumSince: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        console.log(`✅ Subscription activated for user ${uid}: ${assignedTier}`);
      } else if (mode === 'payment') {
        // Track cosmetic purchases
        await userRef.set(
          {
            unlockedCosmetics: admin.firestore.FieldValue.arrayUnion(assignedTier)
          },
          { merge: true }
        );
        console.log(`✅ Cosmetic purchased for user ${uid}: ${assignedTier}`);
      }
    } catch (e) {
      console.error('Firebase Update Error:', e.message);
      // Still return 200 to prevent Stripe retries
    }
  }

  res.status(200).json({ received: true });
};

module.exports.config = config;