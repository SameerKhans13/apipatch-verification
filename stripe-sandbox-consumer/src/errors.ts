export interface ParsedStripeError {
  code: string;
  docUrl?: string;
  isResourceMissing: boolean;
  message: string;
}

/**
 * Category 12: Error response shape changed
 * Standard Stripe error format:
 * { error: { type: "invalid_request_error", message: "...", code: "resource_missing", param: "..." } }
 *
 * In broken fixture:
 * { errors: [ { detail: "...", code: "not_found", doc_url: "..." } ] }
 */
export function handleStripeApiError(rawError: any): ParsedStripeError {
  // Standard format
  if (rawError?.error) {
    const err = rawError.error;
    return {
      message: err.message ?? "Unknown error",
      code: err.code ?? "unknown",
      isResourceMissing: err.code === "resource_missing" || rawError.statusCode === 404,
    };
  }

  // Broken format (Category 12)
  if (Array.isArray(rawError?.errors) && rawError.errors.length > 0) {
    const firstError = rawError.errors[0];
    return {
      message: firstError.detail ?? "Unknown error",
      code: firstError.code ?? "unknown",
      docUrl: firstError.doc_url,
      isResourceMissing: firstError.code === "not_found" || rawError.statusCode === 404,
    };
  }

  return {
    message: rawError?.message ?? "Unhandled exception",
    code: "generic_error",
    isResourceMissing: false,
  };
}
