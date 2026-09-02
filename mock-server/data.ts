import type { StripeApiVersion } from "./types";

export function normalizeVersion(versionStr?: string | null): StripeApiVersion {
  if (!versionStr) return "v2024-06-20";
  const cleaned = versionStr.trim().toLowerCase().replace(/^v?/, "v");
  if (cleaned.includes("broken") || cleaned.includes("2024-06-20-broken")) {
    return "v2024-06-20-BROKEN";
  }
  if (cleaned.includes("2020-08-27")) return "v2020-08-27";
  if (cleaned.includes("2022-11-15")) return "v2022-11-15";
  if (cleaned.includes("2024-06-20")) return "v2024-06-20";
  return "v2024-06-20";
}

export function generateCharge(version: StripeApiVersion, id = "ch_1Gs8yF2eZvKYlo2C", overrides: any = {}) {
  const isBroken = version === "v2024-06-20-BROKEN";
  const isBaseline = version === "v2020-08-27";

  const base: any = {
    id,
    object: "charge",
    amount: overrides.amount ?? 2000,
    paid: true,
    status: "succeeded",
    customer: overrides.customer ?? "cus_123",
    description: overrides.description ?? "Sandbox verification charge",
  };

  if (isBroken) {
    return {
      ...base,
      currency: null, // Category 14: Non-nullable -> nullable
      pricing: {
        currency: overrides.currency ?? "usd", // Category 7: Flat field currency nested inside pricing
        unit_amount: overrides.amount ?? 2000,
      },
      payment_method: overrides.payment_method ?? "pm_card_visa",
      ...overrides,
    };
  }

  if (isBaseline) {
    return {
      ...base,
      currency: overrides.currency ?? "usd",
      source: overrides.source ?? "tok_visa",
      card: {
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2028,
      },
      ...overrides,
    };
  }

  // v2022-11-15 & v2024-06-20
  return {
    ...base,
    currency: overrides.currency ?? "usd",
    payment_method: overrides.payment_method ?? "pm_card_visa",
    payment_method_details: {
      type: "card",
      card: {
        brand: "Visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2028,
      },
    },
    ...overrides,
  };
}

export function generatePaymentIntent(version: StripeApiVersion, id = "pi_1Gs8yF2eZvKYlo2C", overrides: any = {}) {
  const isBroken = version === "v2024-06-20-BROKEN";

  if (isBroken) {
    return {
      id,
      object: "payment_intent",
      amount: String(overrides.amount ?? "20.00"), // Category 3: integer -> string
      currency: overrides.currency ?? "usd",
      status: "requires_payment_method", // Stable enum (removed requires_action, canceled)
      capture_method: "manual", // Category 16: default changed to manual
      payment_method: overrides.payment_method ?? "pm_123",
      customer: overrides.customer_id ?? overrides.customer ?? "cus_123",
      description: overrides.description ?? "Required non-null charge description", // Category 14: non-nullable
      payment_method_types: "card", // Category 15: Array -> single string
      metadata: typeof overrides.metadata === "object" ? JSON.stringify(overrides.metadata) : (overrides.metadata ?? "{\"order_id\":\"1001\"}"), // Category 3: Record -> JSON string
      // Note: client_secret & statement_descriptor_suffix are REMOVED (Category 1)
      ...overrides,
    };
  }

  return {
    id,
    object: "payment_intent",
    amount: typeof overrides.amount === "number" ? overrides.amount : 2000,
    currency: overrides.currency ?? "usd",
    status: "requires_payment_method",
    client_secret: `${id}_secret_abc123`,
    statement_descriptor_suffix: "INV1001",
    capture_method: "automatic",
    payment_method: overrides.payment_method ?? "pm_123",
    customer: overrides.customer ?? "cus_123",
    description: overrides.description ?? "Standard payment intent",
    payment_method_types: ["card", "amazon_pay", "cashapp"],
    metadata: overrides.metadata ?? { order_id: "1001" },
    ...overrides,
  };
}

export function generateCustomer(version: StripeApiVersion, id = "cus_123", overrides: any = {}) {
  const isBroken = version === "v2024-06-20-BROKEN";

  if (isBroken) {
    return {
      id,
      object: "customer",
      created: 1600000000,
      email: overrides.email ?? "sam@example.com",
      name: overrides.name ?? "Sam Developer",
      phone: "+15555555555",
      default_payment_source_id: "card_123", // Category 2: default_source renamed
      billing_address_city: "San Francisco", // Category 7: flattened
      billing_address_country: "US", // Category 7: flattened
      account_status: "active", // Category 6: added enum value
      metadata: overrides.metadata ?? {},
      ...overrides,
    };
  }

  return {
    id,
    object: "customer",
    created: 1600000000,
    email: overrides.email ?? "sam@example.com",
    name: overrides.name ?? "Sam Developer",
    phone: "+15555555555",
    default_source: "card_123",
    billing_details: {
      email: overrides.email ?? "sam@example.com",
      name: overrides.name ?? "Sam Developer",
      address: {
        city: "San Francisco",
        country: "US",
        line1: "123 Market St",
        postal_code: "94105",
      },
    },
    metadata: overrides.metadata ?? {},
    ...overrides,
  };
}

