import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock_secret_key", {
  apiVersion: "2022-11-15",
  host: process.env.STRIPE_MOCK_HOST || "localhost",
  port: process.env.STRIPE_MOCK_PORT ? Number(process.env.STRIPE_MOCK_PORT) : undefined,
  protocol: process.env.STRIPE_MOCK_PORT ? "http" : undefined,
});
