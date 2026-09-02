import Stripe from "stripe";

export const stripe = new Stripe("sk_test_mock_secret_key", {
  apiVersion: "2022-11-15",
});

/**
 * Category 8: Endpoint removed entirely (`stripe.charges.create` / POST /v1/charges)
 * Category 2: Field renamed (`source: token` -> `payment_method: token`)
 */
export async function createCustomerCharge(amount: number, token: string) {
  return await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    payment_method: token,
    description: "Sandbox verification charge",
  });
}
