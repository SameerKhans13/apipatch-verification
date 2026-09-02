import { stripe } from "./client";

export { stripe };

/**
 * Category 8: Endpoint removed entirely (`stripe.charges.create` / POST /v1/charges)
 * Category 2: Field renamed (`source: token` -> `payment_method: token`)
 */
export async function createCustomerCharge(amount: number, token: string) {
  return await stripe.charges.create({
    amount,
    currency: "usd",
    source: token,
    description: "Sandbox verification charge",
  });
}
