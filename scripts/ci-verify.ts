import { readFileSync } from "node:fs";
import path from "node:path";
import { createMockServer } from "../mock-server/index";
import { detectBreakingChanges } from "./diff-detector";

interface CategoryScore {
  category: number;
  detected: boolean;
  expectedFlag: string;
  name: string;
  transition: string;
}

const CATEGORY_DEFINITIONS: Array<{ category: number; expectedFlag: string; name: string }> = [
  { category: 1, name: "Field removed from response", expectedFlag: "YES (Breaking)" },
  { category: 2, name: "Field renamed", expectedFlag: "YES (Breaking)" },
  { category: 3, name: "Field type changed", expectedFlag: "YES (Breaking)" },
  { category: 4, name: "Required/Optional status changed", expectedFlag: "YES (Breaking for optional->required, NO for required->optional)" },
  { category: 5, name: "Enum value removed from stable field", expectedFlag: "YES (Breaking)" },
  { category: 6, name: "Enum value added", expectedFlag: "NO (Compatible Addition)" },
  { category: 7, name: "Nested object flattened / Flat nested", expectedFlag: "YES (Breaking)" },
  { category: 8, name: "Endpoint removed entirely", expectedFlag: "YES (Breaking)" },
  { category: 9, name: "Endpoint path changed", expectedFlag: "YES (Breaking)" },
  { category: 10, name: "HTTP method changed", expectedFlag: "YES (Breaking)" },
  { category: 11, name: "Pagination shape changed", expectedFlag: "YES (Breaking)" },
  { category: 12, name: "Error response shape changed", expectedFlag: "YES (Breaking)" },
  { category: 13, name: "Webhook event payload schema changed", expectedFlag: "YES (Breaking)" },
  { category: 14, name: "Nullable status changed", expectedFlag: "YES (Breaking)" },
  { category: 15, name: "Array changed to single object or vice versa", expectedFlag: "YES (Breaking)" },
  { category: 16, name: "Default value changed for optional field", expectedFlag: "EDGE CASE (Semantic Breaking)" },
];

