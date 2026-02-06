# Vector Arcade Coins Worker

## What this does
- Receives Stripe webhook events from a Payment Link (Checkout Session completed)
- Marks a session as paid in KV
- Exposes `/redeem` so the frontend can claim coins using `session_id`

## Setup
1) Create a KV namespace named `SESSIONS` in Cloudflare.
2) Put the KV namespace ID into `wrangler.toml`.
3) Set secrets:

```bash
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put PRICE_ID_PACK_1
```

4) Optional env vars in `wrangler.toml`:

```
COINS_PACK_1 = "5"
```

## Stripe dashboard
- Payment Link should point to your GitHub Pages site
- Set **success URL** to include: `?session_id={CHECKOUT_SESSION_ID}`
- Add a webhook endpoint: `https://<your-worker>.workers.dev/webhook`
  - Event: `checkout.session.completed`

## Frontend usage
Call `/redeem` after redirect:

```js
await fetch("https://<your-worker>.workers.dev/redeem", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ session_id })
});
```

If the session is paid, the response includes `coins_granted`.
