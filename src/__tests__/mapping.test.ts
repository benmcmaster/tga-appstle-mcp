import { describe, test, expect } from 'vitest';
import {
  parseGidTail,
  buildPageableQuery,
  validateNumericCustomerId,
  toSubscriptionsSummary,
  mapBillingAttempt,
} from '../mapping.js';

describe('mapping utilities', () => {
  describe('parseGidTail', () => {
    test('should parse numeric ID from Shopify GID', () => {
      expect(parseGidTail('gid://shopify/SubscriptionContract/123456789')).toBe(123456789);
      expect(parseGidTail('gid://shopify/Customer/987654321')).toBe(987654321);
    });

    test('should throw error for invalid GID format', () => {
      expect(() => parseGidTail('invalid-gid')).toThrow('Invalid Shopify GID format');
      expect(() => parseGidTail('gid://shopify/Contract/')).toThrow('Invalid Shopify GID format');
    });
  });

  describe('buildPageableQuery', () => {
    test('should build correct pageable query parameters', () => {
      const params = {
        page: 1,
        size: 20,
        sort: ['id,desc', 'createdAt,asc']
      };
      
      const query = buildPageableQuery(params);
      
      expect(query).toEqual({
        'pageable.page': '1',
        'pageable.size': '20',
        'pageable.sort': 'id,desc,createdAt,asc'
      });
    });
  });

  describe('validateNumericCustomerId', () => {
    test('should accept valid numeric IDs', () => {
      expect(validateNumericCustomerId(123456)).toBe(123456);
      expect(validateNumericCustomerId('789012')).toBe(789012);
    });

    test('should reject GID format', () => {
      expect(() => validateNumericCustomerId('gid://shopify/Customer/123')).toThrow(
        'Customer ID must be numeric, not a Shopify GID'
      );
    });

    test('should reject invalid values', () => {
      expect(() => validateNumericCustomerId(0)).toThrow('Customer ID must be a positive integer');
      expect(() => validateNumericCustomerId(-1)).toThrow('Customer ID must be a positive integer');
      expect(() => validateNumericCustomerId('abc')).toThrow('Customer ID must be a positive integer');
    });
  });

  describe('toSubscriptionsSummary', () => {
    test('should transform Appstle response to our schema', () => {
      const appstleResponse = {
        subscriptionContracts: {
          edges: [
            {
              node: {
                id: 'gid://shopify/SubscriptionContract/123456789',
                status: 'ACTIVE',
                nextBillingDate: '2025-01-15T10:00:00Z',
                createdAt: '2024-12-01T10:00:00Z',
                deliveryPolicy: {
                  interval: 'WEEK',
                  intervalCount: 2
                },
                lines: {
                  edges: [
                    {
                      node: {
                        productTitle: 'Premium Dog Food',
                        variantTitle: '5kg Bag',
                        quantity: 2
                      }
                    }
                  ]
                }
              }
            }
          ],
          pageInfo: {
            hasNextPage: true,
            endCursor: 'cursor123'
          }
        }
      };

      const result = toSubscriptionsSummary(appstleResponse);

      expect(result).toEqual({
        subscriptions: [
          {
            subscription_contract_id: 123456789,
            subscription_contract_gid: 'gid://shopify/SubscriptionContract/123456789',
            status: 'ACTIVE',
            plan_name: '2 WEEKs',
            next_billing_date: '2025-01-15T10:00:00Z',
            items_summary: '2x 5kg Bag',
            created_at: '2024-12-01T10:00:00Z',
            can_skip_orders: true,
            upcoming_orders_count: 1,
            suggested_next_action: 'Call list_upcoming_orders with subscription_contract_id: 123456789 to see upcoming orders for this subscription',
            subscription_number: 1,
            protein_substitution: undefined,
            allergies: undefined,
            origin_order_name: undefined
          }
        ],
        page_info: {
          has_next_page: true,
          end_cursor: 'cursor123'
        },
        active_subscription_count: 1,
        workflow_guidance: 'Customer has 1 active subscription. To skip an order: call list_upcoming_orders with subscription_contract_id: 123456789, then ask customer which order to skip, then call skip_order.',
        next_step_guidance: {
          ask_customer: "I found your subscription. Let me check your upcoming deliveries.",
          show_options: false,
          save_parameter: "subscription_contract_id",
          next_tool: "list_upcoming_orders",
          condition: "SKIP_CUSTOMER_CHOICE"
        }
      });
    });

    test('should filter out inactive subscriptions', () => {
      const appstleResponseMixed = {
        subscriptionContracts: {
          edges: [
            {
              node: {
                id: 'gid://shopify/SubscriptionContract/123456789',
                status: 'ACTIVE',
                nextBillingDate: '2025-01-15T10:00:00Z',
                createdAt: '2024-12-01T10:00:00Z',
                deliveryPolicy: {
                  interval: 'WEEK',
                  intervalCount: 2
                },
                lines: {
                  edges: [
                    {
                      node: {
                        productTitle: '5kg Bag',
                        variantTitle: null,
                        quantity: 2
                      }
                    }
                  ]
                }
              }
            },
            {
              node: {
                id: 'gid://shopify/SubscriptionContract/987654321',
                status: 'CANCELLED',
                nextBillingDate: '2025-01-20T10:00:00Z',
                createdAt: '2024-11-01T10:00:00Z',
                deliveryPolicy: {
                  interval: 'MONTH',
                  intervalCount: 1
                },
                lines: {
                  edges: [
                    {
                      node: {
                        productTitle: '10kg Bag',
                        variantTitle: null,
                        quantity: 1
                      }
                    }
                  ]
                }
              }
            },
            {
              node: {
                id: 'gid://shopify/SubscriptionContract/555666777',
                status: 'PAUSED',
                nextBillingDate: '2025-02-01T10:00:00Z',
                createdAt: '2024-10-01T10:00:00Z',
                deliveryPolicy: {
                  interval: 'WEEK',
                  intervalCount: 1
                },
                lines: {
                  edges: [
                    {
                      node: {
                        productTitle: 'Treats',
                        variantTitle: null,
                        quantity: 3
                      }
                    }
                  ]
                }
              }
            }
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null
          }
        }
      };

      const result = toSubscriptionsSummary(appstleResponseMixed);

      // Should only return the ACTIVE subscription
      expect(result).toEqual({
        subscriptions: [
          {
            subscription_contract_id: 123456789,
            subscription_contract_gid: 'gid://shopify/SubscriptionContract/123456789',
            status: 'ACTIVE',
            plan_name: '2 WEEKs',
            next_billing_date: '2025-01-15T10:00:00Z',
            items_summary: '2x 5kg Bag',
            created_at: '2024-12-01T10:00:00Z',
            can_skip_orders: true,
            upcoming_orders_count: 1,
            suggested_next_action: 'Call list_upcoming_orders with subscription_contract_id: 123456789 to see upcoming orders for this subscription',
            subscription_number: 1,
            protein_substitution: undefined,
            allergies: undefined,
            origin_order_name: undefined
          }
        ],
        page_info: {
          has_next_page: false,
          end_cursor: null
        },
        active_subscription_count: 1,
        workflow_guidance: 'Customer has 1 active subscription. To skip an order: call list_upcoming_orders with subscription_contract_id: 123456789, then ask customer which order to skip, then call skip_order.',
        next_step_guidance: {
          ask_customer: "I found your subscription. Let me check your upcoming deliveries.",
          show_options: false,
          save_parameter: "subscription_contract_id",
          next_tool: "list_upcoming_orders",
          condition: "SKIP_CUSTOMER_CHOICE"
        }
      });
    });

    test('should handle no active subscriptions', () => {
      const appstleResponseInactive = {
        subscriptionContracts: {
          edges: [
            {
              node: {
                id: 'gid://shopify/SubscriptionContract/987654321',
                status: 'CANCELLED',
                nextBillingDate: '2025-01-20T10:00:00Z',
                createdAt: '2024-11-01T10:00:00Z',
                deliveryPolicy: {
                  interval: 'MONTH',
                  intervalCount: 1
                }
              }
            }
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null
          }
        }
      };

      const result = toSubscriptionsSummary(appstleResponseInactive);

      expect(result).toEqual({
        subscriptions: [],
        page_info: {
          has_next_page: false,
          end_cursor: null
        },
        active_subscription_count: 0,
        workflow_guidance: 'No active subscriptions found. Customer cannot skip orders.',
        next_step_guidance: {
          ask_customer: "You don't have any active subscriptions to manage.",
          show_options: false,
          save_parameter: "none",
          next_tool: "none"
        }
      });
    });
  });

  describe('mapBillingAttempt', () => {
    test('should map billing attempt with items', () => {
      const attempt = {
        id: 456789, // This is the main ID used for skip/unskip
        billingAttemptId: null, // This is always null in real API responses
        orderId: 789012, // This is the Shopify order ID
        orderName: 'Order #1001',
        billingDate: '2025-01-15T10:00:00Z',
        status: 'PENDING',
        variantList: [
          {
            title: 'Premium Dog Food',
            variantTitle: '5kg Bag',
            quantity: 1
          },
          {
            productTitle: 'Dog Treats',
            quantity: 2
          }
        ]
      };

      const result = mapBillingAttempt(attempt);

      expect(result).toEqual({
        order_id: 456789, // The main ID (was billing_attempt_id)
        billing_attempt_ref: undefined, // null becomes undefined
        shopify_order_id: 789012, // The Shopify order ID (was order_id)
        order_name: 'Order #1001',
        billing_date: '2025-01-15T10:00:00Z',
        status: 'PENDING',
        items: [
          { title: '5kg Bag', quantity: 1 },
          { title: 'Dog Treats', quantity: 2 }
        ]
      });
    });

    test('should map billing attempt without items', () => {
      const attempt = {
        id: 456789, // The main ID
        billingDate: '2025-01-15T10:00:00Z',
        status: 'COMPLETED'
        // billingAttemptId is missing (would be null anyway)
        // orderId is missing (no Shopify order created yet)
      };

      const result = mapBillingAttempt(attempt);

      expect(result).toEqual({
        order_id: 456789, // The main ID (was billing_attempt_id)
        billing_attempt_ref: undefined,
        shopify_order_id: undefined, // No Shopify order ID (was order_id)
        order_name: undefined,
        billing_date: '2025-01-15T10:00:00Z',
        status: 'COMPLETED'
      });
    });
  });
});