async function runCiVerification() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STRIPE API SCHEMA & MOCK SERVER CI VERIFICATION SUITE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const baseDir = path.resolve(__dirname, "..");
  const loadFixture = (version: string) => {
    const file = path.join(baseDir, "fixtures", version, "openapi.json");
    return JSON.parse(readFileSync(file, "utf-8"));
  };

  console.log("📂 1. Loading OpenAPI Fixture Files...");
  const v2020 = loadFixture("v2020-08-27");
  const v2022 = loadFixture("v2022-11-15");
  const v2024 = loadFixture("v2024-06-20");
  const vBroken = loadFixture("v2024-06-20-BROKEN");
  console.log("   ✔ All 4 OpenAPI fixtures loaded successfully.\n");

  console.log("🔍 2. Running Automated Schema Diff Detection across Transitions...\n");

  const diff1 = detectBreakingChanges(v2020, v2022);
  console.log(`   [Transition 1: v2020-08-27 → v2022-11-15]`);
  console.log(`   - Breaking Changes Detected: ${diff1.breakingCount}`);
  console.log(`   - Compatible Additions: ${diff1.compatibleCount}\n`);

  const diff2 = detectBreakingChanges(v2022, v2024);
  console.log(`   [Transition 2: v2022-11-15 → v2024-06-20]`);
  console.log(`   - Breaking Changes Detected: ${diff2.breakingCount}`);
  console.log(`   - Compatible Additions: ${diff2.compatibleCount}\n`);

  const diff3 = detectBreakingChanges(v2024, vBroken);
  console.log(`   [Transition 3: v2024-06-20 → v2024-06-20-BROKEN]`);
  console.log(`   - Breaking Changes Detected: ${diff3.breakingCount}`);
  console.log(`   - Compatible Additions: ${diff3.compatibleCount}`);
  console.log(`   - Semantic Edge Cases: ${diff3.edgeCaseCount}\n`);

  // Collect all detected category numbers across all transitions
  const allDetectedChanges = [...diff1.changes, ...diff2.changes, ...diff3.changes];
  const detectedCategorySet = new Set(allDetectedChanges.map((c) => c.category));

  console.log("📊 3. Category Coverage Scorecard (All 16 Categories):");
  console.log("─────────────────────────────────────────────────────────────────────────");
  console.log(" Cat | Status | Category Description                      | Expected Detection");
  console.log("─────┼────────┼───────────────────────────────────────────┼──────────────");

  let missingCount = 0;
  for (const def of CATEGORY_DEFINITIONS) {
    const isPresent = detectedCategorySet.has(def.category);
    const statusIcon = isPresent ? " PASS " : " FAIL ";
    if (!isPresent) missingCount++;
    console.log(
      ` ${String(def.category).padStart(3, " ")} | ${statusIcon} | ${def.name.padEnd(41, " ")} | ${def.expectedFlag}`
    );
  }
  console.log("─────────────────────────────────────────────────────────────────────────\n");

  if (missingCount > 0) {
    throw new Error(`CI Failed: ${missingCount} breaking change categories were not detected in fixtures!`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. RUNTIME MOCK SERVER SANITY TESTS
  // ─────────────────────────────────────────────────────────────
  console.log("🌐 4. Launching Local Mock Server & Verifying HTTP Contracts...");
  const PORT = 8099;
  const server = createMockServer();
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", () => resolve()));
  console.log(`   ✔ Mock server running on http://127.0.0.1:${PORT}\n`);

  try {
    // Check Health
    const resHealth = await fetch(`http://127.0.0.1:${PORT}/health`);
    const healthData: any = await resHealth.json();
    if (healthData.status !== "ok") throw new Error("Health check failed");
    console.log("   ✔ GET /health returned 200 OK");

    // Check v2024-06-20 standard PaymentIntent creation
    const resPi = await fetch(`http://127.0.0.1:${PORT}/v1/payment_intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20" },
      body: JSON.stringify({ amount: 2000, currency: "usd" }),
    });
    const piData: any = await resPi.json();
    if (typeof piData.amount !== "number" || !piData.client_secret) {
      throw new Error("v2024-06-20 PaymentIntent shape mismatch");
    }
    console.log("   ✔ POST /v1/payment_intents (v2024-06-20) verified (amount is number, client_secret present)");

    // Check v2024-06-20-BROKEN broken endpoint behaviors
    const resBrokenPostCharges = await fetch(`http://127.0.0.1:${PORT}/v1/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20-BROKEN" },
      body: JSON.stringify({ amount: 2000, currency: "usd" }),
    });
    if (resBrokenPostCharges.status !== 404) {
      throw new Error("v2024-06-20-BROKEN POST /v1/charges did not return 404");
    }
    const errData: any = await resBrokenPostCharges.json();
    if (!Array.isArray(errData.errors) || !errData.errors[0]?.doc_url) {
      throw new Error("v2024-06-20-BROKEN error shape mismatch (Category 12)");
    }
    console.log("   ✔ Category 8 & 12: POST /v1/charges returned 404 with broken errors array containing doc_url");

    // Check Category 9: Confirm path moved
    const resOldConfirm = await fetch(`http://127.0.0.1:${PORT}/v1/payment_intents/pi_123/confirm`, {
      method: "POST",
      headers: { "Stripe-Version": "2024-06-20-BROKEN" },
    });
    if (resOldConfirm.status !== 404) throw new Error("Category 9 confirm path check failed");
    const resNewConfirm = await fetch(`http://127.0.0.1:${PORT}/v1/payment_intents/pi_123/actions/confirm`, {
      method: "POST",
      headers: { "Stripe-Version": "2024-06-20-BROKEN" },
    });
    if (resNewConfirm.status !== 200) throw new Error("Category 9 actions/confirm path check failed");
    console.log("   ✔ Category 9: Endpoint path change confirmed (/actions/confirm)");

    // Check Category 10: Subscription DELETE -> POST cancel
    const resSubDelete = await fetch(`http://127.0.0.1:${PORT}/v1/subscriptions/sub_123`, {
      method: "DELETE",
      headers: { "Stripe-Version": "2024-06-20-BROKEN" },
    });
    if (resSubDelete.status !== 405) throw new Error("Category 10 DELETE subscription check failed");
    const resSubCancelPost = await fetch(`http://127.0.0.1:${PORT}/v1/subscriptions/sub_123/cancel`, {
      method: "POST",
      headers: { "Stripe-Version": "2024-06-20-BROKEN" },
    });
    if (resSubCancelPost.status !== 200) throw new Error("Category 10 POST /cancel check failed");
    console.log("   ✔ Category 10: HTTP method change verified (DELETE returned 405, POST /cancel returned 200)");

    // Check Category 13: Webhook generator
    const resWebhook = await fetch(`http://127.0.0.1:${PORT}/v1/test/webhooks/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Version": "2024-06-20-BROKEN" },
      body: JSON.stringify({ eventType: "payment_intent.succeeded" }),
    });
    const webhookPayload: any = await resWebhook.json();
    if (typeof webhookPayload.data.object.amount !== "string") {
      throw new Error("Category 13 webhook payload shape mismatch");
    }
    console.log("   ✔ Category 13: Webhook generator produced event with broken object schema");

    console.log("\n🎉 ALL 16 CATEGORIES & RUNTIME CONTRACTS PASSED CI VERIFICATION!\n");
  } finally {
    server.close();
  }
}

runCiVerification().catch((err) => {
  console.error("\n❌ CI Verification Failed:\n", err);
  process.exit(1);
});
