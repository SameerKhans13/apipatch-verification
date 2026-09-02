import Stripe from "stripe";

export const stripe = new Stripe("sk_test_mock_secret_key", {
  apiVersion: "2022-11-15",
});

export async function createCustomerCharge(amount: number, token: string) {
  return await stripe.charges.create({
    amount,
    currency: "usd",
    source: token,
    description: "Sandbox verification charge",
  });
}
