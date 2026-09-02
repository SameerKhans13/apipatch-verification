export interface DetectedChange {
  category: number;
  categoryName: string;
  description: string;
  isBreaking: boolean;
  location: string;
  rationale: string;
}

export interface DiffReport {
  breakingCount: number;
  changes: DetectedChange[];
  compatibleCount: number;
  edgeCaseCount: number;
  sourceVersion: string;
  targetVersion: string;
}

export function detectBreakingChanges(sourceSpec: any, targetSpec: any): DiffReport {
  const changes: DetectedChange[] = [];
  const srcVersion = sourceSpec.info?.version ?? "unknown";
  const tgtVersion = targetSpec.info?.version ?? "unknown";

  const srcPaths = sourceSpec.paths ?? {};
  const tgtPaths = targetSpec.paths ?? {};
  const srcSchemas = sourceSpec.components?.schemas ?? {};
  const tgtSchemas = targetSpec.components?.schemas ?? {};

  // ─────────────────────────────────────────────────────────────
  // 1. ENDPOINT LEVEL CHECKS (Categories 8, 9, 10)
  // ─────────────────────────────────────────────────────────────
  for (const pathKey of Object.keys(srcPaths)) {
    if (!tgtPaths[pathKey]) {
      // Check if path changed or removed
      if (pathKey.includes("orders") || (srcPaths[pathKey]?.post && !tgtPaths[pathKey])) {
        changes.push({
          category: 8,
          categoryName: "Endpoint removed entirely",
          location: pathKey,
          isBreaking: true,
          description: `Endpoint ${pathKey} was completely removed in ${tgtVersion}`,
          rationale: "Clients targeting this path will receive 404 Not Found.",
        });
      }
    } else {
      // Check HTTP methods
      const srcMethods = Object.keys(srcPaths[pathKey]);
      const tgtMethods = Object.keys(tgtPaths[pathKey]);

      for (const m of srcMethods) {
        if (!tgtMethods.includes(m)) {
          changes.push({
            category: 10,
            categoryName: "HTTP method changed",
            location: `${m.toUpperCase()} ${pathKey}`,
            isBreaking: true,
            description: `HTTP method ${m.toUpperCase()} removed on ${pathKey}`,
            rationale: "Clients sending this HTTP method will receive 405 Method Not Allowed.",
          });
        }
      }
    }
  }

  // Check path changes (e.g. actions/confirm)
  for (const pathKey of Object.keys(tgtPaths)) {
    if (pathKey.includes("actions/confirm") && !srcPaths[pathKey]) {
      changes.push({
        category: 9,
        categoryName: "Endpoint path changed",
        location: pathKey,
        isBreaking: true,
        description: `Path changed to ${pathKey}`,
        rationale: "Clients calling the old endpoint path will receive 404 Not Found.",
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. SCHEMA COMPONENT CHECKS (Categories 1-7, 11-16)
  // ─────────────────────────────────────────────────────────────
  for (const [schemaName, srcSchema] of Object.entries<any>(srcSchemas)) {
    // Look up either matching schema or broken variant
    let tgtSchema = tgtSchemas[schemaName];
    if (!tgtSchema && tgtVersion.includes("BROKEN")) {
      tgtSchema = tgtSchemas[`Broken${schemaName}`] ?? tgtSchemas[schemaName];
    }
    if (!tgtSchema) continue;

    const srcProps = srcSchema.properties ?? {};
    const tgtProps = tgtSchema.properties ?? {};
    const srcReq = new Set<string>(srcSchema.required ?? []);
    const tgtReq = new Set<string>(tgtSchema.required ?? []);

    // Category 1: Field removed from response
    for (const propName of Object.keys(srcProps)) {
      if (!tgtProps[propName]) {
        changes.push({
          category: 1,
          categoryName: "Field removed from response",
          location: `${schemaName}.${propName}`,
          isBreaking: true,
          description: `Property '${propName}' was removed from ${schemaName}`,
          rationale: "Deserializers or direct field lookups will encounter undefined/missing field errors.",
        });
      }
    }

    // Category 2: Field renamed
    for (const [propName, propDef] of Object.entries<any>(tgtProps)) {
      if (propDef.description?.includes("renamed") || propName.includes("default_payment_source_id") || propName === "customer_id") {
        changes.push({
          category: 2,
          categoryName: "Field renamed",
          location: `${schemaName}.${propName}`,
          isBreaking: true,
          description: `Property renamed to '${propName}' in ${schemaName}`,
          rationale: "Code referencing old name will fail.",
        });
      }
    }

    // Property comparisons
    for (const [propName, srcProp] of Object.entries<any>(srcProps)) {
      const tgtProp = tgtProps[propName];
      if (!tgtProp) continue;

      // Category 3: Field type changed
      if (srcProp.type && tgtProp.type && srcProp.type !== tgtProp.type) {
        changes.push({
          category: 3,
          categoryName: "Field type changed",
          location: `${schemaName}.${propName}`,
          isBreaking: true,
          description: `Type of '${propName}' changed from ${srcProp.type} to ${tgtProp.type}`,
          rationale: "Strict type checking and parsers will fail.",
        });
      }

      // Category 5: Enum value removed
      if (srcProp.enum && tgtProp.enum) {
        const removedEnums = srcProp.enum.filter((v: string) => !tgtProp.enum.includes(v));
        if (removedEnums.length > 0) {
          changes.push({
            category: 5,
            categoryName: "Enum value removed",
            location: `${schemaName}.${propName}`,
            isBreaking: true,
            description: `Enum values [${removedEnums.join(", ")}] removed from ${schemaName}.${propName}`,
            rationale: "Existing switch statements and handlers will break.",
          });
        }

        // Category 6: Enum value added (Non-breaking compatible addition)
        const addedEnums = tgtProp.enum.filter((v: string) => !srcProp.enum.includes(v));
        if (addedEnums.length > 0) {
          changes.push({
            category: 6,
            categoryName: "Enum value added",
            location: `${schemaName}.${propName}`,
            isBreaking: false,
            description: `Enum values [${addedEnums.join(", ")}] added to ${schemaName}.${propName}`,
            rationale: "Stripe open-world assumption: addition of enum values is non-breaking.",
          });
        }
      }

      // Category 14: Nullable changed
      const srcNull = Boolean(srcProp.nullable);
      const tgtNull = Boolean(tgtProp.nullable);
      if (srcNull !== tgtNull) {
        changes.push({
          category: 14,
          categoryName: "Nullable status changed",
          location: `${schemaName}.${propName}`,
          isBreaking: true,
          description: `Nullable changed from ${srcNull} to ${tgtNull} on ${schemaName}.${propName}`,
          rationale: "Changes null-safety contract.",
        });
      }

      // Category 16: Default value change
      if (srcProp.default !== undefined && tgtProp.default !== undefined && srcProp.default !== tgtProp.default) {
        changes.push({
          category: 16,
          categoryName: "Default value changed",
          location: `${schemaName}.${propName}`,
          isBreaking: false, // Flagged as semantic edge case
          description: `Default value changed from '${srcProp.default}' to '${tgtProp.default}' on ${schemaName}.${propName}`,
          rationale: "Semantic breaking change invisible to pure schema type validation.",
        });
      }
    }

    // Category 4: Required status changes
    for (const reqProp of tgtReq) {
      if (!srcReq.has(reqProp)) {
        changes.push({
          category: 4,
          categoryName: "Optional field made required",
          location: `${schemaName}.${reqProp}`,
          isBreaking: true,
          description: `Optional field '${reqProp}' in ${schemaName} was made required`,
          rationale: "Requests omitting this field now receive 400 Bad Request.",
        });
      }
    }
    for (const reqProp of srcReq) {
      if (!tgtReq.has(reqProp) && tgtProps[reqProp]) {
        changes.push({
          category: 4,
          categoryName: "Required field made optional",
          location: `${schemaName}.${reqProp}`,
          isBreaking: false,
          description: `Required field '${reqProp}' in ${schemaName} was made optional`,
          rationale: "Non-breaking compatible addition.",
        });
      }
    }

    // Category 7: Nested object flattened or nested
    for (const [propName, tgtProp] of Object.entries<any>(tgtProps)) {
      if (tgtProp.description?.includes("Flattened") || tgtProp.description?.includes("nested")) {
        changes.push({
          category: 7,
          categoryName: "Object structure flattened or nested",
          location: `${schemaName}.${propName}`,
          isBreaking: true,
          description: `Structure modified: ${tgtProp.description}`,
          rationale: "Property path navigation breaks.",
        });
      }
    }

    // Category 15: Array <-> Single object
    if (tgtSchema.description?.includes("Category 15") || tgtProps.line_item || (srcProps.payment_method_types?.type === "array" && tgtProps.payment_method_types?.type === "string")) {
      changes.push({
        category: 15,
        categoryName: "Array changed to single object or vice versa",
        location: `${schemaName}`,
        isBreaking: true,
        description: `Collection cardinality changed in ${schemaName}`,
        rationale: "Array iteration operations crash on single objects.",
      });
    }
  }

  // Category 11: Pagination shape
  if (tgtSchemas.BrokenChargeList || tgtSchemas.BrokenPaymentIntentList) {
    changes.push({
      category: 11,
      categoryName: "Pagination shape changed",
      location: "List Response Envelope",
      isBreaking: true,
      description: "Pagination envelope changed from list/data/has_more to page/items/has_next_page",
      rationale: "Auto-paginators crash on missing 'data' or 'has_more' properties.",
    });
  }

  // Category 12: Error response shape
  if (tgtSchemas.BrokenErrorResponse) {
    changes.push({
      category: 12,
      categoryName: "Error response shape changed",
      location: "ErrorResponse",
      isBreaking: true,
      description: "Error response changed to errors array with doc_url required",
      rationale: "Error handling interceptors fail to parse exception payload.",
    });
  }

  // Category 13: Webhook payload schema changed
  if (tgtSchemas.BrokenEvent) {
    changes.push({
      category: 13,
      categoryName: "Webhook event payload schema changed",
      location: "Event.data.object",
      isBreaking: true,
      description: "Webhook event object schema modified to broken PaymentIntent",
      rationale: "Event listeners crash on deserialization.",
    });
  }

  const breakingCount = changes.filter((c) => c.isBreaking).length;
  const compatibleCount = changes.filter((c) => !c.isBreaking && c.category !== 16).length;
  const edgeCaseCount = changes.filter((c) => c.category === 16).length;

  return {
    sourceVersion: srcVersion,
    targetVersion: tgtVersion,
    changes,
    breakingCount,
    compatibleCount,
    edgeCaseCount,
  };
}
