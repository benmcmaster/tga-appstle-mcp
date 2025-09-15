import { createAppstleClient } from './appstle.js';
import { createTools } from './tools.js';
import { logger } from './logger.js';

// Simple server that just exposes the tools without using McpServer class
export function createSimpleServer() {
  try {
    // Initialize Appstle client
    const appstleClient = createAppstleClient();
    const tools = createTools(appstleClient);

    logger.info('Simple MCP server created successfully', { 
      toolCount: 6,
    });

    return {
      tools,
      listTools: () => {
        return [
          {
            name: 'list_subscriptions_for_customer',
            description: 'STEP 1: Use this tool when customers ask about their subscription contracts, active subscriptions, or subscription status. Look for phrases like "my subscriptions", "what subscriptions do I have", "subscription status", "active plans", or "membership details". PREREQUISITE: You must have the customer\'s numeric Shopify Customer ID (not a GID). If missing, ask the customer to provide it. RETURNS: This tool returns subscription details including subscription_contract_id values needed for all other order management tools.',
            inputSchema: {
              type: 'object',
              properties: {
                shopify_customer_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Numeric Shopify Customer ID without gid:// prefix. Example: 987654321'
                },
                cursor: {
                  type: 'string',
                  description: 'Cursor string for paging subscription contracts returned from a previous call (pageInfo.endCursor).'
                }
              },
              required: ['shopify_customer_id']
            }
          },
          {
            name: 'list_upcoming_orders',
            description: 'STEP 2: Use this tool when customers ask about upcoming orders, next deliveries, or scheduled shipments. Look for phrases like "when is my next order", "upcoming deliveries", "next shipment", "future orders", or "what\'s coming next". PREREQUISITE: You must have subscription_contract_id from list_subscriptions_for_customer (STEP 1). If missing, call STEP 1 first. RETURNS: List of upcoming orders, each with an order_id field (use this for skip_order tool) and order details for customer confirmation.',
            inputSchema: {
              type: 'object',
              properties: {
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Subscription contract ID from list_subscriptions_for_customer response (subscription_contract_id field)'
                }
              },
              required: ['subscription_contract_id']
            }
          },
          {
            name: 'list_past_orders',
            description: 'STEP 2: Use this tool when customers ask about order history, past deliveries, or previous shipments. Look for phrases like "order history", "past orders", "previous deliveries", "what orders have been sent", or "delivery history". PREREQUISITE: You must have subscription_contract_id from list_subscriptions_for_customer (STEP 1). If missing, call STEP 1 first. RETURNS: List of past orders with order_id field (use this for unskip_order tool if order status is SKIPPED). Use pagination for large histories.',
            inputSchema: {
              type: 'object',
              properties: {
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Subscription contract ID from list_subscriptions_for_customer response (subscription_contract_id field)'
                },
                page: { 
                  type: 'integer', 
                  minimum: 0, 
                  default: 0,
                  description: 'Page number for pagination (0-based). Default: 0 (first page)'
                },
                size: { 
                  type: 'integer', 
                  minimum: 1, 
                  maximum: 100, 
                  default: 10,
                  description: 'Number of orders per page (1-100). Default: 10 orders'
                },
                sort: { 
                  type: 'array', 
                  items: { type: 'string' }, 
                  default: ['id,desc'],
                  description: 'Sort order. Default: ["id,desc"] for newest first'
                }
              },
              required: ['subscription_contract_id']
            }
          },
          {
            name: 'skip_upcoming_order_for_contract',
            description: 'STEP 3A: Use this tool when customers want to skip their NEXT upcoming order (without seeing the order details first). Look for phrases like "skip next order", "skip next delivery", "pause next shipment", "don\'t send next order", or "hold next delivery". IMPORTANT: Always confirm intent - ask "Are you sure you want to skip your next order on [date]?" PREREQUISITE: subscription_contract_id from STEP 1. ALTERNATIVE: If customer wants to see order details first, use list_upcoming_orders (STEP 2) then skip_order (STEP 3B). NEXT STEPS: Inform customer they can undo using unskip_order.',
            inputSchema: {
              type: 'object',
              properties: {
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Subscription contract ID from list_subscriptions_for_customer response (subscription_contract_id field)'
                }
              },
              required: ['subscription_contract_id']
            }
          },
          {
            name: 'skip_order',
            description: 'STEP 3B: Use this tool when customers want to skip a SPECIFIC order after seeing order details. Look for phrases like "skip this order", "cancel this delivery", "don\'t send order #123", or "skip the order on [date]". IMPORTANT: Always confirm intent - ask "Are you sure you want to skip the order scheduled for [date]?" PREREQUISITE: order_id from list_upcoming_orders or list_past_orders (STEP 2). Extract the "order_id" field from the order list response. NEXT STEPS: Inform customer they can reverse using unskip_order.',
            inputSchema: {
              type: 'object',
              properties: {
                order_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Order ID from upcoming/past orders list. NOTE: Use the "id" field from the API response, NOT the "billingAttemptId" field (which is always null).'
                },
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Optional: Subscription contract ID from list_subscriptions_for_customer (some Appstle tenants require this)'
                },
                is_prepaid: {
                  type: 'boolean',
                  default: false,
                  description: 'Optional flag for prepaid contracts supported by Appstle.'
                }
              },
              required: ['order_id']
            }
          },
          {
            name: 'unskip_order',
            description: 'STEP 4: Use this tool when customers want to restore a previously skipped order. Look for phrases like "unskip order", "restore skipped order", "undo skip", "bring back my order", "I changed my mind about skipping", or "reactivate cancelled order". IMPORTANT: Always confirm intent - ask "Are you sure you want to restore the order for [date]?" PREREQUISITE: order_id from a SKIPPED order (use list_past_orders or list_upcoming_orders to find orders with status=SKIPPED). Extract the "order_id" field. EDGE CASE: If order was already processed/shipped, unskipping may fail.',
            inputSchema: {
              type: 'object',
              properties: {
                order_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Order ID of the skipped order to restore. NOTE: Use the "id" field from the API response, NOT the "billingAttemptId" field (which is always null).'
                },
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Optional: Subscription contract ID from list_subscriptions_for_customer (some Appstle tenants require this)'
                }
              },
              required: ['order_id']
            }
          }
        ];
      }
    };

  } catch (error) {
    logger.error('Failed to create simple MCP server', { 
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Export server instance
export const simpleServer = createSimpleServer();