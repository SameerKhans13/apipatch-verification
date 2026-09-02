export type StripeApiVersion =
  | "v2020-08-27"
  | "v2022-11-15"
  | "v2024-06-20"
  | "v2024-06-20-BROKEN";

export interface MockServerOptions {
  defaultVersion?: StripeApiVersion;
  host?: string;
  port?: number;
  verbose?: boolean;
}

export interface WebhookGenerateRequest {
  eventType?: string;
  resourceId?: string;
  version?: StripeApiVersion;
}
