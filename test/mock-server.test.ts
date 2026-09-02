import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { createMockServer } from "../mock-server/index";

describe("Stripe Mock Server Multi-Version Endpoints", () => {
  let server: any;
  const PORT = 8098;
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    server = createMockServer();
    await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", () => resolve()));
  });

  afterAll(() => {
    server?.close();
  });

  it("GET /health should return 200 with available versions", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.status).toBe("ok");
    expect(json.availableVersions).toContain("v2020-08-27");
    expect(json.availableVersions).toContain("v2024-06-20-BROKEN");
  });

  it("GET /v1/schema should serve OpenAPI document for requested version", async () => {
    const res = await fetch(`${BASE_URL}/v1/schema`, {
      headers: { "Stripe-Version": "2020-08-27" },
    });
    expect(res.status).toBe(200);
    const schema: any = await res.json();
    expect(schema.info.version).toBe("2020-08-27");
  });

  it("Charges API: v2020-08-27 returns legacy card and source", async () => {
    const res = await fetch(`${BASE_URL}/v1/charges/ch_test123`, {
      headers: { "Stripe-Version": "2020-08-27" },
    });
    expect(res.status).toBe(200);
    const charge: any = await res.json();
    expect(charge.source).toBe("tok_visa");
    expect(charge.card).toBeDefined();
    expect(charge.card.brand).toBe("Visa");
  });

  it("Charges API: v2024-06-20 returns modern payment_method_details", async () => {
    const res = await fetch(`${BASE_URL}/v1/charges/ch_test123`, {
      headers: { "Stripe-Version": "2024-06-20" },
    });
    expect(res.status).toBe(200);
    const charge: any = await res.json();
    expect(charge.payment_method).toBe("pm_card_visa");
    expect(charge.payment_method_details?.type).toBe("card");
  });

  it("Charges API: v2024-06-20-BROKEN returns 404 for POST /v1/charges", async () => {
    const res = await fetch(`${BASE_URL}/v1/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20-BROKEN" },
      body: JSON.stringify({ amount: 2000, currency: "usd" }),
    });
    expect(res.status).toBe(404);
    const err: any = await res.json();
    expect(err.errors).toBeDefined();
    expect(err.errors[0].doc_url).toBeDefined();
  });

  it("PaymentIntents API: v2024-06-20 returns integer amount and client_secret", async () => {
    const res = await fetch(`${BASE_URL}/v1/payment_intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20" },
      body: JSON.stringify({ amount: 2000, currency: "usd" }),
    });
    expect(res.status).toBe(200);
    const pi: any = await res.json();
    expect(typeof pi.amount).toBe("number");
    expect(pi.client_secret).toBeDefined();
  });

  it("PaymentIntents API: v2024-06-20-BROKEN requires receipt_email and returns string amount without client_secret", async () => {
    // Missing receipt_email -> 400
    const resFail = await fetch(`${BASE_URL}/v1/payment_intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20-BROKEN" },
      body: JSON.stringify({ amount: "20.00" }),
    });
    expect(resFail.status).toBe(400);

    // With receipt_email -> 200 broken shape
    const resSuccess = await fetch(`${BASE_URL}/v1/payment_intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20-BROKEN" },
      body: JSON.stringify({ amount: "20.00", receipt_email: "test@example.com" }),
    });
    expect(resSuccess.status).toBe(200);
    const pi: any = await resSuccess.json();
    expect(typeof pi.amount).toBe("string");
    expect(pi.client_secret).toBeUndefined();
  });

  it("Webhook Generator: produces version-specific webhook event payload", async () => {
    const res = await fetch(`${BASE_URL}/v1/test/webhooks/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20" },
      body: JSON.stringify({ eventType: "payment_intent.succeeded" }),
    });
    expect(res.status).toBe(200);
    const evt: any = await res.json();
    expect(evt.object).toBe("event");
    expect(evt.type).toBe("payment_intent.succeeded");
    expect(evt.data.object.object).toBe("payment_intent");
  });
});
