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

      return json({ coins_granted: stored.coins, session_id: sessionId });
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
