import { z } from 'zod';
import { AppstleClient, AppstleError } from './appstle.js';
import { logger } from './logger.js';
import {
  ListSubscriptionsForCustomerInputSchema,
  ListSubscriptionsForCustomerOutputSchema,
  ListUpcomingOrdersInputSchema,
  ListUpcomingOrdersOutputSchema,
  ListPastOrdersInputSchema,
  ListPastOrdersOutputSchema,
  SkipUpcomingOrderForContractInputSchema,
  SkipUpcomingOrderForContractOutputSchema,
  SkipOrderInputSchema,
  SkipOrderOutputSchema,
  UnskipOrderInputSchema,
  UnskipOrderOutputSchema,
} from './schemas.js';
import {
  toSubscriptionsSummary,
  toUpcomingOrders,
  toPastOrders,
  mapSkipResponse,
  validateNumericCustomerId,
} from './mapping.js';

// Tool handler type
type ToolHandler<TInput, TOutput> = (
  input: TInput,
  requestId: string
) => Promise<TOutput>;

// Create a validated tool handler
function createTool<TInput, TOutput>(
  inputSchema: z.ZodSchema<TInput>,
  outputSchema: z.ZodSchema<TOutput>,
  handler: ToolHandler<TInput, TOutput>
): (input: unknown, requestId: string) => Promise<TOutput> {
  return async (input: unknown, requestId: string): Promise<TOutput> => {
    try {
      // Validate input
      logger.debug('Validating input for tool', { requestId, rawInput: JSON.stringify(input) });
      const validatedInput = inputSchema.parse(input);
      logger.debug('Input validation successful', { requestId, validatedInput: JSON.stringify(validatedInput) });
      
      // Execute handler
      const result = await handler(validatedInput, requestId);
      
      // Validate output
      logger.debug('Validating output for tool', { requestId, rawOutput: JSON.stringify(result) });
      const validatedOutput = outputSchema.parse(result);
      logger.debug('Output validation successful', { requestId });
      
      return validatedOutput;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Schema validation error', { 
          requestId, 
          validationErrors: JSON.stringify(error.errors),
          rawInput: JSON.stringify(input)
        });
      }
      throw error;
    }
  };
}

