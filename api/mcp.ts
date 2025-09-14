import { VercelRequest, VercelResponse } from '@vercel/node';
import { simpleServer } from '../src/server-simple.js';
import { VercelMcpTransport } from '../src/transport.js';
import { logger } from '../src/logger.js';

// Create transport instance
const transport = new VercelMcpTransport(simpleServer);

// Authentication result type
interface AuthResult {
  success: boolean;
  error?: string;
}

// Authenticate incoming requests using API key
function authenticateRequest(req: VercelRequest): AuthResult {
  const expectedApiKey = process.env.MCP_API_KEY;
  
  if (!expectedApiKey) {
    return { success: false, error: 'MCP_API_KEY not configured' };
  }

  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { success: false, error: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'Authorization header must use Bearer token format' };
  }

  const providedApiKey = authHeader.substring(7); // Remove "Bearer " prefix
  
  if (providedApiKey !== expectedApiKey) {
    return { success: false, error: 'Invalid API key' };
  }

  return { success: true };
}

// Main handler function
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestId = logger.generateRequestId();
  const startTime = Date.now();

  try {
    // Log the incoming request
    logger.info('Received MCP request', {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
    });

    // Check authentication before processing any requests (except OPTIONS)
    if (req.method !== 'OPTIONS') {
      const authResult = authenticateRequest(req);
      if (!authResult.success) {
        logger.warn('Authentication failed', {
          requestId,
          reason: authResult.error,
          userAgent: req.headers['user-agent'],
        });
        
        res.status(401).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32001,
            message: 'Unauthorized',
            data: authResult.error,
          },
        });
        return;
      }
      
      logger.debug('Authentication successful', { requestId });
    }

    // Set CORS headers
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      logger.debug('Handling CORS preflight request', { requestId });
      res.status(204).end();
      return;
    }

    // Convert VercelRequest to Web API Request
    const webRequest = await convertToWebRequest(req);

    // Handle the request using our transport
    const response = await transport.handleRequest(webRequest);

    // Convert Web API Response back to VercelResponse
    await convertToVercelResponse(response, res, requestId);

    const duration = Date.now() - startTime;
    logger.info('MCP request completed', {
      requestId,
      duration,
      statusCode: res.statusCode,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('MCP handler error', {
      requestId,
      duration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Send error response
    res.status(500).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

// Convert VercelRequest to Web API Request
async function convertToWebRequest(req: VercelRequest): Promise<Request> {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  
  // Copy relevant headers
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    }
  }

  // Convert body
  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

// Convert Web API Response to VercelResponse
async function convertToVercelResponse(
  webResponse: Response, 
  res: VercelResponse, 
  requestId: string
): Promise<void> {
  // Set status code
  res.status(webResponse.status);

  // Copy headers
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // Set request ID header
  res.setHeader('X-Request-ID', requestId);

  // Get response body
  const body = await webResponse.text();

  if (body) {
    // Set response body
    if (webResponse.headers.get('content-type')?.includes('application/json')) {
      try {
        const jsonBody = JSON.parse(body);
        res.json(jsonBody);
      } catch {
        res.send(body);
      }
    } else {
      res.send(body);
    }
  } else {
    res.end();
  }
}

// Export the config for Vercel
export const config = {
  maxDuration: 60,
};