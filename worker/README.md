# Vector Arcade Coins Worker

## What this does
- Receives Stripe webhook events from a Payment Link (Checkout Session completed)
- Creates Stripe Checkout Sessions from `/checkout`
- Marks a session as paid in KV
- Exposes `/redeem` so the frontend can claim coins using `session_id`

## Setup
1) Create a KV namespace named `SESSIONS` in Cloudflare.
2) Put the KV namespace ID into `wrangler.toml`.
3) Set secrets:

```bash
npm install
npm run secret:webhook
npm run secret:stripe
npm run secret:price
npm run deploy
```

4) Optional env vars in `wrangler.toml`:

```
COINS_PACK_1 = "5"
SITE_URL = "https://kg-ninja.github.io/Vector-Arcade"
ALLOWED_ORIGINS = "https://kg-ninja.github.io"
```

## Stripe dashboard
- Create a one-time payment Price and set `PRICE_ID_PACK_1` to that price ID.
- Add a webhook endpoint: `https://<your-worker>.workers.dev/webhook`
  - Event: `checkout.session.completed`

## Frontend usage
Create Checkout:

```js
const checkout = await fetch("https://<your-worker>.workers.dev/checkout", {
  method: "POST"
}).then((r) => r.json());
location.href = checkout.url;
```

Call `/redeem` after Stripe redirects back with `session_id`:

```js
await fetch("https://<your-worker>.workers.dev/redeem", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ session_id })
});
```

If the session is paid, the response includes `coins_granted`.
