# Gym-to-Web Sync — Setup Guide

## 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run everything in `supabase-setup.sql`
3. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_KEY` (keep secret!)
4. Go to **Authentication → Settings**:
   - Set **Site URL** to `https://gymtoweb.netlify.app`
   - Add `http://localhost:8888` to **Redirect URLs** for local dev
   - Enable **Email** provider (enabled by default)
   - Optional: disable "Confirm email" in dev for faster testing

## 2. Stripe Setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Go to **Developers → API keys**:
   - Copy **Publishable key** → `STRIPE_PUBLISHABLE_KEY`
   - Copy **Secret key** → `STRIPE_SECRET_KEY`
3. For webhooks:
   - Go to **Developers → Webhooks → Add endpoint**
   - URL: `https://gymtoweb.netlify.app/.netlify/functions/stripe-webhook`
   - Events: select `payment_intent.succeeded`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`
4. For local testing:
   - Install Stripe CLI: `stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook`
   - Use test card: `4242 4242 4242 4242` (any future date, any CVC)

## 3. Update Config in index.html

Open `index.html` and find the `CONFIG` object near the top of the script:

```js
const CONFIG = {
  SUPABASE_URL: 'YOUR_SUPABASE_URL',        // e.g. https://abc123.supabase.co
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY', // eyJ...
  STRIPE_PK: 'YOUR_STRIPE_PUBLISHABLE_KEY',    // pk_live_... or pk_test_...
};
```

Replace these with your actual values.

## 4. Install Dependencies

```bash
npm install
```

This installs `stripe` and `@supabase/supabase-js` for the Netlify Functions.

## 5. Local Development

```bash
npx netlify dev
```

This runs the site at `http://localhost:8888` with functions available at `/.netlify/functions/*`.

## 6. Deploy to Netlify

### Option A: Netlify CLI
```bash
npx netlify deploy --prod
```

### Option B: Git Deploy
1. Push to GitHub
2. Connect repo in Netlify dashboard
3. Set build settings:
   - **Publish directory:** `.`
   - **Functions directory:** `netlify/functions`

### Environment Variables (set in Netlify Dashboard → Site → Environment)
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_AMOUNT=49700
```

Note: `SUPABASE_ANON_KEY` and `STRIPE_PUBLISHABLE_KEY` are in the frontend code (index.html) — they're safe to expose publicly.

## 7. Post-Deploy

1. Update Stripe webhook URL to your production Netlify URL
2. Update Supabase **Site URL** to your production domain
3. Add your domain to Supabase **Redirect URLs**
4. Test the full flow:
   - Sign up as trainer → pay → create plan → invite client
   - Sign up as client via invite link → see plan → log workout → submit check-in

## File Structure

```
gymtoweb.ca/
├── index.html              # Full SPA (landing, auth, dashboard, portal)
├── netlify.toml             # Netlify config
├── _redirects               # SPA fallback routing
├── package.json             # Dependencies for Netlify Functions
├── supabase-setup.sql       # Database schema + RLS policies
├── SETUP.md                 # This file
└── netlify/
    └── functions/
        ├── create-checkout.js   # Creates Stripe PaymentIntent
        └── stripe-webhook.js    # Handles payment confirmation
```

## User Flows

### Trainer Flow
1. Visit site → Sign up as "Trainer"
2. Redirected to Stripe checkout ($497 one-time)
3. Pay → redirected to Dashboard
4. Create workout plans with exercise builder
5. Share invite link with clients
6. View client check-ins and progress

### Client Flow
1. Receive invite link from trainer
2. Sign up via invite link (auto-linked to trainer)
3. See assigned workout plans in portal
4. Start workout → log weights → mark exercises done
5. Submit weekly check-ins (energy, sleep, soreness, weight, goals)
6. View progress (weight trend, workout count, activity log)
