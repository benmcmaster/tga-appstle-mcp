import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createAppstleClient } from './appstle.js';
import { createTools } from './tools.js';
import { logger } from './logger.js';
import { AppstleError } from './appstle.js';
import { z } from 'zod';

// Server configuration
interface ServerConfig {
  name: string;
  version: string;
}

// Create and configure the MCP server
export function createMcpServer(config: ServerConfig = { name: 'appstle-mcp-server', version: '1.0.0' }): McpServer {
  const server = new McpServer(config);

  try {
    // Initialize Appstle client
    const appstleClient = createAppstleClient();
    const tools = createTools(appstleClient);

    // Register tool: list_subscriptions_for_customer
    server.addTool({
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
    }, async (args) => {
      const requestId = logger.generateRequestId();
      try {
        return await tools.list_subscriptions_for_customer(args, requestId);
      } catch (error) {
        if (error instanceof AppstleError) {
          throw error.toErrorOutput();
        }
        throw error;
      }
    });

    // Register tool: list_upcoming_orders
    server.addTool({
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
    }, async (args) => {
      const requestId = logger.generateRequestId();
      try {
        return await tools.list_upcoming_orders(args, requestId);
      } catch (error) {
        if (error instanceof AppstleError) {
          throw error.toErrorOutput();
        }
        throw error;
      }
    });

    // Register tool: list_past_orders
    server.addTool({
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
          page: {
            type: 'integer',
            minimum: 0,
            default: 0,
            description: 'Page number (0-based)'
          },
          size: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 10,
            description: 'Number of results per page'
          },
          sort: {
            type: 'array',
            items: { type: 'string' },
            default: ['id,desc'],
            description: 'Sort strings as expected by Appstle, for example id,desc'
          }
        },
        required: ['subscription_contract_id']
      }
    }, async (args) => {
      const requestId = logger.generateRequestId();
      try {
        return await tools.list_past_orders(args, requestId);
      } catch (error) {
        if (error instanceof AppstleError) {
          throw error.toErrorOutput();
        }
        throw error;
      }
    });

    // Register tool: skip_upcoming_order_for_contract
    server.addTool({
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
    }, async (args) => {
      const requestId = logger.generateRequestId();
      try {
        return await tools.skip_upcoming_order_for_contract(args, requestId);
      } catch (error) {
        if (error instanceof AppstleError) {
          throw error.toErrorOutput();
        }
        throw error;
      }
    });

    // Register tool: skip_billing_attempt
    server.addTool({
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
    }, async (args) => {
      const requestId = logger.generateRequestId();
      try {
        return await tools.skip_billing_attempt(args, requestId);
      } catch (error) {
        if (error instanceof AppstleError) {
          throw error.toErrorOutput();
        }
        throw error;
      }
    });

    // Register tool: unskip_billing_attempt
    server.addTool({
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
    }, async (args) => {
      const requestId = logger.generateRequestId();
      try {
        return await tools.unskip_billing_attempt(args, requestId);
      } catch (error) {
        if (error instanceof AppstleError) {
          throw error.toErrorOutput();
        }
        throw error;
      }
    });

    logger.info('MCP server created successfully', { 
      toolCount: 6,
      serverName: config.name,
      serverVersion: config.version
    });

    return server;

  } catch (error) {
    logger.error('Failed to create MCP server', { 
      error: error instanceof Error ? error.message : String(error),
      serverName: config.name
    });
    throw error;
  }
}

// Export server instance for testing
export const server = createMcpServer();