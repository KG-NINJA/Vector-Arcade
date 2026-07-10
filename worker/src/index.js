const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function workerBase(req, env) {
  return (env.WORKER_BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
}

function x402Product(req, env) {
  const base = workerBase(req, env);
  const price = env.X402_PRICE_USDC || "9.99";
  const payTo = env.X402_PAY_TO || "0x0000000000000000000000000000000000000000";
  return {
    id: "vector-arcade-monetization-system",
    name: "Vector Arcade Monetization System",
    description:
      "Production-ready static arcade monetization system: GitHub Pages frontend, Cloudflare Worker, Stripe Checkout, webhook redemption, KV session ledger, and agent-ready x402 sales surface.",
    price: `${price} USDC`,
    network: env.X402_NETWORK || "base",
    payTo,
    endpoints: {
      buy: `${base}/x402/vector-arcade-system`,
      discovery: `${base}/.well-known/x402/discovery/resources`,
    },
    deliverables: [
      "Cloudflare Worker source",
      "Stripe Checkout + webhook flow",
      "KV-backed coin redemption logic",
      "GitHub Pages integration notes",
      "Agent-facing x402 discovery metadata",
    ],
  };
}

function x402PaymentRequired(req, env) {
  const product = x402Product(req, env);
  return json(
    {
      x402Version: 1,
      error: "payment_required",
      accepts: [
        {
          scheme: "exact",
          network: product.network,
          maxAmountRequired: env.X402_PRICE_ATOMIC || "9990000",
          resource: product.endpoints.buy,
          description: product.description,
          mimeType: "application/json",
          payTo: product.payTo,
          asset: env.X402_ASSET || "USDC",
          extra: {
            name: product.name,
            price: product.price,
          },
        },
      ],
    },
    402
  );
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function verifyX402Payment(req, env) {
  const payment = req.headers.get("x-payment");
  if (!payment) return { ok: false, response: x402PaymentRequired(req, env) };
  if (!env.X402_FACILITATOR_URL) {
    return { ok: false, response: json({ error: "x402 facilitator missing" }, 500) };
  }

  const product = x402Product(req, env);
  const requirements = x402PaymentRequired(req, env);
  const requirementsBody = await requirements.json();
  const payload = {
    x402Version: 1,
    payment,
    paymentRequirements: requirementsBody.accepts[0],
  };

  const verify = await postJson(`${env.X402_FACILITATOR_URL.replace(/\/$/, "")}/verify`, payload);
  if (!verify.ok || verify.data?.isValid === false || verify.data?.valid === false) {
    return { ok: false, response: x402PaymentRequired(req, env) };
  }

  const settle = await postJson(`${env.X402_FACILITATOR_URL.replace(/\/$/, "")}/settle`, payload);
  if (!settle.ok) {
    return { ok: false, response: json({ error: "x402 settlement failed" }, 402) };
  }

  return { ok: true, settlement: settle.data, product };
}

function systemPackage(req, env, settlement) {
  const product = x402Product(req, env);
  return json({
    ok: true,
    settlement,
    product,
    implementation: {
      frontend: "Static HTML arcade with local coin timer and BUY COINS flow.",
      backend: "Cloudflare Worker exposes /checkout, /webhook, /redeem, x402 discovery, and paid package delivery.",
      payment: "Stripe Checkout handles human card payment; x402 endpoint packages the system for AI-agent purchase.",
      ledger: "Cloudflare KV stores paid checkout sessions until redemption.",
    },
    integrationSteps: [
      "Clone https://github.com/KG-NINJA/Vector-Arcade",
      "Create Cloudflare KV namespace and bind it as SESSIONS",
      "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and PRICE_ID_PACK_1 secrets",
      "Set X402_PAY_TO to the seller wallet",
      "Deploy worker and publish GitHub Pages frontend",
    ],
  });
}

function getSiteUrl(req, env) {
  const site = (env.SITE_URL || "https://kg-ninja.github.io/Vector-Arcade").replace(/\/$/, "");
  const origin = req.headers.get("origin");
  if (!origin) return site;
  const allowed = (env.ALLOWED_ORIGINS || "https://kg-ninja.github.io")
    .split(",")
    .map((v) => v.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return allowed.includes(origin.replace(/\/$/, "")) ? site : site;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSHA256(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseStripeSignature(sigHeader) {
  if (!sigHeader) return null;
  const parts = sigHeader.split(",");
  const out = {};
  for (const p of parts) {
    const [k, v] = p.split("=");
    out[k] = v;
  }
  if (!out.t || !out.v1) return null;
  return { t: out.t, v1: out.v1 };
}

async function verifyStripeSignature(req, secret) {
  const sigHeader = req.headers.get("Stripe-Signature");
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed) return { ok: false, reason: "Missing signature" };
  const body = await req.text();
  const signed = `${parsed.t}.${body}`;
  const digest = await hmacSHA256(secret, signed);
  const ok = timingSafeEqual(digest, parsed.v1);
  return { ok, body };
}

async function fetchStripe(path, method, secretKey, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || "Stripe API error";
    throw new Error(msg);
  }
  return data;
}

async function createCheckoutSession(req, env) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: "stripe secret missing" }, 500);
  if (!env.PRICE_ID_PACK_1) return json({ error: "price id missing" }, 500);

  const site = getSiteUrl(req, env);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][price]", env.PRICE_ID_PACK_1);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${site}/?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${site}/?checkout=cancelled`);
  params.set("metadata[product]", "vector_arcade_coin_pack");
  params.set("metadata[coins]", String(env.COINS_PACK_1 || "5"));

  const session = await fetchStripe("checkout/sessions", "POST", env.STRIPE_SECRET_KEY, params);
  return json({ ok: true, url: session.url, id: session.id });
}

