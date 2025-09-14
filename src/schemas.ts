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
});

const PageInfoSchema = z.object({
  has_next_page: z.boolean(),
  end_cursor: z.string().optional(),
});

export const ListSubscriptionsForCustomerOutputSchema = z.object({
  subscriptions: z.array(SubscriptionSchema),
  page_info: PageInfoSchema,
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
  billing_attempt_id: z.number().int().positive(),
  billing_attempt_ref: z.string().optional(),
  order_id: z.number().int().optional(),
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
  items: z.array(OrderItemSchema).optional(),
});

export const ListUpcomingOrdersOutputSchema = z.object({
  upcoming: z.array(UpcomingOrderSchema),
});

// 3. list_past_orders schemas
export const ListPastOrdersInputSchema = z.object({
  subscription_contract_id: z.number().int().positive(),
  page: z.number().int().min(0).default(0),
  size: z.number().int().min(1).max(100).default(10),
  sort: z.array(z.string()).default(['id,desc']),
});

const PastOrderSchema = z.object({
  billing_attempt_id: z.number().int().positive(),
  billing_attempt_ref: z.string().optional(),
  order_id: z.number().int().optional(),
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
});

export const ListPastOrdersOutputSchema = z.object({
  past: z.array(PastOrderSchema),
  page: z.number().int().min(0),
  size: z.number().int().min(1),
  has_more: z.boolean(),
});

// 4. skip_upcoming_order_for_contract schemas
export const SkipUpcomingOrderForContractInputSchema = z.object({
  subscription_contract_id: z.number().int().positive(),
});

export const SkipUpcomingOrderForContractOutputSchema = z.object({
  skipped: z.literal(true),
  billing_attempt_id: z.number().int().positive(),
  billing_attempt_ref: z.string().optional(),
  order_id: z.number().int().optional(),
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
  message: z.string().optional(),
});

// 5. skip_billing_attempt schemas
export const SkipBillingAttemptInputSchema = z.object({
  billing_attempt_id: z.number().int().positive(),
  subscription_contract_id: z.number().int().positive().optional(),
  is_prepaid: z.boolean().default(false).optional(),
});

export const SkipBillingAttemptOutputSchema = z.object({
  billing_attempt_id: z.number().int().positive(),
  billing_attempt_ref: z.string().optional(),
  order_id: z.number().int().optional(),
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
  message: z.string().default('Order skipped'),
});

// 6. unskip_billing_attempt schemas
export const UnskipBillingAttemptInputSchema = z.object({
  billing_attempt_id: z.number().int().positive(),
  subscription_contract_id: z.number().int().positive().optional(),
});

export const UnskipBillingAttemptOutputSchema = z.object({
  billing_attempt_id: z.number().int().positive(),
  billing_attempt_ref: z.string().optional(),
  order_id: z.number().int().optional(),
  order_name: z.string().optional(),
  billing_date: z.string().datetime(),
  status: z.string(),
  message: z.string().default('Order unskipped'),
});

// Export error schema
export { ErrorSchema };

// TypeScript types
export type ListSubscriptionsForCustomerInput = z.infer<typeof ListSubscriptionsForCustomerInputSchema>;
export type ListSubscriptionsForCustomerOutput = z.infer<typeof ListSubscriptionsForCustomerOutputSchema>;

export type ListUpcomingOrdersInput = z.infer<typeof ListUpcomingOrdersInputSchema>;
export type ListUpcomingOrdersOutput = z.infer<typeof ListUpcomingOrdersOutputSchema>;

export type ListPastOrdersInput = z.infer<typeof ListPastOrdersInputSchema>;
export type ListPastOrdersOutput = z.infer<typeof ListPastOrdersOutputSchema>;

export type SkipUpcomingOrderForContractInput = z.infer<typeof SkipUpcomingOrderForContractInputSchema>;
export type SkipUpcomingOrderForContractOutput = z.infer<typeof SkipUpcomingOrderForContractOutputSchema>;

export type SkipBillingAttemptInput = z.infer<typeof SkipBillingAttemptInputSchema>;
export type SkipBillingAttemptOutput = z.infer<typeof SkipBillingAttemptOutputSchema>;

export type UnskipBillingAttemptInput = z.infer<typeof UnskipBillingAttemptInputSchema>;
export type UnskipBillingAttemptOutput = z.infer<typeof UnskipBillingAttemptOutputSchema>;

export type ErrorOutput = z.infer<typeof ErrorSchema>;

// Subscription item for internal use
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type UpcomingOrder = z.infer<typeof UpcomingOrderSchema>;
export type PastOrder = z.infer<typeof PastOrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type PageInfo = z.infer<typeof PageInfoSchema>;