// Tool implementations
// Note: We use "order" terminology in tool names and descriptions for customer-facing clarity,
// but these map to "billing attempts" in Appstle's backend API. A billing attempt represents
// a scheduled delivery/order in the subscription lifecycle.
export function createTools(appstleClient: AppstleClient) {
  const listSubscriptionsForCustomer = createTool(
    ListSubscriptionsForCustomerInputSchema,
    ListSubscriptionsForCustomerOutputSchema,
    async (input, requestId) => {
      logger.info('Listing subscriptions for customer', {
        requestId,
        tool: 'list_subscriptions_for_customer',
        customerId: input.shopify_customer_id,
        cursor: input.cursor,
      });

      try {
        validateNumericCustomerId(input.shopify_customer_id);
        
        const appstle = await appstleClient.getSubscriptionCustomer(
          input.shopify_customer_id,
          input.cursor,
          requestId
        );
        
        const result = toSubscriptionsSummary(appstle);
        
        logger.info('Successfully listed subscriptions', {
          requestId,
          tool: 'list_subscriptions_for_customer',
          customerId: input.shopify_customer_id,
          subscriptionCount: result.subscriptions.length,
          hasNextPage: result.page_info.has_next_page,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error listing subscriptions', {
            requestId,
            tool: 'list_subscriptions_for_customer',
            customerId: input.shopify_customer_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error listing subscriptions', {
          requestId,
          tool: 'list_subscriptions_for_customer',
          customerId: input.shopify_customer_id,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw new AppstleError(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error occurred',
          requestId
        );
      }
    }
  );

  const listUpcomingOrders = createTool(
    ListUpcomingOrdersInputSchema,
    ListUpcomingOrdersOutputSchema,
    async (input, requestId) => {
      logger.info('Listing upcoming orders', {
        requestId,
        tool: 'list_upcoming_orders',
        contractId: input.subscription_contract_id,
      });

      try {
        const appstle = await appstleClient.getTopOrders(
          input.subscription_contract_id,
          requestId
        );
        
        const result = { upcoming: toUpcomingOrders(appstle) };
        
        logger.info('Successfully listed upcoming orders', {
          requestId,
          tool: 'list_upcoming_orders',
          contractId: input.subscription_contract_id,
          orderCount: result.upcoming.length,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error listing upcoming orders', {
            requestId,
            tool: 'list_upcoming_orders',
            contractId: input.subscription_contract_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error listing upcoming orders', {
          requestId,
          tool: 'list_upcoming_orders',
          contractId: input.subscription_contract_id,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw new AppstleError(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error occurred',
          requestId
        );
      }
    }
  );

  const listPastOrders = createTool(
    ListPastOrdersInputSchema,
    ListPastOrdersOutputSchema,
    async (input, requestId) => {
      logger.info('Listing past orders', {
        requestId,
        tool: 'list_past_orders',
        contractId: input.subscription_contract_id,
        page: input.page,
        size: input.size,
        sort: input.sort,
        rawInput: JSON.stringify(input),
      });

      try {
        const appstle = await appstleClient.getPastOrders(
          input.subscription_contract_id,
          input.page,
          input.size,
          input.sort,
          requestId
        );
        
        // Log the raw API response for debugging
        logger.debug('Raw Appstle past orders response', {
          requestId,
          responseKeys: Object.keys(appstle),
          hasContent: !!appstle.content,
          contentLength: appstle.content?.length || 0,
          responseStructure: JSON.stringify(appstle, null, 2).substring(0, 500),
        });
        
        const result = toPastOrders(appstle);
        
        logger.info('Successfully listed past orders', {
          requestId,
          tool: 'list_past_orders',
          contractId: input.subscription_contract_id,
          page: result.page,
          size: result.size,
          orderCount: result.past.length,
          hasMore: result.has_more,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error listing past orders', {
            requestId,
            tool: 'list_past_orders',
            contractId: input.subscription_contract_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error listing past orders', {
          requestId,
          tool: 'list_past_orders',
          contractId: input.subscription_contract_id,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw new AppstleError(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error occurred',
          requestId
        );
      }
    }
  );

  const skipUpcomingOrderForContract = createTool(
    SkipUpcomingOrderForContractInputSchema,
    SkipUpcomingOrderForContractOutputSchema,
    async (input, requestId) => {
      logger.info('Skipping upcoming order for contract', {
        requestId,
        tool: 'skip_upcoming_order_for_contract',
        contractId: input.subscription_contract_id,
      });

      try {
        const appstle = await appstleClient.skipUpcomingOrderForContract(
          input.subscription_contract_id,
          requestId
        );
        
        const result = {
          skipped: true as const,
          ...mapSkipResponse(appstle, true),
        };
        
        logger.info('Successfully skipped upcoming order', {
          requestId,
          tool: 'skip_upcoming_order_for_contract',
          contractId: input.subscription_contract_id,
          orderId: result.order_id,
          billingDate: result.billing_date,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error skipping upcoming order', {
            requestId,
            tool: 'skip_upcoming_order_for_contract',
            contractId: input.subscription_contract_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error skipping upcoming order', {
          requestId,
          tool: 'skip_upcoming_order_for_contract',
          contractId: input.subscription_contract_id,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw new AppstleError(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error occurred',
          requestId
        );
      }
    }
  );

  // Skip a specific order (implemented as skipping a billing attempt in Appstle)
  const skipOrder = createTool(
    SkipOrderInputSchema,
    SkipOrderOutputSchema,
    async (input, requestId) => {
      logger.info('Skipping order', {
        requestId,
        tool: 'skip_order',
        orderId: input.order_id, // This is the 'id' field from Appstle API
        contractId: input.subscription_contract_id,
        isPrepaid: input.is_prepaid,
      });

      try {
        const appstle = await appstleClient.skipBillingAttempt(
          input.order_id, // Pass the order ID to the API (it expects the 'id' field)
          input.subscription_contract_id,
          input.is_prepaid,
          requestId
        );
        
        // Debug log the raw API response
        logger.debug('Raw Appstle skip response', {
          requestId,
          responseKeys: Object.keys(appstle || {}),
          responseStructure: JSON.stringify(appstle, null, 2),
        });
        
        const result = mapSkipResponse(appstle, true);
        
        logger.info('Successfully skipped order', {
          requestId,
          tool: 'skip_order',
          orderId: result.order_id,
          billingDate: result.billing_date,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error skipping order', {
            requestId,
            tool: 'skip_order',
            orderId: input.order_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error skipping order', {
          requestId,
          tool: 'skip_order',
          orderId: input.order_id,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw new AppstleError(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error occurred',
          requestId
        );
      }
    }
  );

  // Unskip a previously skipped order (implemented as unskipping a billing attempt in Appstle)
  const unskipOrder = createTool(
    UnskipOrderInputSchema,
    UnskipOrderOutputSchema,
    async (input, requestId) => {
      logger.info('Unskipping order', {
        requestId,
        tool: 'unskip_order',
        orderId: input.order_id, // This is the 'id' field from Appstle API
        contractId: input.subscription_contract_id,
      });

      try {
        const appstle = await appstleClient.unskipBillingAttempt(
          input.order_id, // Pass the order ID to the API (it expects the 'id' field)
          input.subscription_contract_id,
          requestId
        );
        
        // Debug log the raw API response
        logger.debug('Raw Appstle unskip response', {
          requestId,
          responseKeys: Object.keys(appstle || {}),
          responseStructure: JSON.stringify(appstle, null, 2),
        });
        
        // Temporary: return debug info instead of processing
        return {
          _debug_api_call: {
            url: `PUT /api/external/v2/subscription-billing-attempts/unskip-order/${input.order_id}`,
            full_url: `${process.env.APPSTLE_API_BASE || 'https://subscription-admin.appstle.com'}/api/external/v2/subscription-billing-attempts/unskip-order/${input.order_id}`,
            query_params_expected: input.subscription_contract_id ? { subscriptionContractId: input.subscription_contract_id.toString() } : {},
            headers_sent: {
              'X-API-Key': '***hidden***',
              'Content-Type': 'application/json',
              'Accept': '*/*'
            },
            input_received: {
              order_id: input.order_id,
              subscription_contract_id: input.subscription_contract_id,
              subscription_contract_id_type: typeof input.subscription_contract_id,
              subscription_contract_id_truthy: !!input.subscription_contract_id
            },
            api_response_empty: !appstle || Object.keys(appstle).length === 0,
            api_response_keys: Object.keys(appstle || {}),
            raw_response: appstle
          }
        } as any;
        
        const result = mapSkipResponse(appstle, false);
        
        logger.info('Successfully unskipped order', {
          requestId,
          tool: 'unskip_order',
          orderId: result.order_id,
          billingDate: result.billing_date,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error unskipping order', {
            requestId,
            tool: 'unskip_order',
            orderId: input.order_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error unskipping order', {
          requestId,
          tool: 'unskip_order',
          orderId: input.order_id,
          error: error instanceof Error ? error.message : String(error),
        });
        
        throw new AppstleError(
          500,
          'Internal Error',
          error instanceof Error ? error.message : 'Unknown error occurred',
          requestId
        );
      }
    }
  );

  return {
    list_subscriptions_for_customer: listSubscriptionsForCustomer,
    list_upcoming_orders: listUpcomingOrders,
    list_past_orders: listPastOrders,
    skip_upcoming_order_for_contract: skipUpcomingOrderForContract,
    skip_order: skipOrder,
    unskip_order: unskipOrder,
  };
}