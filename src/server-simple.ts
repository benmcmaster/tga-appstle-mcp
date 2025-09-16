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
      toolCount: 4,
    });

    return {
      tools,
      listTools: () => {
        return [
          {
            name: 'list_subscriptions_for_customer',
            description: 'STEP 1 of skip workflow: Gets all customer subscriptions. Use when customers mention: "skip delivery", "pause order", "hold shipment", "subscription status", or "my subscriptions". CRITICAL WORKFLOW: Check the response\'s next_step_guidance field! IF condition=SKIP_CUSTOMER_CHOICE (1 subscription): Proceed directly to list_upcoming_orders using the subscription_contract_id. IF condition=WAIT_FOR_CUSTOMER_CHOICE (multiple subscriptions): ASK customer "Which subscription would you like to manage?" and show subscription plan names. Wait for their response before proceeding. PREREQUISITE: Numeric Shopify Customer ID (not GID). SAVES: subscription_contract_id for next step.',
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
            description: 'STEP 2 of skip workflow: Gets upcoming deliveries for a subscription. Use after list_subscriptions_for_customer when you have a subscription_contract_id. WORKFLOW: Check the response\'s next_step_guidance field! The guidance will ALWAYS say condition=ALWAYS_ASK. You MUST ASK the customer "Which delivery date would you like to skip?" and show them the list of upcoming delivery dates from the response. SAVES: order_id from the customer\'s chosen date for use in skip_order. PREREQUISITE: subscription_contract_id from STEP 1.',
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
            description: 'Use this tool when customers ask about order history, past deliveries, or previous shipments. Look for phrases like "order history", "past orders", "previous deliveries", "what orders have been sent", or "delivery history". Shows previous orders including skipped ones for viewing only. PREREQUISITE: subscription_contract_id from list_subscriptions_for_customer. NOTE: To restore a skipped delivery, direct customer to their portal at account.thegourmetanimal.com where they can easily unskip from the History tab.',
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
                  maximum: 100, 
                  default: 10,
                  description: 'Number of orders per page (1-100). Default: 10 orders. Invalid values will be corrected automatically.'
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
            name: 'skip_order',
            description: 'STEP 3 of skip workflow: Executes the skip delivery. Use after list_upcoming_orders when customer selects a date to skip. CRITICAL WORKFLOW: 1) You MUST have fresh order_id from list_upcoming_orders response (Step 2), 2) You MUST CONFIRM with customer before executing: "Shall I skip your delivery on [date]?", 3) Only proceed after customer says yes/confirm/correct. IMPORTANT: Use the exact order_id from the customer\'s selected date in Step 2. Include subscription_contract_id for reliability. FINAL STEP: Inform customer the skip was successful and they can undo it if needed.',
            inputSchema: {
              type: 'object',
              properties: {
                order_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Order ID from customer\'s selected date in list_upcoming_orders response. Use the exact order_id that corresponds to the date they chose.'
                },
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Subscription contract ID from Step 1 (list_subscriptions_for_customer). Include for reliability.'
                },
                is_prepaid: {
                  type: 'boolean',
                  default: false,
                  description: 'Optional flag for prepaid contracts supported by Appstle.'
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