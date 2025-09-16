import type { 
  Subscription, 
  UpcomingOrder, 
  PastOrder, 
  OrderItem,
  PageInfo,
  NextStepGuidance
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
              customAttributes?: Array<{
                key: string;
                value: string;
              }>;
            };
          }>;
        };
        originOrder?: {
          name: string;
        };
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string;
    };
  };
}): { subscriptions: Subscription[]; page_info: PageInfo; active_subscription_count: number; workflow_guidance: string; next_step_guidance: NextStepGuidance } {
  // Filter to only active subscriptions
  const activeEdges = appstle.subscriptionContracts.edges.filter(edge => 
    edge.node.status === 'ACTIVE'
  );

  const subscriptions: Subscription[] = activeEdges.map((edge, index) => {
    const node = edge.node;
    const contractId = parseGidTail(node.id);
    
    // Build plan name from delivery policy
    let planName = 'Subscription';
    if (node.deliveryPolicy) {
      const { interval, intervalCount } = node.deliveryPolicy;
      planName = `${intervalCount} ${interval}${intervalCount > 1 ? 's' : ''}`;
    }
    
    // Extract customAttributes from the first line (all lines should have same attributes)
    let proteinSubstitution: string | undefined;
    let allergies: string | undefined;
    let originOrderName: string | undefined;
    
    if (node.lines?.edges.length && node.lines.edges[0]?.node?.customAttributes) {
      const customAttrs = node.lines.edges[0].node.customAttributes;
      proteinSubstitution = customAttrs.find(attr => attr.key === 'Protein Substitution')?.value;
      allergies = customAttrs.find(attr => attr.key === 'Allergies')?.value;
    }
    
    if (node.originOrder?.name) {
      originOrderName = node.originOrder.name;
    }
    
    // Build items summary with preferences
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
      
      // Add preferences to items summary for differentiation
      if (proteinSubstitution || allergies) {
        const preferences = [];
        if (proteinSubstitution) preferences.push(`No ${proteinSubstitution}`);
        if (allergies) preferences.push(`Allergies: ${allergies}`);
        itemsSummary += ` | ${preferences.join(' | ')}`;
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
      can_skip_orders: true, // All active subscriptions can skip orders
      upcoming_orders_count: 1, // Estimate - active subscriptions typically have at least 1 upcoming order
      suggested_next_action: `Call list_upcoming_orders with subscription_contract_id: ${contractId} to see upcoming orders for this subscription`,
      // Differentiation fields
      subscription_number: index + 1,
      protein_substitution: proteinSubstitution,
      allergies: allergies,
      origin_order_name: originOrderName,
    };
  });

  const activeCount = subscriptions.length;
  
  // Generate workflow guidance based on number of active subscriptions
  let workflowGuidance: string;
  let next_step_guidance: NextStepGuidance;
  
  if (activeCount === 0) {
    workflowGuidance = "No active subscriptions found. Customer cannot skip orders.";
    next_step_guidance = {
      ask_customer: "You don't have any active subscriptions to manage.",
      show_options: false,
      save_parameter: "none",
      next_tool: "none"
    };
  } else if (activeCount === 1) {
    workflowGuidance = `Customer has 1 active subscription. To skip an order: call list_upcoming_orders with subscription_contract_id: ${subscriptions[0].subscription_contract_id}, then ask customer which order to skip, then call skip_order.`;
    next_step_guidance = {
      ask_customer: "I found your subscription. Let me check your upcoming deliveries.",
      show_options: false,
      save_parameter: "subscription_contract_id",
      next_tool: "list_upcoming_orders",
      condition: "SKIP_CUSTOMER_CHOICE"
    };
  } else {
    // Build differentiation summary for multiple subscriptions
    const subscriptionSummaries = subscriptions.map(sub => {
      const preferences = [];
      if (sub.protein_substitution) preferences.push(`No ${sub.protein_substitution}`);
      if (sub.allergies) preferences.push(`${sub.allergies}`);
      const prefStr = preferences.length ? ` (${preferences.join(', ')})` : '';
      return `${sub.subscription_number}. Subscription ID ${sub.subscription_contract_id}${prefStr}`;
    }).join('\n');
    
    workflowGuidance = `Customer has ${activeCount} active subscriptions. Ask customer which subscription they want to skip orders for, then call list_upcoming_orders with the chosen subscription_contract_id.`;
    next_step_guidance = {
      ask_customer: `Which subscription would you like to manage? Please select by number:\n\n${subscriptionSummaries}\n\nReply with the number (1, 2, 3, etc.) and I'll check that subscription's upcoming deliveries.`,
      show_options: true,
      save_parameter: "subscription_contract_id",
      next_tool: "list_upcoming_orders",
      condition: "WAIT_FOR_CUSTOMER_CHOICE"
    };
  }

  return {
    subscriptions,
    page_info: {
      has_next_page: appstle.subscriptionContracts.pageInfo.hasNextPage,
      end_cursor: appstle.subscriptionContracts.pageInfo.endCursor,
    },
    active_subscription_count: activeCount,
    workflow_guidance: workflowGuidance,
    next_step_guidance: next_step_guidance,
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

// Helper function to format date for customer display
function formatDateForCustomer(dateString: string): string {
  try {
    const date = new Date(dateString);
    // Format as "September 20, 2025" 
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } catch {
    // Fallback to original string if parsing fails
    return dateString;
  }
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
}>): { upcoming: UpcomingOrder[]; next_step_guidance: NextStepGuidance; selection_map: Array<{ selection_number: number; order_id: number; billing_date: string }> } {
  const upcoming = appstle
    .filter(attempt => attempt.id != null) // Filter out orders without valid IDs
    .map(attempt => mapBillingAttempt(attempt) as UpcomingOrder);
    
  // Build selection map for numbered choices
  const selection_map = upcoming.map((order, index) => ({
    selection_number: index + 1,
    order_id: order.order_id,
    billing_date: order.billing_date
  }));
  
  // Build numbered selection prompt for customer
  const selectionOptions = upcoming.map((order, index) => 
    `${index + 1}. ${formatDateForCustomer(order.billing_date)} (Order ID: ${order.order_id})`
  ).join('\n');
  
  const next_step_guidance: NextStepGuidance = {
    ask_customer: `Which delivery would you like to skip? Please select by number:\n\n${selectionOptions}\n\nReply with the number (1, 2, 3, etc.) and I'll skip that specific order.`,
    show_options: true,
    save_parameter: "order_id",
    next_tool: "skip_order",
    condition: "ALWAYS_ASK"
  };
  
  return {
    upcoming,
    next_step_guidance,
    selection_map
  };
}

// Transform Appstle past-orders response
export function toPastOrders(appstle: any): { past: PastOrder[]; page: number; size: number; has_more: boolean } {
  // Handle two possible response formats:
  // 1. Paginated object: {content: [...], totalElements: N, size: 10, number: 0}
  // 2. Direct array: [item1, item2, item3]
  
  let content: Array<any> = [];
  let totalElements = 0;
  let size = 0;
  let pageNumber = 0;
  
  if (Array.isArray(appstle)) {
    // Format 2: Direct array response
    content = appstle;
    totalElements = appstle.length;
    size = appstle.length;
    pageNumber = 0;
  } else if (appstle && typeof appstle === 'object') {
    // Format 1: Paginated object response
    content = appstle.content || [];
    totalElements = appstle.totalElements || content.length;
    size = appstle.size || content.length;
    pageNumber = appstle.number || 0;
  }
  
  const past = content
    .filter(attempt => attempt.id != null) // Filter out orders without valid IDs
    .map(attempt => mapBillingAttempt(attempt) as PastOrder);
  
  return {
    past,
    page: pageNumber,
    size: size,
    has_more: false, // For direct array format, we can't determine if there are more pages
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
  next_step_guidance: NextStepGuidance;
} {
  const next_step_guidance: NextStepGuidance = {
    ask_customer: isSkip 
      ? "Your delivery has been successfully skipped. To restore it later, visit account.thegourmetanimal.com → Manage Subscription → select your subscription → See more details → History tab to unskip."
      : "Your delivery has been successfully restored.",
    show_options: false,
    save_parameter: "none",
    next_tool: "workflow_complete",
    condition: "COMPLETE"
  };

  return {
    order_id: appstle.id, // The main ID (not billingAttemptId!)
    billing_attempt_ref: appstle.billingAttemptId || undefined,
    shopify_order_id: appstle.orderId || undefined,
    order_name: appstle.orderName || undefined,
    billing_date: appstle.billingDate,
    status: appstle.status,
    message: isSkip ? 'Order skipped' : 'Order unskipped',
    next_step_guidance: next_step_guidance,
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