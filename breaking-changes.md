# Stripe API Fixture Manifest: Injected Breaking Changes & Detection Rules

This manifest documents all breaking and non-breaking schema modifications across the test fixtures (`v2020-08-27`, `v2022-11-15`, `v2024-06-20`, and `v2024-06-20-BROKEN`).

It defines the exact validation expectations for automated schema-tracking tools, AST remediation engines (like **ApiPatch**), and OpenAPI diff validators.

---

## Stripe's Backward-Compatibility Model vs. Classic SemVer

Stripe adheres to an **additive / backwards-compatible evolution model** within major releases and uses dated API versions (e.g. `2024-06-20`) for breaking changes.

| Change Type | Stripe Convention | Classic SemVer | Tool Expected Flag | Rationale / False-Positive Prevention |
| :--- | :--- | :--- | :--- | :--- |
| **New optional request field** | Non-breaking | Minor | `NO (Compatible)` | Existing requests without the parameter continue functioning identically. |
| **New response field** | Non-breaking | Minor | `NO (Compatible)` | Robust JSON parsers ignore unknown fields (Open-world assumption). |
| **New enum value** | Non-breaking | Minor | `NO (Compatible)` | Stripe explicitly reserves the right to add enum values without bumping versions. Tools should NOT flag this as breaking unless checking exhaustive client switches. |
| **Required field made optional** | Non-breaking | Minor | `NO (Compatible)` | Client payloads providing the field remain valid. |
| **Field removed from response** | **Breaking** | Major | `YES (Breaking)` | Clients deserializing or accessing `response.field` will throw runtime `undefined` / `KeyError`. |
| **Field renamed** | **Breaking** | Major | `YES (Breaking)` | Code referencing old property name fails immediately. |
| **Field type changed** | **Breaking** | Major | `YES (Breaking)` | Parser/deserialization failure or type incompatibility (e.g., math on a string). |
| **Optional field made required** | **Breaking** | Major | `YES (Breaking)` | Existing client calls lacking this field are rejected with 400 Bad Request. |
| **Enum value removed** | **Breaking** | Major | `YES (Breaking)` | Client sending or expecting that value will encounter validation or control flow errors. |
| **Endpoint removed / path changed**| **Breaking** | Major | `YES (Breaking)` | Request returns 404 Not Found. |
| **HTTP method changed** | **Breaking** | Major | `YES (Breaking)` | Request returns 405 Method Not Allowed. |
| **Pagination shape changed** | **Breaking** | Major | `YES (Breaking)` | Auto-paginators break when envelope structure or cursor field names change. |
| **Error shape changed** | **Breaking** | Major | `YES (Breaking)` | Exception handlers expecting `error.message` crash on unrecognized structure. |
| **Nullable -> Non-nullable / vice versa** | **Breaking** | Major | `YES (Breaking)` | Type-safe clients (TypeScript, Kotlin, Rust) experience compiler or null-pointer errors. |
| **Array <-> Single object** | **Breaking** | Major | `YES (Breaking)` | Iteration or single-object access crashes with type mismatch. |
| **Default value change** | **Semantic Breaking** | Edge Case | `EDGE CASE` | Schema structural validation may not detect description changes, but runtime semantics flip. |

---

## Master Breaking-Change Matrix by Category

