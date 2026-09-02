import { stripe } from "./client";

/**
 * Category 11: Pagination shape changed
 * Expects classic Stripe pagination envelope:
 * { object: "list", data: [...], has_more: boolean }
 * with starting_after cursor query param.
 *
 * Breaks if envelope changes to { object: "page", items: [...], has_next_page, next_cursor }
 */
export async function fetchAllPaymentIntents(limit = 10): Promise<any[]> {
  const allIntents: any[] = [];
  let hasMore = true;
  let startingAfter: string | undefined = undefined;

  while (hasMore && allIntents.length < 50) {
    const page: any = await stripe.paymentIntents.list({
      limit,
      starting_after: startingAfter,
    });

    // Category 11: Accessing page.data array (breaks if property changed to page.items)
    if (Array.isArray(page.data)) {
      allIntents.push(...page.data);
    } else if (Array.isArray(page.items)) {
      allIntents.push(...page.items);
    }

    // Category 11: Checking page.has_more (breaks if property changed to page.has_next_page)
    hasMore = Boolean(page.has_more ?? page.has_next_page);

    if (hasMore && allIntents.length > 0) {
      startingAfter = allIntents[allIntents.length - 1].id;
    } else {
      break;
    }
  }

  return allIntents;
}
