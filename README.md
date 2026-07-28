# thoughtica.io – Life RPG

Vite + React + TypeScript + Tailwind CSS template with Shadcn/ui pre-configured.

## Features

- **Linting**: TypeScript (`tsc --noEmit`), ESLint, and Stylelint
- **Shadcn/ui**: Pre-configured with all Shadcn components
- **Modern Stack**: Vite + React + TypeScript + Tailwind CSS
- **Payments**: Stripe Checkout for subscriptions and one-time purchases
- **Auth & DB**: Firebase Authentication + Firestore

## Available Scripts

```bash
# Run all tests (Node built-in test runner)
npm test

# Run all linting (types + JS + CSS)
npm run lint

# Individual linting
npm run lint:types # TypeScript (tsc --noEmit)
npm run lint:js    # ESLint
npm run lint:css   # Stylelint

# Build for production
npm run build
```

---

## Payment / Stripe Setup

### Environment Variables

Copy `.env.example` to `.env.local` (local) or add them in **Vercel → Project Settings → Environment Variables** (production).

| Variable | Where to find it |
|---|---|
| `STRIPE_SECRET_KEY` | [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_PUBLIC_KEY` | Same page (publishable key) |
| `STRIPE_WEBHOOK_SECRET` | [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) → your endpoint → Signing secret |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service accounts → Generate new private key (stringify the JSON to one line) |
| `PUBLIC_URL` | Your deployed app URL, e.g. `https://thoughtica.io` |

### Webhook Setup (Vercel)

1. In the Stripe Dashboard, create a new webhook endpoint pointing to:
   ```
   https://<your-domain>/api/stripe-webhook
   ```
2. Subscribe to these events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
   - `invoice.payment_failed`
3. Copy the **Signing secret** and add it as `STRIPE_WEBHOOK_SECRET` in Vercel.

### Local Webhook Testing

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3000/api/stripe-webhook
# Copy the whsec_... secret it prints and set it as STRIPE_WEBHOOK_SECRET in .env.local
```

### Tier Reference

| Tier ID | Type | Price |
|---|---|---|
| `kindred` | Monthly subscription | $2.99/mo |
| `soulbound` | Monthly subscription | $9.99/mo |
| `transcendence` | Monthly subscription | $19.99/mo |
| `theme_midnight` | One-time purchase | $1.99 |
| `theme_zen` | One-time purchase | $1.99 |
| `aura_rain` | One-time purchase | $1.99 |

