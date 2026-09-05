import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { PaymentPayloadV2Schema, PaymentRequiredV2Schema } from "@x402/core/schemas";

export const BUY = "/x402/vector-arcade-system";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = /^0x0{40}$/;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DESCRIPTION = "Machine-readable static arcade monetization blueprint and deployment checklist. Public source is freely available; this purchase is a structured integration guide, not exclusive source code or hosted support.";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "PAYMENT-SIGNATURE, content-type",
  "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "cache-control": "no-store",
};
export function response(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", ...headers } });
}
export function offer(env) {
  const base = (env.WORKER_BASE_URL || "https://vector-arcade-coins.fuwafuwow.workers.dev").replace(/\/$/, "");
  const amount = env.X402_PRICE_ATOMIC || "500000";
  const network = env.X402_NETWORK === "base" ? "eip155:8453" : env.X402_NETWORK;
  const asset = env.X402_ASSET === "USDC" ? USDC : env.X402_ASSET;
  const payTo = env.X402_PAY_TO || "";
  const configured = env.X402_ENABLED === "true" && ADDRESS.test(payTo) && !ZERO.test(payTo)
    && network === "eip155:8453" && asset?.toLowerCase() === USDC.toLowerCase()
    && /^[1-9]\d{0,14}$/.test(amount) && /^https:\/\//.test(env.X402_FACILITATOR_URL || "") && !!env.AGENT_PURCHASES;
  const required = { x402Version: 2, resource: { url: base + BUY, description: DESCRIPTION, mimeType: "application/json" }, accepts: configured ? [{ scheme: "exact", network, asset, amount, payTo, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } }] : [] };
  return { base, configured, required };
}
function challenge(required) {
  PaymentRequiredV2Schema.parse(required);
  return response(required, 402, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required) });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
export async function handleAgentRequest(req, env) {
  const path = new URL(req.url).pathname;
  if (![BUY, "/.well-known/x402", "/.well-known/x402/discovery/resources", "/openapi.json", "/llms.txt"].includes(path)) return null;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return response({ error: "method_not_allowed" }, 405, { Allow: "GET, OPTIONS" });
  const { base, configured, required } = offer(env);
  if (path === "/llms.txt") return new Response(`# Vector Arcade\n\n${DESCRIPTION}\n\n- Discovery: ${base}/.well-known/x402\n- OpenAPI: ${base}/openapi.json\n- Purchase: ${base}${BUY}\n- Free source: https://github.com/KG-NINJA/Vector-Arcade\n`, { headers: { ...cors, "content-type": "text/plain; charset=utf-8" } });
  if (path === "/openapi.json") return response({ openapi: "3.1.0", info: { title: "Vector Arcade Agent API", version: "2.0.0", description: DESCRIPTION }, servers: [{ url: base }], paths: { [BUY]: { get: { operationId: "buyMonetizationBlueprint", description: "Read the 402 PAYMENT-REQUIRED header, authorize exact payment, retry with PAYMENT-SIGNATURE. Retry the identical signed payload to recover a delivery. Never create another payment after 409 or 503; reconcile first.", parameters: [{ in: "header", name: "PAYMENT-SIGNATURE", required: false, schema: { type: "string" } }], responses: Object.fromEntries([[200, "Blueprint and PAYMENT-RESPONSE settlement receipt"], [400, "Malformed payment"], [402, "x402 v2 payment required or rejected"], [409, "Payment pending reconciliation; do not pay again"], [503, "Sales unavailable or facilitator unavailable"]].map(([code, description]) => [code, { description }])) } } } });
  if (path !== BUY) return response({ ...required, available: configured, resources: configured ? [{ ...required.resource, method: "GET", accepts: required.accepts }] : [], openapi: base + "/openapi.json" });
  const header = req.headers.get("PAYMENT-SIGNATURE");
  if (!header) return configured ? challenge(required) : response({ error: "sales_unavailable", discovery: base + "/.well-known/x402" }, 503);
  let payment;
  try {
    if (header.length > 16384) throw new Error();
    payment = PaymentPayloadV2Schema.parse(decodePaymentSignatureHeader(header));
    const a = payment.payload.authorization;
    if (!a || !ADDRESS.test(a.from) || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce)) throw new Error();
  } catch { return response({ error: "invalid_payment" }, 400); }
  const a = payment.payload.authorization;
  const identity = await hash([payment.accepted.network, payment.accepted.asset.toLowerCase(), a.from.toLowerCase(), a.nonce.toLowerCase()]);
  try {
    const stub = env.AGENT_PURCHASES.get(env.AGENT_PURCHASES.idFromName(identity));
    return await stub.fetch(new Request(req.url, { method: "POST", body: JSON.stringify({ payment, required }) }));
  } catch { return response({ error: "purchase_unavailable", retry: "same_payment_only" }, 503); }
}

