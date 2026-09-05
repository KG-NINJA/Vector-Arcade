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
X402_PRICE_USDC = "0.5"
X402_PRICE_ATOMIC = "500000"
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

The API now uses x402 **v2** (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`,
`PAYMENT-RESPONSE`). Older `X-PAYMENT` clients must upgrade.

Sales are disabled by default (`X402_ENABLED = "false"`). Disabled or invalid
configuration returns 503 and discovery advertises no payable offers.
Before enabling, set a nonzero `X402_PAY_TO` address and a facilitator whose
`/supported` response includes v2 / exact / `eip155:8453`. The existing
`https://x402.org/facilitator` value is not proof of Base mainnet support.
This implementation accepts an unauthenticated HTTPS facilitator; services
requiring credentials need an authentication adapter before use.
The existing `base` and `USDC` config aliases resolve to Base mainnet and its
USDC contract address. Atomic price is authoritative: `500000` = 0.5 USDC.
`X402_PRICE_USDC` is retained for compatibility but not used to form offers.

Discovery: `/.well-known/x402` (legacy discovery URL remains available).
Machine-readable contract: `/openapi.json`. Agent links: `/llms.txt`.
The arcade footer and static `llms.txt` link to the agent API.

The product is a structured integration blueprint, not arcade coins or
exclusive source code. The GitHub source remains freely available.
Successful delivery includes the architecture, setup checklist, acceptance
checks, limitations, payment digest and facilitator settlement receipt.

Agents should use an x402 v2 client, inspect the challenge's recipient,
network and amount against their spending policy, then retry with its signed
`PAYMENT-SIGNATURE`. No browser redirect or Stripe key is needed.
Store the exact signed payload until delivery is received. A retry with that
same payload recovers the stored result without another settlement.
Do not generate a new authorization after a 409 or uncertain response.

`AGENT_PURCHASES` is a SQLite Durable Object, created by the included migration.
It serializes purchases by payer + network + asset + EIP-3009 nonce and stores
a pending fence before settlement. A timeout/crash after that fence returns
409 pending reconciliation, including after restart; it does not auto-settle
again. Operator reconciliation is manual and not implemented as a public API.
Do not delete pending records to retry payment; first check the facilitator
and chain for the original authorization. Delivery records have no TTL.

Run `npm test`, `npm run check`, and `npm run dry-run` before deployment.
Tests mock the facilitator; they are not proof of real settlement or revenue.
There is no dedicated lint/typecheck configuration in this JavaScript project.

Deployment changes Worker code and creates the Durable Object binding. GitHub
push and Worker deployment are separate actions. Keep sales disabled until
recipient, facilitator and real payment/delivery verification are complete.

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
