import test from "node:test";
import assert from "node:assert/strict";
import { encodePaymentSignatureHeader, decodePaymentRequiredHeader } from "@x402/core/http";
import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import worker from "../src/index.js";
import { AgentPurchase, offer, BUY } from "../src/x402.js";

function fixture() {
  const records = new Map();
  const env = { X402_ENABLED: "true", X402_PAY_TO: "0x1111111111111111111111111111111111111111", X402_NETWORK: "base", X402_ASSET: "USDC", X402_FACILITATOR_URL: "https://facilitator.example", WORKER_BASE_URL: "https://arcade.example" };
  const objects = new Map();
  env.AGENT_PURCHASES = { idFromName: x => x, get(id) {
    if (!objects.has(id)) {
      const store = new Map(); records.set(id, store);
      objects.set(id, new AgentPurchase({ storage: { get: async k => structuredClone(store.get(k)), put: async (k,v) => store.set(k,structuredClone(v)) } }, env));
    }
    return objects.get(id);
  } };
  const required = offer(env).required;
  const payment = { x402Version: 2, resource: required.resource, accepted: required.accepts[0], payload: { signature: "0x1234", authorization: { from: "0x2222222222222222222222222222222222222222", to: env.X402_PAY_TO, value: "500000", validAfter: "0", validBefore: "9999999999", nonce: "0x" + "a".repeat(64) } } };
  const request = (p = payment) => new Request(env.WORKER_BASE_URL + BUY, { headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(p) } });
  return { env, required, payment, request, records };
}
const settled = { success: true, transaction: "0x" + "b".repeat(64), network: "eip155:8453", payer: "0x2222222222222222222222222222222222222222" };

