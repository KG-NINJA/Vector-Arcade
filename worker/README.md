# Vector Arcade Coins Worker

## What this does
- Receives Stripe webhook events from a Payment Link (Checkout Session completed)
- Creates Stripe Checkout Sessions from `/checkout`
- Marks a session as paid in KV
- Exposes `/redeem` so the frontend can claim coins using `session_id`
- Exposes x402 discovery and a paid system-package endpoint for AI agents

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
WORKER_BASE_URL = "https://vector-arcade-coins.fuwafuwow.workers.dev"
X402_PRICE_USDC = "9.99"
X402_PRICE_ATOMIC = "9990000"
X402_NETWORK = "base"
X402_ASSET = "USDC"
X402_PAY_TO = "0x..."
X402_FACILITATOR_URL = "https://x402.org/facilitator"
```

## x402 agent sales

Discovery:

```bash
curl https://vector-arcade-coins.fuwafuwow.workers.dev/.well-known/x402/discovery/resources
```

Paid system package:

```bash
curl -i https://vector-arcade-coins.fuwafuwow.workers.dev/x402/vector-arcade-system
```

Set `X402_PAY_TO` to the seller wallet before production sales.
Unpaid requests return `402 Payment Required`; paid requests are verified and settled through `X402_FACILITATOR_URL`.

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
