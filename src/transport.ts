import { logger } from './logger.js';
import { AppstleError } from './appstle.js';

// MCP JSON-RPC message types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id?: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// HTTP transport for Vercel serverless functions
export class VercelMcpTransport {
  private tools: any;
  private sessionId?: string;

  constructor(simpleServer: any) {
    this.tools = simpleServer.tools;
  }

  // Handle HTTP POST request from MCP client
  async handleRequest(req: Request): Promise<Response> {
    const requestId = logger.generateRequestId();
    const startTime = Date.now();

    try {
      // Validate request method
      if (req.method !== 'POST') {
        logger.warn('Invalid HTTP method', { requestId, method: req.method });
        return this.createErrorResponse(405, 'Method Not Allowed', requestId);
      }

      // Validate Content-Type
      const contentType = req.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        logger.warn('Invalid content type', { requestId, contentType });
        return this.createErrorResponse(400, 'Content-Type must be application/json', requestId);
      }

      // Parse JSON body
      let body: unknown;
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch (parseError) {
        logger.error('Failed to parse JSON body', { 
          requestId, 
          error: parseError instanceof Error ? parseError.message : String(parseError)
        });
        return this.createJsonRpcErrorResponse(-32700, 'Parse error', requestId);
      }

      // Handle single request or batch
      if (Array.isArray(body)) {
        // Batch request
        logger.debug('Processing batch request', { requestId, batchSize: body.length });
        const responses = await Promise.all(
          body.map((req, index) => this.processJsonRpcRequest(req, `${requestId}_${index}`))
        );
        const validResponses = responses.filter(r => r !== null);
        
        if (validResponses.length === 0) {
          // All were notifications, return no content
          return new Response(null, { status: 204 });
        }
        
        return this.createJsonResponse(validResponses, requestId);
      } else {
        // Single request
        logger.debug('Processing single request', { requestId });
        const response = await this.processJsonRpcRequest(body, requestId);
        
        if (response === null) {
          // It was a notification, return no content
          return new Response(null, { status: 204 });
        }
        
        return this.createJsonResponse(response, requestId);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Transport error', { 
        requestId, 
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return this.createJsonRpcErrorResponse(-32603, 'Internal error', requestId);
    }
  }

  // Process a single JSON-RPC request
  private async processJsonRpcRequest(
    request: unknown, 
    requestId: string
  ): Promise<JsonRpcResponse | JsonRpcError | null> {
    try {
      // Validate JSON-RPC structure
      if (!this.isValidJsonRpcRequest(request)) {
        return {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: 'Request must be a valid JSON-RPC 2.0 object'
          }
        };
      }

      const req = request as JsonRpcRequest;
      
      logger.debug('Processing JSON-RPC request', { 
        requestId, 
        method: req.method,
        id: req.id,
        hasParams: !!req.params
      });

      // Handle MCP-specific methods
      switch (req.method) {
        case 'initialize':
          return await this.handleInitialize(req, requestId);
        
        case 'tools/list':
          return await this.handleToolsList(req, requestId);
        
        case 'tools/call':
          return await this.handleToolsCall(req, requestId);
        
        case 'notifications/initialized':
          // Notification - no response needed
          logger.debug('Received initialized notification', { requestId });
          return null;

        default:
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: {
              code: -32601,
              message: 'Method not found',
              data: `Method '${req.method}' is not supported`
            }
          };
      }

    } catch (error) {
      logger.error('Error processing JSON-RPC request', { 
        requestId, 
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        jsonrpc: '2.0',
        id: (request as any)?.id || null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Validate JSON-RPC request structure
  private isValidJsonRpcRequest(obj: unknown): obj is JsonRpcRequest {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'jsonrpc' in obj &&
      (obj as any).jsonrpc === '2.0' &&
      'method' in obj &&
      typeof (obj as any).method === 'string'
    );
  }

  // Handle initialize method
  private async handleInitialize(req: JsonRpcRequest, requestId: string): Promise<JsonRpcResponse> {
    const capabilities = {
      tools: {},
      resources: {},
      prompts: {},
      experimental: {},
      logging: {}
    };

    logger.info('MCP client initialized', { requestId });

    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        capabilities,
        serverInfo: {
          name: 'Appstle Subscription Management',
          version: '1.0.0',
          description: 'MCP server for managing Shopify subscription contracts via Appstle API. Provides tools to view, skip, and manage customer subscriptions and billing attempts.'
        }
      }
    };
  }

  // Handle tools/list method
  private async handleToolsList(req: JsonRpcRequest, requestId: string): Promise<JsonRpcResponse> {
    const toolDefinitions = [
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

    logger.info('Listed available tools', { requestId, toolCount: toolDefinitions.length });

    return {
      jsonrpc: '2.0',
      id: req.id,
      result: { tools: toolDefinitions }
    };
  }

  // Handle tools/call method
  private async handleToolsCall(req: JsonRpcRequest, requestId: string): Promise<JsonRpcResponse> {
    const params = req.params as { name: string; arguments?: Record<string, unknown> };
    
    if (!params?.name) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32602,
          message: 'Invalid params',
          data: 'Tool name is required'
        }
      };
    }

    logger.info('Calling tool', { 
      requestId, 
      toolName: params.name,
      hasArguments: !!params.arguments
    });

    try {
      // Get the tool implementation
      const toolFunction = this.tools[params.name];
      
      if (!toolFunction) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32601,
            message: 'Method not found',
            data: `Tool '${params.name}' not found`
          }
        };
      }

      // Call the tool
      const result = await toolFunction(params.arguments || {}, requestId);

      logger.info('Tool call completed successfully', { 
        requestId, 
        toolName: params.name
      });

      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };

    } catch (error) {
      logger.error('Tool call failed', { 
        requestId, 
        toolName: params.name,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Helper methods for creating responses
  private createJsonResponse(data: unknown, requestId: string): Response {
    const response = JSON.stringify(data);
    logger.debug('Sending JSON response', { requestId, responseLength: response.length });
    
    return new Response(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      }
    });
  }

  private createErrorResponse(status: number, message: string, requestId: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      }
    });
  }

  private createJsonRpcErrorResponse(code: number, message: string, requestId: string): Response {
    const errorResponse: JsonRpcError = {
      jsonrpc: '2.0',
      id: null,
      error: { code, message }
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 200, // JSON-RPC errors are still HTTP 200
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      }
    });
  }
}