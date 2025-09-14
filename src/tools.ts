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
  SkipBillingAttemptInputSchema,
  SkipBillingAttemptOutputSchema,
  UnskipBillingAttemptInputSchema,
  UnskipBillingAttemptOutputSchema,
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
    // Validate input
    const validatedInput = inputSchema.parse(input);
    
    // Execute handler
    const result = await handler(validatedInput, requestId);
    
    // Validate output
    return outputSchema.parse(result);
  };
}

// Tool implementations
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
      });

      try {
        const appstle = await appstleClient.getPastOrders(
          input.subscription_contract_id,
          input.page,
          input.size,
          input.sort,
          requestId
        );
        
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
          billingAttemptId: result.billing_attempt_id,
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

  const skipBillingAttempt = createTool(
    SkipBillingAttemptInputSchema,
    SkipBillingAttemptOutputSchema,
    async (input, requestId) => {
      logger.info('Skipping billing attempt', {
        requestId,
        tool: 'skip_billing_attempt',
        billingAttemptId: input.billing_attempt_id,
        contractId: input.subscription_contract_id,
        isPrepaid: input.is_prepaid,
      });

      try {
        const appstle = await appstleClient.skipBillingAttempt(
          input.billing_attempt_id,
          input.subscription_contract_id,
          input.is_prepaid,
          requestId
        );
        
        const result = mapSkipResponse(appstle, true);
        
        logger.info('Successfully skipped billing attempt', {
          requestId,
          tool: 'skip_billing_attempt',
          billingAttemptId: result.billing_attempt_id,
          billingDate: result.billing_date,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error skipping billing attempt', {
            requestId,
            tool: 'skip_billing_attempt',
            billingAttemptId: input.billing_attempt_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error skipping billing attempt', {
          requestId,
          tool: 'skip_billing_attempt',
          billingAttemptId: input.billing_attempt_id,
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

  const unskipBillingAttempt = createTool(
    UnskipBillingAttemptInputSchema,
    UnskipBillingAttemptOutputSchema,
    async (input, requestId) => {
      logger.info('Unskipping billing attempt', {
        requestId,
        tool: 'unskip_billing_attempt',
        billingAttemptId: input.billing_attempt_id,
        contractId: input.subscription_contract_id,
      });

      try {
        const appstle = await appstleClient.unskipBillingAttempt(
          input.billing_attempt_id,
          input.subscription_contract_id,
          requestId
        );
        
        const result = mapSkipResponse(appstle, false);
        
        logger.info('Successfully unskipped billing attempt', {
          requestId,
          tool: 'unskip_billing_attempt',
          billingAttemptId: result.billing_attempt_id,
          billingDate: result.billing_date,
        });
        
        return result;
      } catch (error) {
        if (error instanceof AppstleError) {
          logger.error('Appstle API error unskipping billing attempt', {
            requestId,
            tool: 'unskip_billing_attempt',
            billingAttemptId: input.billing_attempt_id,
            statusCode: error.statusCode,
            title: error.title,
          });
          throw error;
        }
        
        logger.error('Unexpected error unskipping billing attempt', {
          requestId,
          tool: 'unskip_billing_attempt',
          billingAttemptId: input.billing_attempt_id,
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
    skip_billing_attempt: skipBillingAttempt,
    unskip_billing_attempt: unskipBillingAttempt,
  };
}