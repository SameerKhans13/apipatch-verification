import { stripe } from "./client";

/**
 * Category 1: Field removed from response (`client_secret`, `statement_descriptor_suffix`)
 * Category 3: Field type changed (arithmetic on integer `amount`, key-value `metadata`)
 * Category 4: Required `currency` vs optional `receipt_email` (which broke by becoming required)
 * Category 14: Nullable field (`description` nullable -> non-nullable)
 * Category 15: Array changed to single object (`payment_method_types: ["card"]`)
 * Category 16: Default value change (`capture_method: "automatic"`)
 */
export async function initializePaymentIntent(amountInCents: number, orderId: string) {
  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: "usd", // Category 4a: was required, made optional
    // receipt_email omitted (Category 4b: was optional, made required in broken fixture)
    payment_method_types: ["card"], // Category 15: array of strings
    metadata: { order_id: orderId }, // Category 3: object metadata
  });

  // Category 3: Integer amount arithmetic (breaks if amount is a string decimal)
  const amountInDollars = (intent.amount as number) / 100;

  // Category 1: Client secret retrieval (breaks if client_secret is removed from response)
  const clientSecret = intent.client_secret;

  // Category 14: Description handling (breaks if non-nullable contract violated)
  const description = intent.description ?? "Default Transaction";

  return {
    id: intent.id,
    clientSecret,
    amountInDollars,
    status: intent.status,
    description,
  };
}

/**
 * Category 5: Enum value removed from stable status field
 * Expects 'requires_action' (3D Secure / SCA) and 'canceled' to be valid statuses
 */
export function evaluatePaymentStatus(status: string): string {
  switch (status) {
    case "requires_action":
      return "ACTION_REQUIRED_SCA"; // Category 5: Enum removed in broken fixture
    case "canceled":
      return "PAYMENT_CANCELED"; // Category 5: Enum removed in broken fixture
    case "succeeded":
      return "SUCCESS";
    case "processing":
      return "PROCESSING";
    case "requires_payment_method":
      return "NEEDS_PAYMENT_METHOD";
    default:
      return "UNKNOWN_STATUS";
  }
}

/**
 * Category 9: Endpoint path changed
 * Calls /v1/payment_intents/{id}/confirm (moved to /actions/confirm in broken fixture)
 */
export async function confirmCustomerPayment(paymentIntentId: string, paymentMethodId?: string) {
  return await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
  });
}