export function generateSubscription(version: StripeApiVersion, id = "sub_123", overrides: any = {}) {
  const isBroken = version === "v2024-06-20-BROKEN";

  if (isBroken) {
    return {
      id,
      object: "subscription",
      customer: overrides.customer ?? "cus_123",
      status: "active",
      current_period_start: 1600000000,
      current_period_end: 1602678400,
      line_item: { // Category 15: items array changed to single line_item object
        price: overrides.price ?? "price_premium_monthly",
        quantity: overrides.quantity ?? 1,
      },
      ...overrides,
    };
  }

  return {
    id,
    object: "subscription",
    customer: overrides.customer ?? "cus_123",
    status: "active",
    current_period_start: 1600000000,
    current_period_end: 1602678400,
    items: {
      data: [
        {
          id: "si_123",
          price: overrides.price ?? "price_premium_monthly",
          quantity: overrides.quantity ?? 1,
        },
      ],
    },
    ...overrides,
  };
}

export function generateRefund(version: StripeApiVersion, id = "re_123", overrides: any = {}) {
  return {
    id,
    object: "refund",
    amount: overrides.amount ?? 2000,
    charge: overrides.charge ?? "ch_1Gs8yF2eZvKYlo2C",
    status: "succeeded",
    ...overrides,
  };
}

export function generateWebhookEndpoint(version: StripeApiVersion, id = "we_123", overrides: any = {}) {
  return {
    id,
    object: "webhook_endpoint",
    url: overrides.url ?? "https://api.example.com/webhook",
    enabled_events: overrides.enabled_events ?? ["payment_intent.succeeded", "charge.succeeded"],
    status: "enabled",
    secret: "whsec_test_secret_mock",
    ...overrides,
  };
}

export function generateListEnvelope(version: StripeApiVersion, items: any[]) {
  const isBroken = version === "v2024-06-20-BROKEN";

  if (isBroken) {
    // Category 11: List pagination changed
    return {
      object: "page",
      items,
      has_next_page: false,
      next_cursor: null,
    };
  }

  return {
    object: "list",
    data: items,
    has_more: false,
  };
}

export function generateErrorResponse(
  version: StripeApiVersion,
  message: string,
  statusCode = 400,
  code = "resource_missing",
  param: string | null = null
) {
  const isBroken = version === "v2024-06-20-BROKEN";

  if (isBroken) {
    // Category 12: Broken error response shape
    const brokenCode = code === "resource_missing" ? "not_found" : code;
    return {
      statusCode,
      body: {
        errors: [
          {
            title: statusCode === 404 ? "Not Found" : "Invalid Request",
            detail: message,
            code: brokenCode,
            status_code: statusCode,
            doc_url: `https://stripe.com/docs/error-codes/${brokenCode}`,
          },
        ],
      },
    };
  }

  return {
    statusCode,
    body: {
      error: {
        message,
        type: statusCode === 401 ? "authentication_error" : "invalid_request_error",
        code,
        param,
      },
    },
  };
}

export function generateWebhookEvent(
  version: StripeApiVersion,
  eventType = "payment_intent.succeeded",
  resourceId = "pi_1Gs8yF2eZvKYlo2C"
) {
  const isBroken = version === "v2024-06-20-BROKEN";

  let resourceObject: any;
  if (eventType.startsWith("charge")) {
    resourceObject = generateCharge(version, resourceId);
  } else if (eventType.startsWith("customer")) {
    resourceObject = generateCustomer(version, resourceId);
  } else if (eventType.startsWith("subscription")) {
    resourceObject = generateSubscription(version, resourceId);
  } else {
    // payment_intent
    resourceObject = generatePaymentIntent(version, resourceId);
  }

  return {
    id: `evt_mock_${Date.now()}`,
    object: "event",
    api_version: version.replace(/^v/, ""),
    created: Math.floor(Date.now() / 1000),
    type: eventType,
    data: {
      object: resourceObject, // Category 13: Webhook event payload schema changed
    },
  };
}
