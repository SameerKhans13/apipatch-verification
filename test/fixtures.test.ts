import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { detectBreakingChanges } from "../scripts/diff-detector";

describe("OpenAPI Fixtures Contract Validation", () => {
  const versions = ["v2020-08-27", "v2022-11-15", "v2024-06-20", "v2024-06-20-BROKEN"];
  const loadedFixtures: Record<string, any> = {};

  it("should have valid, parseable OpenAPI 3.0.3 specifications for all 4 versions", () => {
    for (const v of versions) {
      const filePath = path.resolve(__dirname, `../fixtures/${v}/openapi.json`);
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      const spec = JSON.parse(content);
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info).toBeDefined();
      expect(spec.paths).toBeDefined();
      expect(spec.components?.schemas).toBeDefined();
      loadedFixtures[v] = spec;
    }
  });

  it("should detect baseline transition (v2020-08-27 -> v2022-11-15) removals and evolutions", () => {
    const diff = detectBreakingChanges(loadedFixtures["v2020-08-27"], loadedFixtures["v2022-11-15"]);
    expect(diff.breakingCount).toBeGreaterThan(0);

    // Endpoint /orders removed (Category 8)
    const ordersRemoval = diff.changes.find((c) => c.category === 8 && c.location.includes("orders"));
    expect(ordersRemoval).toBeDefined();
  });

  it("should detect all 16 categories of breaking changes in v2024-06-20-BROKEN", () => {
    const diff = detectBreakingChanges(loadedFixtures["v2024-06-20"], loadedFixtures["v2024-06-20-BROKEN"]);

    // Assert that each category exists in diff
    const categoriesFound = new Set(diff.changes.map((c) => c.category));
    for (let cat = 1; cat <= 16; cat++) {
      expect(categoriesFound.has(cat)).toBe(true);
    }

    // Verify Category 1: Field removed
    const clientSecretRemoval = diff.changes.find((c) => c.category === 1 && c.location.includes("client_secret"));
    expect(clientSecretRemoval).toBeDefined();

    // Verify Category 3: Field type changed (amount integer -> string)
    const amountTypeChange = diff.changes.find((c) => c.category === 3 && c.location.includes("amount"));
    expect(amountTypeChange).toBeDefined();

    // Verify Category 4: Required receipt_email
    const receiptEmailReq = diff.changes.find((c) => c.category === 4 && c.location.includes("receipt_email"));
    expect(receiptEmailReq).toBeDefined();

    // Verify Category 5: Enum value removed
    const enumRemoved = diff.changes.find((c) => c.category === 5);
    expect(enumRemoved).toBeDefined();

    // Verify Category 16: Default value change (Semantic Edge Case)
    const defaultChanged = diff.changes.find((c) => c.category === 16 && c.location.includes("capture_method"));
    expect(defaultChanged).toBeDefined();
  });
});
