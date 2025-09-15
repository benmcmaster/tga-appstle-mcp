import { logger } from './logger.js';
import type { ErrorOutput } from './schemas.js';

interface AppstleConfig {
  baseUrl: string;
  apiKey: string;
}

class AppstleError extends Error {
  constructor(
    public statusCode: number,
    public title: string,
    public detail: string,
    public requestId?: string
  ) {
    super(`${title}: ${detail}`);
    this.name = 'AppstleError';
  }

  toErrorOutput(): ErrorOutput {
    return {
      error: {
        code: this.statusCode,
        title: this.title,
        detail: this.detail,
        request_id: this.requestId,
      },
    };
  }
}

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export class AppstleClient {
  private config: AppstleConfig;
  private retryConfig: RetryConfig;

  constructor(config: AppstleConfig) {
    this.config = config;
    this.retryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  private shouldRetry(statusCode: number): boolean {
    // Retry on 429 (rate limit) and 5xx (server errors)
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
  }

  private mapHttpError(statusCode: number, statusText: string, responseText?: string, requestId?: string): AppstleError {
    let title = 'API Error';
    let detail = responseText || statusText || 'Unknown error occurred';

    switch (statusCode) {
      case 400:
        title = 'Bad Request';
        detail = 'Invalid request parameters';
        break;
      case 401:
        title = 'Unauthorized';
        detail = 'Invalid API key or authentication failed';
        break;
      case 403:
        title = 'Forbidden';
        detail = 'Access denied to the requested resource';
        break;
      case 404:
        title = 'Not Found';
        detail = 'The requested resource was not found';
        break;
      case 409:
        title = 'Conflict';
        detail = 'Request conflicts with current state of the resource';
        break;
      case 429:
        title = 'Rate Limited';
        detail = 'Too many requests, please retry later';
        break;
      case 500:
        title = 'Internal Server Error';
        detail = 'Appstle server encountered an error';
        break;
      case 502:
      case 503:
      case 504:
        title = 'Service Unavailable';
        detail = 'Appstle service is temporarily unavailable';
        break;
      default:
        if (statusCode >= 400 && statusCode < 500) {
          title = 'Client Error';
        } else if (statusCode >= 500) {
          title = 'Server Error';
        }
        break;
    }

    if (responseText && responseText !== statusText) {
      detail = responseText;
    }

    return new AppstleError(statusCode, title, detail, requestId);
  }

  private async makeRequest<T>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string>;
      body?: Record<string, unknown>;
      requestId?: string;
    } = {}
  ): Promise<T> {
    const requestId = options.requestId || logger.generateRequestId();
    const startTime = Date.now();
    
    let url = `${this.config.baseUrl}${path}`;
    
    if (options.query && Object.keys(options.query).length > 0) {
      const params = new URLSearchParams(options.query);
      url += `?${params.toString()}`;
    }

    logger.debug(`Making ${method} request to Appstle`, {
      requestId,
      method,
      path,
      query: options.query,
    });

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        const requestInit: RequestInit = {
          method,
          headers: {
            'X-API-Key': this.config.apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'TGA-Appstle-MCP/1.0.0',
          },
        };

        if (options.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          requestInit.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, requestInit);
        const duration = Date.now() - startTime;

        // Try to get response text for error mapping
        let responseText: string;
        try {
          responseText = await response.text();
        } catch {
          responseText = '';
        }

        if (!response.ok) {
          const error = this.mapHttpError(response.status, response.statusText, responseText, requestId);
          
          // Log the error
          logger.error(`Appstle API error`, {
            requestId,
            method,
            path,
            statusCode: response.status,
            duration,
            attempt: attempt + 1,
            willRetry: this.shouldRetry(response.status) && attempt < this.retryConfig.maxAttempts - 1,
          });

          // Check if we should retry
          if (this.shouldRetry(response.status) && attempt < this.retryConfig.maxAttempts - 1) {
            const delay = this.calculateBackoffDelay(attempt);
            logger.info(`Retrying request after ${delay}ms`, { requestId, attempt: attempt + 1 });
            await this.sleep(delay);
            continue;
          }

          throw error;
        }

        // Success - parse JSON response
        let data: T;
        try {
          data = responseText ? JSON.parse(responseText) : {} as T;
        } catch (parseError) {
          logger.error('Failed to parse JSON response', { requestId, parseError, responseText: responseText.slice(0, 200) });
          throw new AppstleError(500, 'Parse Error', 'Failed to parse API response as JSON', requestId);
        }

        logger.info(`Appstle API success`, {
          requestId,
          method,
          path,
          statusCode: response.status,
          duration,
          attempt: attempt + 1,
        });

        return data;

      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof AppstleError) {
          throw error;
        }

        // Network or other fetch errors
        logger.error(`Network error during Appstle request`, {
          requestId,
          method,
          path,
          duration,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
          willRetry: attempt < this.retryConfig.maxAttempts - 1,
        });

        // Retry network errors
        if (attempt < this.retryConfig.maxAttempts - 1) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
          continue;
        }

        throw new AppstleError(
          500,
          'Network Error',
          error instanceof Error ? error.message : 'Network request failed',
          requestId
        );
      }
    }

    // This should never be reached
    throw new AppstleError(500, 'Internal Error', 'Max retry attempts exhausted', requestId);
  }

  // API Methods

  async getSubscriptionCustomer(customerId: number, cursor?: string, requestId?: string): Promise<{
    subscriptionContracts: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          nextBillingDate: string;
          createdAt?: string;
          deliveryPolicy?: {
            interval: string;
            intervalCount: number;
          };
          lines?: {
            edges: Array<{
              node: {
                productTitle?: string;
                variantTitle?: string;
                quantity: number;
              };
            }>;
          };
        };
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string;
      };
    };
  }> {
    const query: Record<string, string> = {};
    if (cursor) {
      query.cursor = cursor;
    }

    return this.makeRequest('GET', `/api/external/v2/subscription-customers/${customerId}`, {
      query,
      requestId,
    });
  }

  async getTopOrders(contractId: number, requestId?: string): Promise<Array<{
    id: number;
    billingAttemptId?: string;
    orderId?: number;
    orderName?: string;
    billingDate: string;
    status: string;
    variantList?: Array<{
      title?: string;
      quantity?: number;
      productTitle?: string;
      variantTitle?: string;
    }>;
  }>> {
    return this.makeRequest('GET', '/api/external/v2/subscription-billing-attempts/top-orders', {
      query: { contractId: contractId.toString() },
      requestId,
    });
  }

  async getPastOrders(contractId: number, page: number = 0, size: number = 10, sort: string[] = ['id,desc'], requestId?: string): Promise<any> {
    const query: Record<string, string> = {
      contractId: contractId.toString(),
      'pageable.page': page.toString(),
      'pageable.size': size.toString(),
      'pageable.sort': sort.join(','),
    };

    logger.debug('Making getPastOrders API call', {
      requestId,
      contractId,
      page,
      size,
      sort,
      queryParams: query,
      endpoint: '/api/external/v2/subscription-billing-attempts/past-orders'
    });

    return this.makeRequest('GET', '/api/external/v2/subscription-billing-attempts/past-orders', {
      query,
      requestId,
    });
  }

  async skipUpcomingOrderForContract(subscriptionContractId: number, requestId?: string): Promise<{
    id: number;
    billingAttemptId?: string;
    orderId?: number;
    orderName?: string;
    billingDate: string;
    status: string;
  }> {
    return this.makeRequest('PUT', '/api/external/v2/subscription-billing-attempts/skip-upcoming-order', {
      query: { subscriptionContractId: subscriptionContractId.toString() },
      requestId,
    });
  }

  async skipBillingAttempt(billingAttemptId: number, subscriptionContractId?: number, isPrepaid?: boolean, requestId?: string): Promise<{
    id: number;
    billingAttemptId?: string;
    orderId?: number;
    orderName?: string;
    billingDate: string;
    status: string;
  }> {
    const query: Record<string, string> = {};
    if (subscriptionContractId) {
      query.subscriptionContractId = subscriptionContractId.toString();
    }
    if (isPrepaid !== undefined) {
      query.isPrepaid = isPrepaid.toString();
    }

    return this.makeRequest('PUT', `/api/external/v2/subscription-billing-attempts/skip-order/${billingAttemptId}`, {
      query: Object.keys(query).length > 0 ? query : undefined,
      requestId,
    });
  }

  async unskipBillingAttempt(billingAttemptId: number, subscriptionContractId?: number, requestId?: string): Promise<{
    id: number;
    billingAttemptId?: string;
    orderId?: number;
    orderName?: string;
    billingDate: string;
    status: string;
  }> {
    const query: Record<string, string> = {};
    if (subscriptionContractId) {
      query.subscriptionContractId = subscriptionContractId.toString();
    }

    return this.makeRequest('PUT', `/api/external/v2/subscription-billing-attempts/unskip-order/${billingAttemptId}`, {
      query: Object.keys(query).length > 0 ? query : undefined,
      requestId,
    });
  }
}

export { AppstleError };

export function createAppstleClient(): AppstleClient {
  const baseUrl = process.env.APPSTLE_API_BASE || 'https://subscription-admin.appstle.com';
  const apiKey = process.env.APPSTLE_API_KEY;

  if (!apiKey) {
    throw new Error('APPSTLE_API_KEY environment variable is required');
  }

  return new AppstleClient({ baseUrl, apiKey });
}