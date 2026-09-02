import { stripe } from "./client";

export { stripe };

/**
 * Modernized via ApiPatch (Recipe: stripe-charges-to-payment-intents):
 * - Category 8: Endpoint migrated (stripe.charges.create -> stripe.paymentIntents.create)
 * - Category 2: Parameter mapped (source: token -> payment_method: token, confirm: true)
 */
export async function createCustomerCharge(amount: number, token: string) {
  return await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method: token,
    confirm: true,
    description: "Sandbox verification payment intent",
  });
}
