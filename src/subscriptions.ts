import { stripe } from "./client";

/**
 * Category 15: Array changed to single object (`items.data` array -> single `line_item`)
 */
export async function listSubscriptionPlanPrices(subscriptionId: string): Promise<string[]> {
  const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as any;

  // Category 15: Array iteration (breaks if items array is replaced with a single line_item object)
  if (Array.isArray(subscription.items?.data)) {
    return subscription.items.data.map((item: any) => item.price as string);
  }

  if (subscription.line_item?.price) {
    return [subscription.line_item.price];
  }

  return [];
}

/**
 * Category 10: HTTP method changed
 * Calls DELETE /v1/subscriptions/{id} (deprecated subscriptions.del, requires POST /cancel)
 */
export async function cancelActiveSubscription(subscriptionId: string) {
  return await stripe.subscriptions.cancel(subscriptionId);
}
