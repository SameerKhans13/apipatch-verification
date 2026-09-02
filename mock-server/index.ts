import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  generateCharge,
  generateCustomer,
  generateErrorResponse,
  generateListEnvelope,
  generatePaymentIntent,
  generateRefund,
  generateSubscription,
  generateWebhookEndpoint,
  generateWebhookEvent,
  normalizeVersion,
} from "./data";
import type { MockServerOptions, StripeApiVersion } from "./types";

export const AVAILABLE_VERSIONS: StripeApiVersion[] = [
  "v2020-08-27",
  "v2022-11-15",
  "v2024-06-20",
  "v2024-06-20-BROKEN",
];

async function parseRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      const contentType = req.headers["content-type"] ?? "";
      if (contentType.includes("application/json")) {
        try {
          return resolve(JSON.parse(body));
        } catch {
          return resolve({});
        }
      }
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(body);
        const result: Record<string, any> = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        return resolve(result);
      }
      try {
        return resolve(JSON.parse(body));
      } catch {
        resolve({ raw: body });
      }
    });
  });
}

export function createMockServer(options: MockServerOptions = {}) {
  let activeDefaultVersion: StripeApiVersion = normalizeVersion(
    options.defaultVersion ?? process.env.STRIPE_MOCK_VERSION ?? "v2024-06-20"
  );

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Version, Idempotency-Key");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const body = await parseRequestBody(req);

    // Resolve version from Header > Query param > Environment/Active Default
    const headerVersion = req.headers["stripe-version"] as string | undefined;
    const queryVersion = url.searchParams.get("version");
    const activeVersion = normalizeVersion(headerVersion ?? queryVersion ?? activeDefaultVersion);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Stripe-Version", activeVersion.replace(/^v/, ""));

    const sendJson = (statusCode: number, data: any) => {
      res.writeHead(statusCode);
      res.end(JSON.stringify(data, null, 2));
    };

    const sendError = (statusCode: number, message: string, code = "resource_missing", param: string | null = null) => {
      const err = generateErrorResponse(activeVersion, message, statusCode, code, param);
      sendJson(err.statusCode, err.body);
    };

    // Health check endpoint
    if (pathname === "/health" || pathname === "/") {
      sendJson(200, {
        status: "ok",
        service: "stripe-mock-server",
        activeVersion,
        defaultVersion: activeDefaultVersion,
        availableVersions: AVAILABLE_VERSIONS,
      });
      return;
    }

    // Dynamic Version Switcher
    if (pathname === "/v1/mock/set-version" && req.method === "POST") {
      const requested = normalizeVersion(body.version);
      activeDefaultVersion = requested;
      sendJson(200, { message: `Active default version set to ${requested}`, activeVersion: requested });
      return;
    }

    // OpenAPI Schema Endpoint
    if (pathname === "/v1/schema" && req.method === "GET") {
      const fixturesDir = path.resolve(__dirname, "../fixtures", activeVersion);
      const schemaPath = path.join(fixturesDir, "openapi.json");
      if (existsSync(schemaPath)) {
        const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
        sendJson(200, schema);
        return;
      }
      sendError(404, `OpenAPI schema not found for version ${activeVersion}`);
      return;
    }

    // Test Webhook Event Generator
    if (pathname === "/v1/test/webhooks/generate" && req.method === "POST") {
      const eventType = body.eventType ?? "payment_intent.succeeded";
      const resourceId = body.resourceId ?? "pi_1Gs8yF2eZvKYlo2C";
      const evt = generateWebhookEvent(activeVersion, eventType, resourceId);
      sendJson(200, evt);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CHARGES ENDPOINTS
    // ─────────────────────────────────────────────────────────────
    if (pathname === "/v1/charges") {
      if (req.method === "GET") {
        const sampleCharges = [
          generateCharge(activeVersion, "ch_1Gs8yF2eZvKYlo2C"),
          generateCharge(activeVersion, "ch_1Gs8yF2eZvKYlo2D", { amount: 3500 }),
        ];
        sendJson(200, generateListEnvelope(activeVersion, sampleCharges));
        return;
      }

      if (req.method === "POST") {
        // Category 8: In v2024-06-20-BROKEN, POST /v1/charges was removed entirely
        if (activeVersion === "v2024-06-20-BROKEN") {
          sendError(404, "Unrecognized request URL (POST: /v1/charges). Legacy charges creation endpoint has been removed. Use /v1/payment_intents instead.", "not_found");
          return;
        }

        const charge = generateCharge(activeVersion, `ch_${Date.now()}`, body);
        sendJson(200, charge);
        return;
      }
    }

    const chargeMatch = pathname.match(/^\/v1\/charges\/([^/]+)$/);
    if (chargeMatch && req.method === "GET") {
      const chargeId = chargeMatch[1];
      sendJson(200, generateCharge(activeVersion, chargeId));
      return;
    }

    // Legacy charge refund path (v2020-08-27 only)
    const chargeRefundMatch = pathname.match(/^\/v1\/charges\/([^/]+)\/refund$/);
    if (chargeRefundMatch && req.method === "POST") {
      if (activeVersion === "v2020-08-27") {
        sendJson(200, generateCharge(activeVersion, chargeRefundMatch[1], { refunded: true }));
        return;
      }
      sendError(404, "Endpoint POST /v1/charges/{id}/refund removed in favor of POST /v1/refunds", "resource_missing");
      return;
    }

    // Modern refund endpoint (v2022-11-15+)
    if (pathname === "/v1/refunds" && req.method === "POST") {
      sendJson(200, generateRefund(activeVersion, `re_${Date.now()}`, body));
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // PAYMENT INTENTS ENDPOINTS
    // ─────────────────────────────────────────────────────────────
    if (pathname === "/v1/payment_intents") {
      if (req.method === "GET") {
        const sampleIntents = [
          generatePaymentIntent(activeVersion, "pi_1Gs8yF2eZvKYlo2C"),
          generatePaymentIntent(activeVersion, "pi_1Gs8yF2eZvKYlo2D", { amount: 4500 }),
        ];
        sendJson(200, generateListEnvelope(activeVersion, sampleIntents));
        return;
      }

      if (req.method === "POST") {
        // In v2024-06-20-BROKEN: Category 4: receipt_email is required!
        if (activeVersion === "v2024-06-20-BROKEN" && !body.receipt_email) {
          sendError(400, "Missing required param: receipt_email (Category 4: optional field made required)", "parameter_missing", "receipt_email");
          return;
        }

        const intent = generatePaymentIntent(activeVersion, `pi_${Date.now()}`, body);
        sendJson(200, intent);
        return;
      }
    }

    const piMatch = pathname.match(/^\/v1\/payment_intents\/([^/]+)$/);
    if (piMatch && req.method === "GET") {
      sendJson(200, generatePaymentIntent(activeVersion, piMatch[1]));
      return;
    }

    // Standard confirm endpoint
    const piConfirmMatch = pathname.match(/^\/v1\/payment_intents\/([^/]+)\/confirm$/);
    if (piConfirmMatch && req.method === "POST") {
      if (activeVersion === "v2024-06-20-BROKEN") {
        // Category 9: Endpoint path changed in broken version
        sendError(404, "Endpoint /v1/payment_intents/{id}/confirm has moved to /v1/payment_intents/{id}/actions/confirm (Category 9)", "not_found");
        return;
      }
      sendJson(200, generatePaymentIntent(activeVersion, piConfirmMatch[1], { status: "succeeded" }));
      return;
    }

    // Category 9: New broken path
    const piActionConfirmMatch = pathname.match(/^\/v1\/payment_intents\/([^/]+)\/actions\/confirm$/);
    if (piActionConfirmMatch && req.method === "POST") {
      if (activeVersion === "v2024-06-20-BROKEN") {
        sendJson(200, generatePaymentIntent(activeVersion, piActionConfirmMatch[1], { status: "succeeded" }));
        return;
      }
      sendError(404, "Endpoint not found in standard versions", "resource_missing");
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CUSTOMERS ENDPOINTS
    // ─────────────────────────────────────────────────────────────
    if (pathname === "/v1/customers") {
      if (req.method === "GET") {
        const sampleCustomers = [
          generateCustomer(activeVersion, "cus_123"),
          generateCustomer(activeVersion, "cus_456", { name: "Alice Developer", email: "alice@example.com" }),
        ];
        sendJson(200, generateListEnvelope(activeVersion, sampleCustomers));
        return;
      }

      if (req.method === "POST") {
        const customer = generateCustomer(activeVersion, `cus_${Date.now()}`, body);
        sendJson(200, customer);
        return;
      }
    }

    const customerMatch = pathname.match(/^\/v1\/customers\/([^/]+)$/);
    if (customerMatch) {
      const customerId = customerMatch[1];
      if (req.method === "GET") {
        sendJson(200, generateCustomer(activeVersion, customerId));
        return;
      }
      if (req.method === "DELETE") {
        sendJson(200, { id: customerId, object: "customer", deleted: true });
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // SUBSCRIPTIONS ENDPOINTS
    // ─────────────────────────────────────────────────────────────
    if (pathname === "/v1/subscriptions") {
      if (req.method === "GET") {
        const sampleSubs = [
          generateSubscription(activeVersion, "sub_123"),
          generateSubscription(activeVersion, "sub_456"),
        ];
        sendJson(200, generateListEnvelope(activeVersion, sampleSubs));
        return;
      }

      if (req.method === "POST") {
        const sub = generateSubscription(activeVersion, `sub_${Date.now()}`, body);
        sendJson(200, sub);
        return;
      }
    }

    const subCancelPostMatch = pathname.match(/^\/v1\/subscriptions\/([^/]+)\/cancel$/);
    if (subCancelPostMatch && req.method === "POST") {
      if (activeVersion === "v2024-06-20-BROKEN") {
        // Category 10: Method changed to POST /cancel
        sendJson(200, generateSubscription(activeVersion, subCancelPostMatch[1], { status: "canceled" }));
        return;
      }
      sendError(404, "Endpoint POST /v1/subscriptions/{id}/cancel not found. Use DELETE /v1/subscriptions/{id}", "resource_missing");
      return;
    }

    const subMatch = pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (subMatch) {
      const subId = subMatch[1];
      if (req.method === "GET") {
        sendJson(200, generateSubscription(activeVersion, subId));
        return;
      }
      if (req.method === "DELETE") {
        if (activeVersion === "v2024-06-20-BROKEN") {
          // Category 10: DELETE /subscriptions/{id} no longer supported
          sendError(405, "Method DELETE not allowed on /v1/subscriptions/{id}. Use POST /v1/subscriptions/{id}/cancel (Category 10)", "method_not_allowed");
          return;
        }
        sendJson(200, generateSubscription(activeVersion, subId, { status: "canceled" }));
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // WEBHOOK ENDPOINTS
    // ─────────────────────────────────────────────────────────────
    if (pathname === "/v1/webhook_endpoints") {
      if (req.method === "GET") {
        sendJson(200, { object: "list", data: [generateWebhookEndpoint(activeVersion)], has_more: false });
        return;
      }
      if (req.method === "POST") {
        sendJson(200, generateWebhookEndpoint(activeVersion, `we_${Date.now()}`, body));
        return;
      }
    }

    // Unmatched Route
    sendError(404, `Unrecognized request URL (${req.method}: ${pathname}).`, "resource_missing");
  });

  return server;
}

export function startMockServer(options: MockServerOptions = {}) {
  const port = options.port ?? Number(process.env.PORT || process.env.STRIPE_MOCK_PORT || 8080);
  const host = options.host ?? (process.env.HOST || "0.0.0.0");
  const defaultVersion = normalizeVersion(options.defaultVersion ?? (process.env.STRIPE_MOCK_VERSION || "v2024-06-20"));

  const server = createMockServer({ defaultVersion });

  server.listen(port, host, () => {
    console.log(`🚀 Stripe API Mock Server listening on http://${host}:${port}`);
    console.log(`📦 Active Version: ${defaultVersion}`);
    console.log(`📋 Available Versions: ${AVAILABLE_VERSIONS.join(", ")}`);
    console.log(`💡 Switch version via header 'Stripe-Version: <version>' or env STRIPE_MOCK_VERSION`);
  });

  return server;
}

// CLI Execution Support
if (process.argv[1]?.endsWith("mock-server/index.ts") || process.argv[1]?.endsWith("mock-server/index.js")) {
  startMockServer();
}
