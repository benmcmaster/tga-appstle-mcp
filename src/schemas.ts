import { z } from 'zod';

// Shared schemas
const ErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    title: z.string(),
    detail: z.string(),
    request_id: z.string().optional(),
  }),
});

// Next step guidance schema for helping Fin navigate workflows
const NextStepGuidanceSchema = z.object({
  ask_customer: z.string(),                    // Exact question to ask the customer
  show_options: z.boolean(),                   // Whether to show a list of options
  save_parameter: z.string(),                  // Which field value to save for next tool
  next_tool: z.string(),                       // Which tool to call next
  condition: z.string().optional(),            // When to use this guidance (SKIP_CUSTOMER_CHOICE, WAIT_FOR_CUSTOMER_CHOICE, ALWAYS_ASK)
});

// 1. list_subscriptions_for_customer schemas
export const ListSubscriptionsForCustomerInputSchema = z.object({
  shopify_customer_id: z.number().int().positive(),
  cursor: z.string().optional(),
});

const SubscriptionSchema = z.object({
  subscription_contract_id: z.number().int().positive(),
  subscription_contract_gid: z.string(),
  status: z.string(),
  plan_name: z.string(),
  next_billing_date: z.string().datetime(),
  items_summary: z.string().optional(),
  created_at: z.string().datetime().optional(),
  can_skip_orders: z.boolean(),
  upcoming_orders_count: z.number().int().min(0),
  suggested_next_action: z.string(),
  // Differentiation fields extracted from customAttributes
  subscription_number: z.number().int().positive(),
  protein_substitution: z.string().optional(),
  allergies: z.string().optional(),
  origin_order_name: z.string().optional(),
});

const PageInfoSchema = z.object({
  has_next_page: z.boolean(),
  end_cursor: z.string().optional(),
});

export const ListSubscriptionsForCustomerOutputSchema = z.object({
  subscriptions: z.array(SubscriptionSchema),
  page_info: PageInfoSchema,
  active_subscription_count: z.number().int().min(0),
  workflow_guidance: z.string(),
  next_step_guidance: NextStepGuidanceSchema,
});

// 2. list_upcoming_orders schemas
export const ListUpcomingOrdersInputSchema = z.object({
  subscription_contract_id: z.number().int().positive(),
});

const OrderItemSchema = z.object({
  title: z.string(),
  quantity: z.number().int().positive(),
});

const UpcomingOrderSchema = z.object({
  order_id: z.number().int().positive(), // This is the 'id' field from Appstle API, not 'billingAttemptId'
  billing_attempt_ref: z.string().optional(), // This is 'billingAttemptId' from API (usually null)
  shopify_order_id: z.number().int().optional(), // This is 'orderId' from API
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
  items: z.array(OrderItemSchema).optional(),
});

export const ListUpcomingOrdersOutputSchema = z.object({
  upcoming: z.array(UpcomingOrderSchema),
  next_step_guidance: NextStepGuidanceSchema,
});

// 3. list_past_orders schemas
export const ListPastOrdersInputSchema = z.object({
  subscription_contract_id: z.number().int().positive(),
  page: z.number().int().min(0).default(0),
  size: z.number().int().default(10), // Remove min validation here, handle in transform
  sort: z.array(z.string()).default(['id,desc']),
}).transform((data) => ({
  ...data,
  // Ensure size is valid (between 1-100)
  size: Math.max(1, Math.min(100, data.size || 10)),
  page: Math.max(0, data.page || 0),
}));

const PastOrderSchema = z.object({
  order_id: z.number().int().positive(), // This is the 'id' field from Appstle API, not 'billingAttemptId'
  billing_attempt_ref: z.string().optional(), // This is 'billingAttemptId' from API (usually null)
  shopify_order_id: z.number().int().optional(), // This is 'orderId' from API
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
});

export const ListPastOrdersOutputSchema = z.object({
  past: z.array(PastOrderSchema),
  page: z.number().int().min(0),
  size: z.number().int(), // Removed min validation - size can be 0 if no results
  has_more: z.boolean(),
});

// 4. skip_order schemas
export const SkipOrderInputSchema = z.object({
  order_id: z.number().int().positive(), // This is the 'id' field from top-orders/past-orders
  subscription_contract_id: z.number().int().positive().optional(),
  is_prepaid: z.boolean().default(false),
});

export const SkipOrderOutputSchema = z.object({
  order_id: z.number().int().positive(), // This is the 'id' field from Appstle API
  billing_attempt_ref: z.string().optional(), // This is 'billingAttemptId' from API
  shopify_order_id: z.number().int().optional(), // This is 'orderId' from API
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
  message: z.string().default('Order skipped'),
  next_step_guidance: NextStepGuidanceSchema,
});

// Export error schema and guidance schema
export { ErrorSchema, NextStepGuidanceSchema };

// TypeScript types
export type ListSubscriptionsForCustomerInput = z.infer<typeof ListSubscriptionsForCustomerInputSchema>;
export type ListSubscriptionsForCustomerOutput = z.infer<typeof ListSubscriptionsForCustomerOutputSchema>;

export type ListUpcomingOrdersInput = z.infer<typeof ListUpcomingOrdersInputSchema>;
export type ListUpcomingOrdersOutput = z.infer<typeof ListUpcomingOrdersOutputSchema>;

export type ListPastOrdersInput = z.infer<typeof ListPastOrdersInputSchema>;
export type ListPastOrdersOutput = z.infer<typeof ListPastOrdersOutputSchema>;

export type SkipOrderInput = z.infer<typeof SkipOrderInputSchema>;
export type SkipOrderOutput = z.infer<typeof SkipOrderOutputSchema>;

export type ErrorOutput = z.infer<typeof ErrorSchema>;

// Guidance and workflow types
export type NextStepGuidance = z.infer<typeof NextStepGuidanceSchema>;

// Subscription item for internal use
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type UpcomingOrder = z.infer<typeof UpcomingOrderSchema>;
export type PastOrder = z.infer<typeof PastOrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type PageInfo = z.infer<typeof PageInfoSchema>;