import { stripe } from "./client";

/**
 * Category 2: Field renamed (`customer.default_source` -> `default_payment_source_id`)
 * Category 7: Nested object flattened (`billing_details.address.city` -> `billing_address_city`)
 * Category 6: Enum value added (`account_status`)
 */
export async function getCustomerBillingProfile(customerId: string) {
  const customer = (await stripe.customers.retrieve(customerId)) as any;

  // Category 2: Accessing default_source (breaks if renamed to default_payment_source_id)
  const defaultSource = customer.default_source;

  // Category 7: Deep property navigation on nested billing_details (breaks if flattened)
  const billingCity = customer.billing_details?.address?.city ?? "Unknown City";
  const billingCountry = customer.billing_details?.address?.country ?? "US";

  // Category 6: Handle customer account status enum
  const status = customer.account_status ?? "active";

  return {
    id: customer.id,
    email: customer.email,
    defaultSource,
    billingCity,
    billingCountry,
    status,
  };
}

export async function createCustomerWithDetails(email: string, name: string) {
  return await stripe.customers.create({
    email,
    name,
  });
}
