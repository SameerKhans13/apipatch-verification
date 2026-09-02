export interface ProcessedWebhookEvent {
  amountInDollars: number;
  handled: boolean;
  paymentIntentId: string;
  status: string;
}

/**
 * Category 13: Webhook event payload schema changed
 * Standard webhook payload has event.data.object containing the full resource entity.
 * In broken fixture, event.data.object contains broken field types (e.g., amount as string).
 */
export function processStripeWebhookEvent(rawEventPayload: any): ProcessedWebhookEvent {
  if (rawEventPayload.type !== "payment_intent.succeeded") {
    return {
      handled: false,
      paymentIntentId: "",
      amountInDollars: 0,
      status: "unhandled_event",
    };
  }

  const paymentIntent = rawEventPayload.data?.object ?? {};
  const rawAmount = paymentIntent.amount;

  // Category 13 / Category 3: Handle both integer cents and decimal string
  let amountInDollars = 0;
  if (typeof rawAmount === "number") {
    amountInDollars = rawAmount / 100;
  } else if (typeof rawAmount === "string") {
    amountInDollars = parseFloat(rawAmount);
  }

  return {
    handled: true,
    paymentIntentId: paymentIntent.id ?? "unknown",
    amountInDollars,
    status: paymentIntent.status ?? "succeeded",
  };
}
