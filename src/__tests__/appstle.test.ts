import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AppstleClient, AppstleError } from '../appstle.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('AppstleClient', () => {
  let client: AppstleClient;
  const mockFetch = vi.mocked(fetch);

  beforeEach(() => {
    client = new AppstleClient({
      baseUrl: 'https://test.appstle.com',
      apiKey: 'test-api-key'
    });
    mockFetch.mockClear();
  });

  describe('successful requests', () => {
    test('should make successful GET request', async () => {
      const mockResponse = { subscriptionContracts: { edges: [] } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response);

      const result = await client.getSubscriptionCustomer(123456);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.appstle.com/api/external/v2/subscription-customers/123456',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
            'Content-Type': 'application/json',
            'User-Agent': 'TGA-Appstle-MCP/1.0.0',
          }),
        })
      );
    });

    test('should make PUT request with query params', async () => {
      const mockResponse = { id: 123, status: 'SKIPPED' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response);

      const result = await client.skipBillingAttempt(123, 456, true);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.appstle.com/api/external/v2/subscription-billing-attempts/skip-order/123?subscriptionContractId=456&isPrepaid=true',
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });
  });

  describe('error handling', () => {
    test('should handle 404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Customer not found'),
      } as Response);

      await expect(client.getSubscriptionCustomer(999999)).rejects.toThrow(AppstleError);
      
      try {
        await client.getSubscriptionCustomer(999999);
      } catch (error) {
        expect(error).toBeInstanceOf(AppstleError);
        const appstleError = error as AppstleError;
        expect(appstleError.statusCode).toBe(404);
        expect(appstleError.title).toBe('Not Found');
        expect(appstleError.detail).toBe('Customer not found');
      }
    });

    test('should handle 401 authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      } as Response);

      await expect(client.getTopOrders(123)).rejects.toThrow(AppstleError);
    });

    test('should retry on 429 rate limit', async () => {
      // First call returns 429
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('Rate limited'),
      } as Response);

      // Second call succeeds
      const mockResponse = { content: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response);

      const result = await client.getPastOrders(123);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should retry on 500 server error', async () => {
      // First call returns 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      } as Response);

      // Second call succeeds
      const mockResponse = { id: 123, status: 'SKIPPED' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as Response);

      const result = await client.skipUpcomingOrderForContract(123);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should throw after max retries exceeded', async () => {
      // All calls return 500
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      } as Response);

      await expect(client.getTopOrders(123)).rejects.toThrow(AppstleError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Max retries is 3
    });
  });

  describe('request construction', () => {
    test('should build query parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      } as Response);

      await client.getPastOrders(123, 1, 20, ['id,desc', 'createdAt,asc']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.appstle.com/api/external/v2/subscription-billing-attempts/past-orders?contractId=123&pageable.page=1&pageable.size=20&pageable.sort=id%2Cdesc%2CcreatedAt%2Casc',
        expect.any(Object)
      );
    });

    test('should handle empty query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{}'),
      } as Response);

      await client.unskipBillingAttempt(123);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.appstle.com/api/external/v2/subscription-billing-attempts/unskip-order/123',
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });
  });

  describe('network errors', () => {
    test('should handle network failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getSubscriptionCustomer(123)).rejects.toThrow(AppstleError);
    });

    test('should handle invalid JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('invalid json'),
      } as Response);

      await expect(client.getSubscriptionCustomer(123)).rejects.toThrow(AppstleError);
    });
  });
});