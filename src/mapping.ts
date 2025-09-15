import type { 
  Subscription, 
  UpcomingOrder, 
  PastOrder, 
  OrderItem,
  PageInfo 
} from './schemas.js';

// Parse Shopify GID to extract numeric ID
export function parseGidTail(gid: string): number {
  const match = gid.match(/\/(\d+)$/);
  if (!match) {
    throw new Error(`Invalid Shopify GID format: ${gid}`);
  }
  return parseInt(match[1], 10);
}

// Build pageable query parameters for Appstle API
export function buildPageableQuery(params: {
  page: number;
  size: number;
  sort: string[];
}): Record<string, string> {
  return {
    'pageable.page': params.page.toString(),
    'pageable.size': params.size.toString(),
    'pageable.sort': params.sort.join(','),
  };
}

// Alternative JSON serialization for pageable if needed
export function buildPageableQueryJson(params: {
  page: number;
  size: number;
  sort: string[];
}): string {
  return JSON.stringify({
    page: params.page,
    size: params.size,
    sort: params.sort,
  });
}

// Transform Appstle subscription response to our schema
export function toSubscriptionsSummary(appstle: {
  subscriptionContracts: {
    edges: Array<{
      node: {
        id: string;
        status: string;
        nextBillingDate: string;
        createdAt?: string;
        deliveryPolicy?: {
          interval: string;
          intervalCount: number;
        };
        lines?: {
          edges: Array<{
            node: {
              productTitle?: string;
              variantTitle?: string;
              quantity: number;
            };
          }>;
        };
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string;
    };
  };
}): { subscriptions: Subscription[]; page_info: PageInfo } {
  const subscriptions: Subscription[] = appstle.subscriptionContracts.edges.map(edge => {
    const node = edge.node;
    const contractId = parseGidTail(node.id);
    
    // Build plan name from delivery policy
    let planName = 'Subscription';
    if (node.deliveryPolicy) {
      const { interval, intervalCount } = node.deliveryPolicy;
      planName = `${intervalCount} ${interval}${intervalCount > 1 ? 's' : ''}`;
    }
    
    // Build items summary
    let itemsSummary = '';
    if (node.lines?.edges.length) {
      const items = node.lines.edges.map(lineEdge => {
        const line = lineEdge.node;
        const title = line.variantTitle || line.productTitle || 'Item';
        return line.quantity > 1 ? `${line.quantity}x ${title}` : title;
      });
      itemsSummary = items.slice(0, 3).join(', ');
      if (items.length > 3) {
        itemsSummary += ` +${items.length - 3} more`;
      }
    }

    return {
      subscription_contract_id: contractId,
      subscription_contract_gid: node.id,
      status: node.status,
      plan_name: planName,
      next_billing_date: node.nextBillingDate,
      items_summary: itemsSummary || undefined,
      created_at: node.createdAt || undefined,
    };
  });

  return {
    subscriptions,
    page_info: {
      has_next_page: appstle.subscriptionContracts.pageInfo.hasNextPage,
      end_cursor: appstle.subscriptionContracts.pageInfo.endCursor,
    },
  };
}

// Transform Appstle billing attempt to our schema
// NOTE: Despite confusing API naming, we use attempt.id (not attempt.billingAttemptId which is always null)
export function mapBillingAttempt(attempt: {
  id: number; // This is the actual ID to use for skip/unskip operations
  billingAttemptId?: string; // This is always null in practice - ignore it!
  orderId?: number; // This is the Shopify order ID (when order is created)
  orderName?: string;
  billingDate: string;
  status: string;
  variantList?: Array<{
    title?: string;
    quantity?: number;
    productTitle?: string;
    variantTitle?: string;
  }>;
}): UpcomingOrder | PastOrder {
  const items: OrderItem[] = [];
  
  if (attempt.variantList?.length) {
    for (const variant of attempt.variantList) {
      const title = variant.variantTitle || variant.title || variant.productTitle || 'Item';
      const quantity = variant.quantity || 1;
      items.push({ title, quantity });
    }
  }

  const baseOrder = {
    order_id: attempt.id, // The main ID used for skip/unskip operations
    billing_attempt_ref: attempt.billingAttemptId || undefined, // Usually null
    shopify_order_id: attempt.orderId || undefined, // Shopify order ID (when created)
    order_name: attempt.orderName || undefined,
    billing_date: attempt.billingDate,
    status: attempt.status,
  };

  // For upcoming orders, include items
  if (items.length > 0) {
    return {
      ...baseOrder,
      items,
    } as UpcomingOrder;
  }

  return baseOrder as PastOrder;
}

// Transform Appstle top-orders response
export function toUpcomingOrders(appstle: Array<{
  id: number;
  billingAttemptId?: string;
  orderId?: number;
  orderName?: string;
  billingDate: string;
  status: string;
  variantList?: Array<{
    title?: string;
    quantity?: number;
    productTitle?: string;
    variantTitle?: string;
  }>;
}>): UpcomingOrder[] {
  return appstle.map(attempt => mapBillingAttempt(attempt) as UpcomingOrder);
}

// Transform Appstle past-orders response
export function toPastOrders(appstle: {
  content: Array<{
    id: number;
    billingAttemptId?: string;
    orderId?: number;
    orderName?: string;
    billingDate: string;
    status: string;
  }>;
  totalElements: number;
  size: number;
  number: number;
}): { past: PastOrder[]; page: number; size: number; has_more: boolean } {
  const past = appstle.content.map(attempt => mapBillingAttempt(attempt) as PastOrder);
  
  return {
    past,
    page: appstle.number,
    size: appstle.size,
    has_more: past.length === appstle.size && appstle.totalElements > (appstle.number + 1) * appstle.size,
  };
}

// Transform skip/unskip response
// NOTE: Same ID field confusion applies here - appstle.id is the actual identifier
export function mapSkipResponse(appstle: {
  id: number; // The main ID that was used for the skip/unskip operation
  billingAttemptId?: string; // Usually null - ignore
  orderId?: number; // Shopify order ID (when order exists)
  orderName?: string;
  billingDate: string;
  status: string;
}, isSkip: boolean = true): {
  order_id: number;
  billing_attempt_ref?: string;
  shopify_order_id?: number;
  order_name?: string;
  billing_date: string;
  status: string;
  message: string;
} {
  return {
    order_id: appstle.id, // The main ID (not billingAttemptId!)
    billing_attempt_ref: appstle.billingAttemptId || undefined,
    shopify_order_id: appstle.orderId || undefined,
    order_name: appstle.orderName || undefined,
    billing_date: appstle.billingDate,
    status: appstle.status,
    message: isSkip ? 'Order skipped' : 'Order unskipped',
  };
}

// Validate that a value is a numeric Shopify customer ID (not a GID)
export function validateNumericCustomerId(value: unknown): number {
  if (typeof value === 'string' && value.startsWith('gid://')) {
    throw new Error('Customer ID must be numeric, not a Shopify GID. Use parseGidTail() to extract the numeric ID.');
  }
  
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error('Customer ID must be a positive integer');
    }
    return parsed;
  }
  
  if (typeof value === 'number') {
    if (value <= 0 || !Number.isInteger(value)) {
      throw new Error('Customer ID must be a positive integer');
    }
    return value;
  }
  
  throw new Error('Customer ID must be a number');
}