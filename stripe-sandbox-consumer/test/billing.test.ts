import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createCustomerCharge, stripe } from "../src/billing";

describe("Stripe Sandbox Verification", () => {
  let capturedParams: any = null;

  beforeEach(() => {
    capturedParams = null;
    const mockHandler = async (params: any) => {
      capturedParams = params;
      return {
        id: "ch_test_123456789",
        object: "charge",
        amount: params.amount,
        currency: params.currency,
        paid: true,
        status: "succeeded",
        source: params.source,
        payment_method: params.payment_method,
        description: params.description,
      } as any;
    };
    spyOn(stripe.charges, "create").mockImplementation(mockHandler);
    spyOn(stripe.paymentIntents, "create").mockImplementation(mockHandler);
  });

  it("should process customer charge without errors", async () => {
    const res = await createCustomerCharge(2500, "tok_visa");
    expect(res).toBeDefined();
    expect(res.id).toBe("ch_test_123456789");
    expect(res.amount).toBe(2500);
    expect(res.currency).toBe("usd");
  });

  it("should pass charge parameters correctly", async () => {
    await createCustomerCharge(5000, "tok_visa_debit");
    expect(capturedParams).toBeDefined();
    expect(capturedParams.amount).toBe(5000);
    expect(capturedParams.currency).toBe("usd");
    expect(capturedParams.description).toBe("Sandbox verification charge");
    // Verifies token passing seamlessly before migration (source) and after remediation (payment_method)
    const passedToken = capturedParams.source ?? capturedParams.payment_method;
    expect(passedToken).toBe("tok_visa_debit");
  });
});