test("unpaid challenge uses SDK-valid v2, exact USDC terms and CORS", async () => {
  const { env } = fixture();
  const res = await worker.fetch(new Request(env.WORKER_BASE_URL + BUY), env);
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.deepEqual(decodePaymentRequiredHeader(res.headers.get("PAYMENT-REQUIRED")), body);
  PaymentRequiredV2Schema.parse(body);
  assert.equal(body.accepts[0].amount, "500000");
  assert.deepEqual(body.accepts[0].extra, { name: "USD Coin", version: "2" });
  const discovery = await (await worker.fetch(new Request(env.WORKER_BASE_URL + "/.well-known/x402"), env)).json();
  assert.deepEqual(discovery.accepts, body.accepts);
  assert.equal(res.headers.get("cache-control"), "no-store");
});
test("disabled or invalid configuration never advertises payable terms", async () => {
  for (const override of [{ X402_ENABLED: "false" }, { X402_PAY_TO: "0x" + "0".repeat(40) }, { X402_PRICE_ATOMIC: "0" }, { X402_NETWORK: "other" }, { X402_ASSET: "0x" + "1".repeat(40) }]) {
    const { env } = fixture(); Object.assign(env, override);
    assert.equal((await worker.fetch(new Request(env.WORKER_BASE_URL + BUY), env)).status, 503);
    assert.deepEqual(offer(env).required.accepts, []);
  }
});
test("malformed header, unsupported method, CORS", async () => {
  const { env } = fixture();
  assert.equal((await worker.fetch(new Request(env.WORKER_BASE_URL + BUY, { headers: { "PAYMENT-SIGNATURE": "bad" } }), env)).status, 400);
  assert.equal((await worker.fetch(new Request(env.WORKER_BASE_URL + BUY, { method: "POST" }), env)).status, 405);
  const options = await worker.fetch(new Request(env.WORKER_BASE_URL + BUY, { method: "OPTIONS" }), env);
  assert.equal(options.status, 204);
  assert.match(options.headers.get("access-control-allow-headers"), /PAYMENT-SIGNATURE/);
});
test("payment term or resource drift never calls facilitator", async t => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("must not fetch"); });
  for (const field of ["amount", "payTo", "network", "asset", "maxTimeoutSeconds", "extra"]) {
    const { env, payment, request } = fixture(); payment.accepted[field] = field === "maxTimeoutSeconds" ? 1 : field === "extra" ? {} : "wrong";
    assert.notEqual((await worker.fetch(request(), env)).status, 200);
  }
  const { env, payment, request } = fixture(); payment.resource.url += "/other";
  assert.equal((await worker.fetch(request(), env)).status, 402);
});
test("empty or negative verification cannot settle or deliver", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({}); });
  const { env, request } = fixture();
  assert.equal((await worker.fetch(request(), env)).status, 402);
  assert.equal(calls, 1);
});
test("success, concurrent duplicate and retry settle only once", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push(url);
    const body = JSON.parse(init.body);
    assert.equal(body.x402Version, 2); assert.ok(body.paymentPayload); assert.ok(body.paymentRequirements);
    return Response.json(url.endsWith("/verify") ? { isValid: true } : settled);
  });
  const { env, request, payment } = fixture();
  const results = await Promise.all([worker.fetch(request(), env), worker.fetch(request(), env)]);
  assert.equal(results[0].status, 200); assert.equal(results[1].status, 200);
  const body = await results[0].json(); assert.ok(body.delivery.deployment.length);
  assert.deepEqual(await results[1].json(), body);
  assert.ok(results[0].headers.get("PAYMENT-RESPONSE"));
  assert.equal((await worker.fetch(request(), env)).status, 200);
  assert.equal(calls.length, 2);
  env.X402_ENABLED = "false";
  env.X402_PRICE_ATOMIC = "20000000";
  assert.deepEqual(await (await worker.fetch(request(), env)).json(), body);
  assert.equal(calls.length, 2);
  payment.payload.signature = "0x5678";
  assert.equal((await worker.fetch(request(), env)).status, 409);
  assert.equal(calls.length, 2);
});
test("uncertain or unsuccessful settlement is fenced across retries", async t => {
  for (const outcome of [null, {}, { success: false }, { ...settled, network: "eip155:1" }]) {
    let count = 0;
    t.mock.method(globalThis, "fetch", async url => {
      count++;
      if (url.endsWith("/verify")) return Response.json({ isValid: true });
      if (outcome === null) throw new Error("timeout");
      return Response.json(outcome);
    });
    const { env, request } = fixture();
    assert.equal((await worker.fetch(request(), env)).status, 409);
    assert.equal((await worker.fetch(request(), env)).status, 409);
    assert.equal(count, 2);
    t.mock.restoreAll();
  }
});
test("verification outage creates no pending purchase", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  const { env, request, records } = fixture();
  assert.equal((await worker.fetch(request(), env)).status, 503);
  assert.equal([...records.values()][0].size, 0);
});
test("optional resource is accepted and only allowlisted receipt fields are delivered", async t => {
  t.mock.method(globalThis, "fetch", async url => Response.json(url.endsWith("/verify") ? { isValid: true } : { ...settled, internalSecret: "not-for-client" }));
  const { env, payment, request } = fixture(); delete payment.resource;
  const res = await worker.fetch(request(), env);
  assert.equal(res.status, 200);
  assert.doesNotMatch(await res.text(), /internalSecret|not-for-client/);
});
test("pending fence survives a new object instance after storage failure", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async url => { calls++; return Response.json(url.endsWith("/verify") ? { isValid: true } : settled); });
  const { env, payment, required } = fixture();
  const store = new Map();
  const ctx = { storage: { get: async k => structuredClone(store.get(k)), put: async (k,v) => {
    if (v.status === "delivered") throw new Error("disk unavailable");
    store.set(k, structuredClone(v));
  } } };
  const req = () => new Request("https://internal/", { method: "POST", body: JSON.stringify({ payment, required }) });
  await assert.rejects(new AgentPurchase(ctx, env).fetch(req()));
  assert.equal(store.get("purchase").status, "pending");
  assert.equal((await new AgentPurchase(ctx, env).fetch(req())).status, 409);
  assert.equal(calls, 2);
});
test("oversized facilitator response fails closed", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("x".repeat(65537)));
  const { env, request } = fixture();
  assert.equal((await worker.fetch(request(), env)).status, 503);
});
