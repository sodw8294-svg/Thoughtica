const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// You must configure this environment variable in Vercel
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Firebase Admin SDK to update the user's document
const admin = require('firebase-admin');
if (!admin.apps.length) {
  // We expect a service account JSON stringified in an environment variable
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Vercel raw body parsing for Stripe signatures
export const config = {
  api: {
    bodyParser: false,
  },
};

const getRawBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.client_reference_id; // Our Firebase User ID
    const mode = session.mode; // 'payment' or 'subscription'

    if (uid) {
      const userRef = db.collection('users').doc(uid);
      try {
        // Fallback to determine tier by amount if metadata is missing
        let assignedTier = session.metadata?.tier || 'unknown';
        if (assignedTier === 'unknown' && session.amount_total === 299) assignedTier = 'kindred';
        if (assignedTier === 'unknown' && session.amount_total === 999) assignedTier = 'soulbound';
        if (assignedTier === 'unknown' && session.amount_total === 1999) assignedTier = 'transcendence';
        if (assignedTier === 'unknown' && session.amount_total === 199) assignedTier = 'cosmetic';

        if (mode === 'subscription') {
          await userRef.set({
            isPremium: true,
            tier: assignedTier,
            stripeSubscriptionId: session.subscription,
            premiumSince: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else if (mode === 'payment') {
          // It's a cosmetic one-time purchase
          await userRef.set({
            unlockedCosmetics: admin.firestore.FieldValue.arrayUnion(session.metadata?.tier || 'unknown_cosmetic')
          }, { merge: true });
        }
      } catch (e) {
        console.error('Firebase Update Error:', e);
      }
    }
  }

  res.json({ received: true });
};
