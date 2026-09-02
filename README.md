# Stripe API Schema Fixture Suite & Deterministic Mock Server

A local, deterministic OpenAPI fixture repository and mock server suite designed for validating API schema-tracking engines, AST code remediation tools (such as **ApiPatch**), and CI pipelines without making any network calls to the real Stripe API.

---

## 📁 Repository Structure

```tree
├── fixtures/
│   ├── v2020-08-27/openapi.json       # Baseline "old" Stripe API version
│   ├── v2022-11-15/openapi.json       # Mid evolution (orders removed, refunds extracted)
│   ├── v2024-06-20/openapi.json       # Official Latest Production Stable release
│   └── v2024-06-20-BROKEN/openapi.json # Latest + deliberately injected breaking changes (all 16 categories)
├── mock-server/
│   ├── index.ts                       # Multi-version HTTP mock server (Node/Bun native)
│   ├── data.ts                        # Deterministic entity & error generators
│   └── types.ts                       # TypeScript interfaces
├── scripts/
│   ├── ci-verify.ts                   # CI validation script asserting detection across all 16 categories
│   └── diff-detector.ts               # Reference AST & schema breaking change detector
├── test/
│   ├── fixtures.test.ts               # Contract tests for OpenAPI specs
│   └── mock-server.test.ts            # Integration tests for mock endpoints
├── breaking-changes.md                # Comprehensive manifest of all 16 breaking change categories
├── .github/workflows/ci.yml           # Continuous integration workflow
└── package.json
```

---

## 🚀 Quick Start

### 1. Install & Run Tests
```bash
# Install dependencies
bun install

# Run contract and integration test suite
bun test

# Run full 16-category schema diffing and runtime HTTP verification
bun run verify:ci
```

---

## 🌐 Running the Deterministic Mock Server

### Start the Server
```bash
# Start on default port 8080 (serves v2024-06-20 by default)
bun run start:mock

# Or specify a custom port / version
STRIPE_MOCK_PORT=8080 STRIPE_MOCK_VERSION=v2024-06-20-BROKEN bun run start:mock
```

### Version Selection Strategies

You can dynamically switch the Stripe API version served by the mock server using three different mechanisms:

#### 1. Environment Variable (`STRIPE_MOCK_VERSION`)
```bash
# Run server targeting the broken test fixture
STRIPE_MOCK_VERSION=v2024-06-20-BROKEN bun run start:mock
```

#### 2. HTTP Request Header (`Stripe-Version`)
Clients can target specific versions on a per-request basis by sending the `Stripe-Version` header:
```bash
# Query the baseline 2020-08-27 version (returns top-level card & source)
curl http://localhost:8080/v1/charges/ch_123 \
  -H "Stripe-Version: 2020-08-27"

# Query the broken fixture (returns nested pricing and null currency)
curl http://localhost:8080/v1/charges/ch_123 \
  -H "Stripe-Version: 2024-06-20-BROKEN"
```

#### 3. Dynamic Version Switch Endpoint
```bash
curl -X POST http://localhost:8080/v1/mock/set-version \
  -H "Content-Type: application/json" \
  -d '{"version": "v2024-06-20-BROKEN"}'
```

---

## 🔌 Pointing Stripe Client SDKs to the Mock Server

### Node.js / TypeScript (`stripe-node`)
```typescript
import Stripe from "stripe";

const stripe = new Stripe("sk_test_mock_secret_key", {
  apiVersion: (process.env.STRIPE_API_VERSION as any) || "2024-06-20",
  // Route client requests to the local mock server:
  host: "localhost",
  port: 8080,
  protocol: "http",
});

// Example call against the mock server:
const paymentIntent = await stripe.paymentIntents.create({
  amount: 2000,
  currency: "usd",
});
```

### Python (`stripe-python`)
```python
import os
import stripe

stripe.api_key = "sk_test_mock_secret_key"
stripe.api_base = "http://localhost:8080"
stripe.api_version = os.getenv("STRIPE_MOCK_VERSION", "2024-06-20")

# Create a charge / payment intent
pi = stripe.PaymentIntent.create(amount=2000, currency="usd")
```

### cURL
```bash
# Fetch OpenAPI spec for active version
curl http://localhost:8080/v1/schema -H "Stripe-Version: 2024-06-20"

# Generate mock webhook event
curl -X POST http://localhost:8080/v1/test/webhooks/generate \
  -H "Content-Type: application/json" \
  -H "Stripe-Version: 2024-06-20-BROKEN" \
  -d '{"eventType": "payment_intent.succeeded"}'
```

---

## 📋 The 16 Injected Breaking Change Categories

See [`breaking-changes.md`](./breaking-changes.md) for the exhaustive specification.

| # | Category | Summary | Expected Detection |
|---|---|---|---|
| 1 | **Field removed from response** | `PaymentIntent.client_secret` removed | `YES (Breaking)` |
| 2 | **Field renamed** | `Customer.default_source` → `default_payment_source_id` | `YES (Breaking)` |
| 3 | **Field type changed** | `PaymentIntent.amount` `integer` (cents) → `string` (`"20.00"`) | `YES (Breaking)` |
| 4 | **Required/Optional changed** | `currency` made optional (Non-breaking); `receipt_email` made required (Breaking) | `YES / NO (Properly split)` |
| 5 | **Enum value removed** | `requires_action` removed from `PaymentIntent.status` | `YES (Breaking)` |
| 6 | **Enum value added** | `amazon_pay` added to `payment_method_types` | `NO (Compatible Addition)` |
| 7 | **Nested/Flattened** | `billing_details.address` flattened; `currency` nested into `pricing` | `YES (Breaking)` |
| 8 | **Endpoint removed entirely** | `POST /v1/charges` removed in broken fixture | `YES (Breaking)` |
| 9 | **Endpoint path changed** | `/v1/payment_intents/{id}/confirm` → `/actions/confirm` | `YES (Breaking)` |
| 10 | **HTTP method changed** | `DELETE /v1/subscriptions/{id}` → `POST /cancel` | `YES (Breaking)` |
| 11 | **Pagination shape changed** | `list/data/has_more` → `page/items/has_next_page` | `YES (Breaking)` |
| 12 | **Error response shape changed** | `{ error: { message } }` → `{ errors: [{ doc_url, detail }] }` | `YES (Breaking)` |
| 13 | **Webhook payload changed** | `Event.data.object` schema follows broken entity shape | `YES (Breaking)` |
| 14 | **Nullable status changed** | `description` (nullable → non-null); `currency` (non-null → nullable) | `YES (Breaking)` |
| 15 | **Array <-> Single object** | `payment_method_types` `string[]` → `string` | `YES (Breaking)` |
| 16 | **Default value changed** | `capture_method` default `"automatic"` → `"manual"` | `EDGE CASE (Semantic)` |

---

## 🧪 CI Verification Script

Run the automated verification suite to assert your schema tracking and code remediation tools:

```bash
bun run verify:ci
```

The CI script performs the following sequential checks:
1. Loads all 4 OpenAPI schema specifications.
2. Computes schema diffs across all transition pairs (`v2020` → `v2022` → `v2024` → `v2024-BROKEN`).
3. Asserts that all 16 breaking change categories are flagged accurately according to Stripe's compatibility model.
4. Boots up the local mock server and executes live HTTP requests against each version to verify endpoint and error contracts.
5. Emits an execution scorecard and exits with code 0.
