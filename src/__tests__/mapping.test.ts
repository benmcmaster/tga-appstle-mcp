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
            created_at: '2024-12-01T10:00:00Z'
          }
        ],
        page_info: {
          has_next_page: true,
          end_cursor: 'cursor123'
        }
      });
    });
  });

  describe('mapBillingAttempt', () => {
    test('should map billing attempt with items', () => {
      const attempt = {
        id: 456789,
        billingAttemptId: 'ba_123',
        orderId: 789012,
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
        billing_attempt_id: 456789,
        billing_attempt_ref: 'ba_123',
        order_id: 789012,
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
        id: 456789,
        billingDate: '2025-01-15T10:00:00Z',
        status: 'COMPLETED'
      };

      const result = mapBillingAttempt(attempt);

      expect(result).toEqual({
        billing_attempt_id: 456789,
        billing_attempt_ref: undefined,
        order_id: undefined,
        order_name: undefined,
        billing_date: '2025-01-15T10:00:00Z',
        status: 'COMPLETED'
      });
    });
  });
});