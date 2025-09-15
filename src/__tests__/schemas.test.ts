import { describe, test, expect } from 'vitest';
import {
  ListSubscriptionsForCustomerInputSchema,
  ListUpcomingOrdersInputSchema,
  SkipOrderInputSchema,
  ListSubscriptionsForCustomerOutputSchema,
} from '../schemas.js';

describe('schema validation', () => {
  describe('ListSubscriptionsForCustomerInputSchema', () => {
    test('should validate valid input', () => {
      const validInput = {
        shopify_customer_id: 123456789,
        cursor: 'abc123'
      };

      const result = ListSubscriptionsForCustomerInputSchema.parse(validInput);
      expect(result).toEqual(validInput);
    });

    test('should validate required fields only', () => {
      const minimalInput = {
        shopify_customer_id: 123456789
      };

      const result = ListSubscriptionsForCustomerInputSchema.parse(minimalInput);
      expect(result).toEqual(minimalInput);
    });

    test('should reject invalid customer ID', () => {
      expect(() => {
        ListSubscriptionsForCustomerInputSchema.parse({
          shopify_customer_id: 0
        });
      }).toThrow();

      expect(() => {
        ListSubscriptionsForCustomerInputSchema.parse({
          shopify_customer_id: -1
        });
      }).toThrow();

      expect(() => {
        ListSubscriptionsForCustomerInputSchema.parse({
          shopify_customer_id: 'not-a-number'
        });
      }).toThrow();
    });
  });

  describe('ListUpcomingOrdersInputSchema', () => {
    test('should validate valid contract ID', () => {
      const validInput = {
        subscription_contract_id: 987654321
      };

      const result = ListUpcomingOrdersInputSchema.parse(validInput);
      expect(result).toEqual(validInput);
    });

    test('should reject invalid contract ID', () => {
      expect(() => {
        ListUpcomingOrdersInputSchema.parse({
          subscription_contract_id: 0
        });
      }).toThrow();
    });
  });

  describe('SkipOrderInputSchema', () => {
    test('should validate with all optional fields', () => {
      const validInput = {
        order_id: 123456, // This is the 'id' field from Appstle API
        subscription_contract_id: 789012,
        is_prepaid: true
      };

      const result = SkipOrderInputSchema.parse(validInput);
      expect(result).toEqual(validInput);
    });

    test('should apply default for is_prepaid', () => {
      const input = {
        order_id: 123456 // This is the 'id' field from Appstle API
      };

      const result = SkipOrderInputSchema.parse(input);
      expect(result).toEqual({
        order_id: 123456,
        is_prepaid: false
      });
    });
  });

  describe('ListSubscriptionsForCustomerOutputSchema', () => {
    test('should validate valid output', () => {
      const validOutput = {
        subscriptions: [
          {
            subscription_contract_id: 123456789,
            subscription_contract_gid: 'gid://shopify/SubscriptionContract/123456789',
            status: 'ACTIVE',
            plan_name: 'Weekly Plan',
            next_billing_date: '2025-01-15T10:00:00Z',
            items_summary: 'Premium Dog Food',
            created_at: '2024-12-01T10:00:00Z',
            can_skip_orders: true,
            upcoming_orders_count: 1,
            suggested_next_action: 'Call list_upcoming_orders with subscription_contract_id: 123456789'
          }
        ],
        page_info: {
          has_next_page: false,
          end_cursor: 'cursor123'
        },
        active_subscription_count: 1,
        workflow_guidance: 'Customer has 1 active subscription'
      };

      const result = ListSubscriptionsForCustomerOutputSchema.parse(validOutput);
      expect(result).toEqual(validOutput);
    });

    test('should validate minimal output', () => {
      const minimalOutput = {
        subscriptions: [
          {
            subscription_contract_id: 123456789,
            subscription_contract_gid: 'gid://shopify/SubscriptionContract/123456789',
            status: 'ACTIVE',
            plan_name: 'Weekly Plan',
            next_billing_date: '2025-01-15T10:00:00Z',
            can_skip_orders: true,
            upcoming_orders_count: 0,
            suggested_next_action: 'Call list_upcoming_orders with subscription_contract_id: 123456789'
          }
        ],
        page_info: {
          has_next_page: false
        },
        active_subscription_count: 1,
        workflow_guidance: 'Customer has 1 active subscription'
      };

      const result = ListSubscriptionsForCustomerOutputSchema.parse(minimalOutput);
      expect(result).toEqual(minimalOutput);
    });

    test('should reject invalid datetime format', () => {
      expect(() => {
        ListSubscriptionsForCustomerOutputSchema.parse({
          subscriptions: [
            {
              subscription_contract_id: 123456789,
              subscription_contract_gid: 'gid://shopify/SubscriptionContract/123456789',
              status: 'ACTIVE',
              plan_name: 'Weekly Plan',
              next_billing_date: 'invalid-date'
            }
          ],
          page_info: {
            has_next_page: false
          }
        });
      }).toThrow();
    });
  });
});