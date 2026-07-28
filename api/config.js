/**
 * Public configuration endpoint.
 * Returns non-sensitive client-side configuration values such as the Stripe
 * publishable key.  This key is safe to expose to the browser.
 *
 * Required environment variable:
 *   STRIPE_PUBLIC_KEY  – Your Stripe publishable key (pk_live_… or pk_test_…)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const stripePk = process.env.STRIPE_PUBLIC_KEY || '';
  if (!stripePk) {
    console.warn('[config] STRIPE_PUBLIC_KEY is not configured');
  }

  res.status(200).json({ stripePk });
};