async function getSessionLineItems(sessionId, secretKey) {
  const data = await fetchStripe(`checkout/sessions/${sessionId}/line_items`, "GET", secretKey);
  return data?.data || [];
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type, stripe-signature",
        },
      });
    }

    if (url.pathname === "/checkout" && req.method === "POST") {
      try {
        return await createCheckoutSession(req, env);
      } catch (e) {
        return json({ error: e.message || "checkout failed" }, 500);
      }
    }

    if (url.pathname === "/.well-known/x402/discovery/resources" && req.method === "GET") {
      const product = x402Product(req, env);
      return json({
        x402Version: 1,
        resources: [
          {
            type: "paid-api",
            url: product.endpoints.buy,
            name: product.name,
            description: product.description,
            price: product.price,
            network: product.network,
            payTo: product.payTo,
            method: "GET",
            output: "application/json",
            value:
              "Lets an AI agent buy the complete monetization blueprint for adding paid coins to static browser games.",
          },
        ],
      });
    }

    if (url.pathname === "/x402/vector-arcade-system" && req.method === "GET") {
      const verified = await verifyX402Payment(req, env);
      if (!verified.ok) return verified.response;
      return systemPackage(req, env, verified.settlement);
    }

    if (url.pathname === "/redeem" && req.method === "POST") {
      let payload;
      try {
        payload = await req.json();
      } catch {
        return badRequest("Invalid JSON");
      }
      const sessionId = payload?.session_id;
      if (!sessionId) return badRequest("session_id required");

      const key = `session:${sessionId}`;
      const stored = await env.SESSIONS.get(key, { type: "json" });
      if (!stored || stored.status !== "paid") {
        return json({ error: "not_paid" }, 400);
      }
      stored.status = "redeemed";
      stored.redeemed_at = new Date().toISOString();
      await env.SESSIONS.put(key, JSON.stringify(stored));

      return json({ ok: true, coins: stored.coins, coins_granted: stored.coins, session_id: sessionId });
    }

    if (url.pathname === "/webhook" && req.method === "POST") {
      const secret = env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return json({ error: "webhook secret missing" }, 500);

      const { ok, body, reason } = await verifyStripeSignature(req, secret);
      if (!ok) return json({ error: reason || "invalid signature" }, 400);

      let event;
      try {
        event = JSON.parse(body);
      } catch {
        return json({ error: "invalid payload" }, 400);
      }

      if (event?.type === "checkout.session.completed") {
        const session = event.data?.object;
        if (session?.payment_status !== "paid") {
          return json({ received: true });
        }

        const sessionId = session.id;
        const key = `session:${sessionId}`;
        const existing = await env.SESSIONS.get(key, { type: "json" });
        if (existing && existing.status === "redeemed") {
          return json({ received: true });
        }

        let coins = Number(env.COINS_PACK_1 || "5");
        const priceId = env.PRICE_ID_PACK_1;
        if (priceId && env.STRIPE_SECRET_KEY) {
          const lineItems = await getSessionLineItems(sessionId, env.STRIPE_SECRET_KEY);
          const matched = lineItems.find((li) => li?.price?.id === priceId);
          if (!matched) {
            return json({ error: "price not matched" }, 400);
          }
        }

        await env.SESSIONS.put(
          key,
          JSON.stringify({ status: "paid", coins, paid_at: new Date().toISOString() })
        );
      }

      return json({ received: true });
    }

    return json({ error: "not found" }, 404);
  },
};
