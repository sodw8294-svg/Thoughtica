const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Validate required env vars at startup
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('[stripe-webhook] FATAL: STRIPE_SECRET_KEY is not set');
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.error('[stripe-webhook] FATAL: STRIPE_WEBHOOK_SECRET is not set');
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('[stripe-webhook] FATAL: FIREBASE_SERVICE_ACCOUNT is not set');
}

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

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error(JSON.stringify({ event: 'webhook_signature_failed', message: err.message }));
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency: skip events we have already successfully processed
  const eventRef = db.collection('processedStripeEvents').doc(event.id);
  try {
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      console.log(JSON.stringify({ event: 'webhook_duplicate_skipped', stripeEventId: event.id, type: event.type }));
      return res.json({ received: true });
    }
    // Record the event before processing to prevent double-processing under concurrent delivery
    await eventRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp(), type: event.type });
  } catch (e) {
    console.error(JSON.stringify({ event: 'webhook_idempotency_error', stripeEventId: event.id, message: e.message }));
    // Continue processing — a failed idempotency write should not drop the event
  }

  console.log(JSON.stringify({ event: 'webhook_received', stripeEventId: event.id, type: event.type }));

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid = session.client_reference_id;
    const mode = session.mode;

    if (uid) {
      const userRef = db.collection('users').doc(uid);
      try {
        // Fallback to determine tier by amount if metadata is missing
        let assignedTier = session.metadata?.tier || 'unknown';
        if (assignedTier === 'unknown' && session.amount_total === 299) assignedTier = 'kindred';
        if (assignedTier === 'unknown' && session.amount_total === 999) assignedTier = 'soulbound';
        if (assignedTier === 'unknown' && session.amount_total === 1999) assignedTier = 'transcendence';
        if (assignedTier === 'unknown' && session.amount_total === 199) assignedTier = 'cosmetic';
        if (assignedTier === 'unknown' && session.amount_total === 1499) assignedTier = 'pro';
        if (assignedTier === 'unknown' && session.amount_total === 4900) assignedTier = 'celestial';

        if (mode === 'subscription') {
          await userRef.set({
            isPremium: true,
            tier: assignedTier,
            stripeSubscriptionId: session.subscription,
            premiumSince: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          console.log(JSON.stringify({ event: 'entitlement_granted', uid, tier: assignedTier }));
        } else if (mode === 'payment') {
          // It's a cosmetic one-time purchase
          await userRef.set({
            unlockedCosmetics: admin.firestore.FieldValue.arrayUnion(session.metadata?.tier || 'unknown_cosmetic')
          }, { merge: true });
          console.log(JSON.stringify({ event: 'cosmetic_unlocked', uid, tier: session.metadata?.tier }));
        }
      } catch (e) {
        console.error(JSON.stringify({ event: 'entitlement_write_error', uid, message: e.message }));
      }
    }
  }

  // Revoke premium on subscription cancellation or payment failure
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const uid = subscription.metadata?.uid || subscription.client_reference_id;
    if (uid) {
      try {
        await db.collection('users').doc(uid).set({
          isPremium: false,
          tier: 'free',
          stripeSubscriptionId: null,
        }, { merge: true });
        console.log(JSON.stringify({ event: 'entitlement_revoked', uid, reason: 'subscription_deleted' }));
      } catch (e) {
        console.error(JSON.stringify({ event: 'entitlement_revoke_error', uid, message: e.message }));
      }
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    console.warn(JSON.stringify({ event: 'invoice_payment_failed', customerId: invoice.customer, subscriptionId: invoice.subscription }));
    // Access remains active during Stripe's retry window; no immediate revocation.
    // Subscription will be canceled (triggering customer.subscription.deleted) if retries are exhausted.
  }

  res.json({ received: true });
};

module.exports.config = config;
