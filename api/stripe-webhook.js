// Firebase Admin SDK to update the user's document
const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not configured');
    }
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT contains invalid JSON');
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

// Vercel raw body parsing for Stripe signatures
const config = {
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

  // Validate required environment variables
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY is not configured');
    return res.status(503).json({ error: 'Webhook service not configured' });
  }
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const db = getDb();

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const uid = session.client_reference_id; // Our Firebase User ID
      const mode = session.mode; // 'payment' or 'subscription'

      if (uid) {
        const userRef = db.collection('users').doc(uid);
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
            stripeCustomerId: session.customer || null,
            premiumSince: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } else if (mode === 'payment') {
          // Cosmetic one-time purchase
          await userRef.set({
            unlockedCosmetics: admin.firestore.FieldValue.arrayUnion(
              session.metadata?.tier || 'unknown_cosmetic'
            ),
          }, { merge: true });
        }
      }

    } else if (event.type === 'customer.subscription.deleted') {
      // Subscription cancelled — revoke premium access
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId) {
        const usersSnap = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();
        if (!usersSnap.empty) {
          await usersSnap.docs[0].ref.set({
            isPremium: false,
            tier: 'free',
            stripeSubscriptionId: null,
          }, { merge: true });
        }
      }

    } else if (event.type === 'customer.subscription.updated') {
      // Subscription status changed (e.g., paused, past_due, active)
      const subscription = event.data.object;
      const customerId = subscription.customer;
      if (customerId) {
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const usersSnap = await db.collection('users')
          .where('stripeCustomerId', '==', customerId)
          .limit(1)
          .get();
        if (!usersSnap.empty) {
          await usersSnap.docs[0].ref.set({
            isPremium: isActive,
            stripeSubscriptionStatus: subscription.status,
          }, { merge: true });
        }
      }

    } else if (event.type === 'invoice.payment_failed') {
      // Notify in logs; access continues until subscription is deleted by Stripe
      const invoice = event.data.object;
      console.warn('[stripe-webhook] Payment failed for customer:', invoice.customer,
        'invoice:', invoice.id);
    }

  } catch (e) {
    console.error('[stripe-webhook] Handler error:', e);
    // Still return 200 so Stripe does not retry unrecoverable errors
    return res.status(200).json({ received: true, warning: 'Handler error logged' });
  }

  res.json({ received: true });
};

module.exports.config = config;