function blueprint() {
  return {
    schema: "vector-arcade.blueprint.v1", product: "Vector Arcade Monetization Blueprint",
    source: "https://github.com/KG-NINJA/Vector-Arcade", sourceAccess: "public, free",
    architecture: { frontend: "GitHub Pages index.html", backend: "Cloudflare Worker worker/src/index.js", humanPayment: "POST /checkout -> Stripe Checkout -> POST /webhook -> POST /redeem", agentPayment: "GET /x402/vector-arcade-system -> 402 -> PAYMENT-SIGNATURE -> verification -> settlement -> blueprint", storage: { SESSIONS: "Stripe session records in KV", AGENT_PURCHASES: "Durable Object per EIP-3009 payer and nonce" } },
    deployment: ["Create a SESSIONS KV namespace and configure its ID in worker/wrangler.toml", "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and PRICE_ID_PACK_1 using Wrangler secrets", "Set SITE_URL and ALLOWED_ORIGINS to the frontend origin", "Set WORKER_BASE_URL and the frontend worker URL", "Configure a Base USDC recipient and a facilitator supporting x402 v2 exact eip155:8453", "Run npm ci, npm test and npm run dry-run in worker", "Deploy Worker and configure Stripe checkout.session.completed webhook", "Publish frontend and verify human and agent purchases separately"],
    acceptance: ["Missing payment returns 402 when enabled", "Invalid payment never delivers a package", "Confirmed settlement returns a blueprint and receipt", "The same signed payment recovers the same delivery", "An uncertain settlement requires reconciliation, not a new purchase"],
    limitations: ["This guide does not include hosting, exclusive source rights, or support", "The arcade coin balance is client-side and is not a secure server-side entitlement", "Stripe KV redemption is not atomic under concurrent requests", "Uncertain settlements require operator reconciliation"],
  };
}
async function callFacilitator(env, action, payment, requirements) {
  const res = await fetch(env.X402_FACILITATOR_URL.replace(/\/$/, "") + "/" + action, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json" }, body: JSON.stringify({ x402Version: 2, paymentPayload: payment, paymentRequirements: requirements }),
  });
  if (!res.ok) throw new Error("facilitator_failure");
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) throw new Error("facilitator_response_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// A persistent pending fence prevents another settlement after a crash or timeout.
export class AgentPurchase {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.queue = Promise.resolve(); }
  fetch(req) {
    const result = this.queue.then(() => this.purchase(req));
    this.queue = result.catch(() => {});
    return result;
  }
  async purchase(req) {
    const { payment } = await req.json();
    const digest = await hash(payment);
    const existing = await this.ctx.storage.get("purchase");
    if (existing) {
      if (existing.digest !== digest) return response({ error: "payment_conflict" }, 409);
      if (existing.status === "delivered") return response(existing.body, 200, existing.headers);
      return response({ error: "settlement_pending_reconciliation", retry: "same_payment_only" }, 409);
    }
    const { configured, required } = offer(this.env);
    if (!configured) return response({ error: "sales_unavailable" }, 503);
    if (JSON.stringify(canonical(payment.accepted)) !== JSON.stringify(canonical(required.accepts[0]))) return challenge(required);
    if (payment.resource && payment.resource.url !== required.resource.url) return challenge(required);
    let verified;
    try { verified = await callFacilitator(this.env, "verify", payment, required.accepts[0]); }
    catch { return response({ error: "verification_unavailable" }, 503); }
    if (verified?.isValid !== true) return challenge(required);
    const body = { ok: true, delivery: blueprint(), receipt: { paymentDigest: digest } };
    await this.ctx.storage.put("purchase", { status: "pending", digest, body });
    let settled;
    try { settled = await callFacilitator(this.env, "settle", payment, required.accepts[0]); }
    catch { return response({ error: "settlement_pending_reconciliation", retry: "same_payment_only" }, 409); }
    if (settled?.success !== true || !/^0x[0-9a-fA-F]{64}$/.test(settled.transaction || "") || settled.network !== payment.accepted.network) return response({ error: "settlement_pending_reconciliation", retry: "same_payment_only" }, 409);
    const receipt = { success: true, transaction: settled.transaction, network: settled.network, payer: payment.payload.authorization.from };
    body.receipt.settlement = receipt;
    const headers = { "PAYMENT-RESPONSE": encodePaymentResponseHeader(receipt) };
    await this.ctx.storage.put("purchase", { status: "delivered", digest, body, headers });
    return response(body, 200, headers);
  }
}
