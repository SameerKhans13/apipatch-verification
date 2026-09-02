import { describe, expect, it, spyOn } from "bun:test";
import {
  stripe,
  createCustomerCharge,
  initializePaymentIntent,
  evaluatePaymentStatus,
  confirmCustomerPayment,
  getCustomerBillingProfile,
  createCustomerWithDetails,
  listSubscriptionPlanPrices,
  cancelActiveSubscription,
  fetchAllPaymentIntents,
  handleStripeApiError,
  processStripeWebhookEvent,
} from "../src/index";

describe("All 16 Breaking Change Consumer Modules", () => {
  // Category 8 & 2: Charges
  it("Category 8 & 2: createCustomerCharge calls charges endpoint", async () => {
    spyOn(stripe.charges, "create").mockImplementation(async (params: any) => {
      return {
        id: "ch_mock_123",
        amount: params.amount,
        currency: params.currency,
        source: params.source,
      } as any;
    });

    const res = await createCustomerCharge(2500, "tok_visa");
    expect(res.id).toBe("ch_mock_123");
    expect(res.amount).toBe(2500);
  });

  // Category 1, 3, 4, 14, 15: PaymentIntents initialization
  it("Category 1, 3, 4, 14, 15: initializePaymentIntent handles response parsing", async () => {
    spyOn(stripe.paymentIntents, "create").mockImplementation(async (params: any) => {
      return {
        id: "pi_mock_123",
        amount: params.amount,
        currency: params.currency,
        client_secret: "pi_mock_123_secret_xyz",
        status: "requires_action",
        description: "Test description",
        payment_method_types: ["card"],
        metadata: params.metadata,
      } as any;
    });

    const res = await initializePaymentIntent(5000, "ord_999");
    expect(res.id).toBe("pi_mock_123");
    expect(res.amountInDollars).toBe(50);
    expect(res.clientSecret).toBe("pi_mock_123_secret_xyz");
  });

  // Category 5: Status Enum mapping
  it("Category 5: evaluatePaymentStatus maps SCA and canceled enums", () => {
    expect(evaluatePaymentStatus("requires_action")).toBe("ACTION_REQUIRED_SCA");
    expect(evaluatePaymentStatus("canceled")).toBe("PAYMENT_CANCELED");
    expect(evaluatePaymentStatus("succeeded")).toBe("SUCCESS");
  });

  // Category 9: Confirm path
  it("Category 9: confirmCustomerPayment invokes confirm", async () => {
    spyOn(stripe.paymentIntents, "confirm").mockImplementation(async (id: string, params: any) => {
      return { id, status: "succeeded" } as any;
    });

    const res = await confirmCustomerPayment("pi_mock_123", "pm_card_visa");
    expect(res.status).toBe("succeeded");
  });

  // Category 2, 6, 7: Customer profile & nested billing
  it("Category 2, 6, 7: getCustomerBillingProfile navigates nested address and status", async () => {
    spyOn(stripe.customers, "retrieve").mockImplementation(async (id: string) => {
      return {
        id,
        email: "alice@example.com",
        default_source: "tok_mastercard",
        account_status: "active",
        billing_details: {
          address: {
            city: "San Francisco",
            country: "US",
          },
        },
      } as any;
    });

    const profile = await getCustomerBillingProfile("cus_123");
    expect(profile.defaultSource).toBe("tok_mastercard");
    expect(profile.billingCity).toBe("San Francisco");
    expect(profile.status).toBe("active");
  });

  // Category 10 & 15: Subscription cancellation and line item iteration
  it("Category 10 & 15: subscription operations handle items array and cancel", async () => {
    spyOn(stripe.subscriptions, "retrieve").mockImplementation(async (id: string) => {
      return {
        id,
        items: {
          data: [{ price: "price_basic_plan" }, { price: "price_addon" }],
        },
      } as any;
    });
    spyOn(stripe.subscriptions, "cancel").mockImplementation(async (id: string) => {
      return { id, status: "canceled" } as any;
    });

    const prices = await listSubscriptionPlanPrices("sub_123");
    expect(prices).toEqual(["price_basic_plan", "price_addon"]);

    const cancelRes = await cancelActiveSubscription("sub_123");
    expect(cancelRes.status).toBe("canceled");
  });

  // Category 11: Pagination
  it("Category 11: fetchAllPaymentIntents paginates data array", async () => {
    spyOn(stripe.paymentIntents, "list").mockImplementation(async (params: any) => {
      if (!params?.starting_after) {
        return {
          object: "list",
          data: [{ id: "pi_1" }, { id: "pi_2" }],
          has_more: true,
        } as any;
      }
      return {
        object: "list",
        data: [{ id: "pi_3" }],
        has_more: false,
      } as any;
    });

    const items = await fetchAllPaymentIntents(2);
    expect(items.length).toBe(3);
    expect(items[0].id).toBe("pi_1");
  });

  // Category 12: Error shape handling
  it("Category 12: handleStripeApiError parses standard and broken error shapes", () => {
    const standardErr = {
      error: {
        message: "Resource not found",
        code: "resource_missing",
      },
    };
    const parsedStd = handleStripeApiError(standardErr);
    expect(parsedStd.isResourceMissing).toBe(true);
    expect(parsedStd.message).toBe("Resource not found");

    const brokenErr = {
      errors: [
        {
          detail: "Endpoint moved",
          code: "not_found",
          doc_url: "https://stripe.com/docs/errors",
        },
      ],
    };
    const parsedBroken = handleStripeApiError(brokenErr);
    expect(parsedBroken.isResourceMissing).toBe(true);
    expect(parsedBroken.docUrl).toBe("https://stripe.com/docs/errors");
  });

  // Category 13: Webhook payload processing
  it("Category 13: processStripeWebhookEvent processes event object payload", () => {
    const rawEvt = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_event_123",
          amount: 4500,
          status: "succeeded",
        },
      },
    };

    const processed = processStripeWebhookEvent(rawEvt);
    expect(processed.handled).toBe(true);
    expect(processed.paymentIntentId).toBe("pi_event_123");
    expect(processed.amountInDollars).toBe(45);
  });
});