| # | Category | Fixture / Transition | Endpoint / Schema Component | Expected Tool Detection | SemVer / Stripe Breaking? | Why / Detection Rationale |
|---|---|---|---|---|---|---|
| **1** | **Field removed from response** | `v2024-06-20` → `v2024-06-20-BROKEN` | `PaymentIntent.client_secret`, `PaymentIntent.statement_descriptor_suffix` | `YES` | **Yes (Major)** | Client-side SDKs and frontend Elements rely on `client_secret` to mount checkout forms; removing it causes catastrophic failure. |
| **2** | **Field renamed** | `v2024-06-20` → `v2024-06-20-BROKEN` | `Customer.default_source` → `default_payment_source_id`; Request `customer` → `customer_id` | `YES` | **Yes (Major)** | Property accesses against the old identifier become `undefined`. |
| **3** | **Field type changed** | `v2024-06-20` → `v2024-06-20-BROKEN` | `PaymentIntent.amount`: `integer` (cents) → `string` (`"20.00"`); `metadata`: `object` → `string` (JSON blob) | `YES` | **Yes (Major)** | Arithmetic logic like `amount / 100` produces `NaN` or string concatenation bugs. |
| **4a** | **Required request field made optional** | `v2024-06-20` → `v2024-06-20-BROKEN` | `POST /v1/payment_intents` (`currency` removed from required) | `NO` | **No (Minor)** | **Compatible addition**: Clients sending `currency` still succeed; clients omitting it use account default. |
| **4b** | **Optional request field made required** | `v2024-06-20` → `v2024-06-20-BROKEN` | `POST /v1/payment_intents` (`receipt_email` added to required) | `YES` | **Yes (Major)** | Existing integrations that do not supply `receipt_email` receive `400 Bad Request (parameter_missing)`. |
| **5** | **Enum value removed from stable field** | `v2024-06-20` → `v2024-06-20-BROKEN` | `PaymentIntent.status` (removed `"requires_action"`, `"canceled"`) | `YES` | **Yes (Major)** | 3D Secure / SCA authentication handlers checking `status === 'requires_action'` are never triggered or become unreachable dead code. |
| **6** | **Enum value added** | `v2022-11-15` → `v2024-06-20` | `PaymentIntent.payment_method_types` (added `"amazon_pay"`, `"revolut_pay"`) | `NO` | **No (Minor)** | Standard Stripe additive rule: clients must accommodate new enum values gracefully. Tools must NOT flag as breaking unless strict exhaustive switch linting is requested. |
| **7** | **Nested object flattened / Flat field nested** | `v2024-06-20` → `v2024-06-20-BROKEN` | `Customer.billing_details.address` flattened to `billing_address_city`; `Charge.currency` nested to `Charge.pricing.currency` | `YES` | **Yes (Major)** | Navigation paths (`charge.currency` vs `charge.pricing.currency`) break in all consumer code. |
| **8** | **Endpoint removed entirely** | `v2020-08-27` → `v2022-11-15` (`/v1/orders`); `v2024-06-20` → `v2024-06-20-BROKEN` (`POST /v1/charges`) | `POST /v1/charges`, `/v1/orders` | `YES` | **Yes (Major)** | Any HTTP call to the removed route returns `404 Not Found`. |
| **9** | **Endpoint path changed** | `v2024-06-20` → `v2024-06-20-BROKEN` | `/v1/payment_intents/{id}/confirm` → `/v1/payment_intents/{id}/actions/confirm` | `YES` | **Yes (Major)** | Requests to the original path return `404 Not Found`. |
| **10** | **HTTP method changed for existing endpoint** | `v2024-06-20` → `v2024-06-20-BROKEN` | `DELETE /v1/subscriptions/{id}` → `POST /v1/subscriptions/{id}/cancel` | `YES` | **Yes (Major)** | Calling `DELETE` returns `405 Method Not Allowed`. |
| **11** | **Pagination shape changed** | `v2024-06-20` → `v2024-06-20-BROKEN` | List responses: `{ object: "list", data: [...], has_more }` → `{ object: "page", items: [...], has_next_page, next_cursor }`; param `starting_after` → `after_cursor` | `YES` | **Yes (Major)** | Client auto-pagination loop (`response.data.forEach(...)` or checking `response.has_more`) immediately crashes with TypeError. |
| **12** | **Error response shape changed** | `v2024-06-20` → `v2024-06-20-BROKEN` | `{ error: { message, code: "resource_missing" } }` → `{ errors: [{ detail, code: "not_found", doc_url }] }` | `YES` | **Yes (Major)** | SDK error parser expecting `err.error.message` receives undefined and crashes unhandled. |
| **13** | **Webhook event payload schema changed** | `v2024-06-20` → `v2024-06-20-BROKEN` | `Event.data.object` (`payment_intent.succeeded` event object follows broken schema) | `YES` | **Yes (Major)** | Webhook listener deserializes corrupted payload, causing silent business logic errors or uncaught runtime exceptions. |
| **14** | **Nullable to non-nullable & vice versa** | `v2024-06-20` → `v2024-06-20-BROKEN` | `PaymentIntent.description`: nullable → non-nullable (required string); `Charge.currency`: non-nullable → nullable | `YES` | **Yes (Major)** | If non-nullable becomes nullable, client code omitting null-checks crashes. If nullable becomes non-nullable and is missing, schema validation fails. |
| **15** | **Array <-> Single object** | `v2024-06-20` → `v2024-06-20-BROKEN` | `PaymentIntent.payment_method_types`: `string[]` → `string`; `Subscription.items`: array → `line_item` single object | `YES` | **Yes (Major)** | Calling `.map()` or `[0]` on a non-array produces `TypeError: .map is not a function`. |
| **16** | **Default value change for optional field** | `v2024-06-20` → `v2024-06-20-BROKEN` | `PaymentIntent.capture_method`: default changed from `"automatic"` to `"manual"` | `EDGE CASE` | **Semantic Breaking (Silent)** | Schema structure appears unchanged (`string` enum), but payments created without explicit `capture_method` authorization are never captured automatically, leading to unpaid uncaptured funds! |

---

## Detailed Version-by-Version Changelog

### 1. `v2020-08-27` (Baseline)
- Legacy Stripe architecture:
  - Top-level `card` object on `Charge` response (`brand`, `last4`, `exp_month`, `exp_year`).
  - `/v1/orders` endpoint active.
  - Legacy charge refund sub-resource: `POST /v1/charges/{id}/refund`.
  - Classic `starting_after` and `has_more` list pagination.

### 2. `v2022-11-15` (Mid Evolution)
- **Deprecations & Removals**:
  - `/v1/orders` removed entirely (Category 8).
  - Top-level `card` object removed from `Charge` in favor of `payment_method_details.card` (Category 1).
  - `POST /v1/charges/{id}/refund` replaced with dedicated top-level `POST /v1/refunds` (Category 9).
- **Compatible Additions**:
  - New payment method types added: `affirm`, `afterpay_clearpay` (Category 6).
  - `CreateChargeRequest` supports `payment_method` parameter in addition to legacy `source` (Category 2).

### 3. `v2024-06-20` (Latest Production Stable)
- Standardized PaymentIntents v3 workflow.
- Additional payment methods: `amazon_pay`, `revolut_pay`, `cashapp`, `blik`.
- Strict typing on metadata and webhook payloads.
- All 16 properties in canonical stable state.

### 4. `v2024-06-20-BROKEN` (Deliberate Chaos Injections)
- Injected breaking modifications spanning all 16 categories listed above to rigorously test schema validators, AST transformation agents, and CI verification pipelines.
