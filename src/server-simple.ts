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
            description: 'Retrieve subscription contracts for a Shopify customer by numeric customer ID',
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
            description: 'List upcoming billing attempts/orders for a subscription contract',
            inputSchema: {
              type: 'object',
              properties: {
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Numeric Appstle/Shopify Contract ID as required by top-orders?contractId=...'
                }
              },
              required: ['subscription_contract_id']
            }
          },
          {
            name: 'list_past_orders',
            description: 'List past billing attempts/orders for a subscription contract with pagination',
            inputSchema: {
              type: 'object',
              properties: {
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Numeric Contract ID for past-orders?contractId=...'
                },
                page: { type: 'integer', minimum: 0, default: 0 },
                size: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
                sort: { 
                  type: 'array', 
                  items: { type: 'string' }, 
                  default: ['id,desc'] 
                }
              },
              required: ['subscription_contract_id']
            }
          },
          {
            name: 'skip_upcoming_order_for_contract',
            description: 'Skip the next upcoming billing attempt for a subscription contract',
            inputSchema: {
              type: 'object',
              properties: {
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Numeric Contract ID to skip the next upcoming billing attempt.'
                }
              },
              required: ['subscription_contract_id']
            }
          },
          {
            name: 'skip_billing_attempt',
            description: 'Skip a specific billing attempt by ID',
            inputSchema: {
              type: 'object',
              properties: {
                billing_attempt_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Numeric billing attempt id from top-orders or past-orders.'
                },
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Optional contract id if your Appstle tenant requires it for this endpoint.'
                },
                is_prepaid: {
                  type: 'boolean',
                  default: false,
                  description: 'Optional flag for prepaid contracts supported by Appstle.'
                }
              },
              required: ['billing_attempt_id']
            }
          },
          {
            name: 'unskip_billing_attempt',
            description: 'Unskip a previously skipped billing attempt by ID',
            inputSchema: {
              type: 'object',
              properties: {
                billing_attempt_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Numeric billing attempt id to unskip.'
                },
                subscription_contract_id: {
                  type: 'integer',
                  minimum: 1,
                  description: 'Optional contract id if required by your Appstle tenant.'
                }
              },
              required: ['billing_attempt_id']
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