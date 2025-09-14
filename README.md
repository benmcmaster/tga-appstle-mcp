# TGA Appstle MCP Server

A production-ready Model Context Protocol (MCP) server that integrates with Appstle Subscriptions API for Intercom Fin AI agent. This server enables customers to manage their subscription deliveries through natural conversation in Intercom chat.

## Overview

This MCP server wraps the Appstle Subscriptions API to allow Intercom's Fin AI agent to help Shopify customers:

- List their subscription contracts
- View upcoming and past orders
- Skip upcoming deliveries
- Unskip previously skipped orders

**Target Use Case:** A customer says "I am out of town next week, please skip my next delivery" in Intercom chat, and Fin can handle the entire flow automatically.

## Architecture

- **TypeScript MCP Server** using `@modelcontextprotocol/sdk`
- **Vercel Serverless Functions** with HTTP transport
- **Appstle API Integration** with retry logic and error handling
- **JSON Schema Validation** with Zod for type safety
- **Structured Logging** with PII masking

## Project Structure

```
/
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vercel.json               # Vercel deployment configuration
├── vitest.config.ts          # Test configuration
├── src/
│   ├── server.ts             # MCP server bootstrap & tool registry
│   ├── transport.ts          # HTTP transport adapter for Vercel
│   ├── appstle.ts            # Appstle API client with auth & retry logic
│   ├── schemas.ts            # Zod schemas + TypeScript types
│   ├── mapping.ts            # GID parsers & data transformers
│   ├── logger.ts             # Structured logging with PII masking
│   └── tools.ts              # MCP tool implementations
├── api/
│   └── mcp.ts                # Vercel API route handler
└── src/__tests__/
    ├── mapping.test.ts       # Unit tests for data mapping
    ├── schemas.test.ts       # Schema validation tests
    └── appstle.test.ts       # API client tests
```

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Create a `.env.local` file:

```bash
APPSTLE_API_BASE=https://subscription-admin.appstle.com
APPSTLE_API_KEY=your_appstle_api_key_here
```

### 3. Local Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### 4. Deployment to Vercel

```bash
# Deploy to Vercel
npx vercel

# Set environment variables in Vercel dashboard:
# - APPSTLE_API_BASE
# - APPSTLE_API_KEY
```

Your MCP server will be available at: `https://your-deployment.vercel.app/api/mcp`

## MCP Tools

The server exposes 6 tools for subscription management:

### 1. `list_subscriptions_for_customer`

Retrieve subscription contracts for a Shopify customer.

**Input:**
```json
{
  "shopify_customer_id": 987654321,
  "cursor": "optional_pagination_cursor"
}
```

**Output:**
```json
{
  "subscriptions": [
    {
      "subscription_contract_id": 123456789,
      "subscription_contract_gid": "gid://shopify/SubscriptionContract/123456789",
      "status": "ACTIVE",
      "plan_name": "2 WEEKs",
      "next_billing_date": "2025-01-15T10:00:00Z",
      "items_summary": "2x Premium Dog Food, 1x Dog Treats",
      "created_at": "2024-12-01T10:00:00Z"
    }
  ],
  "page_info": {
    "has_next_page": false,
    "end_cursor": "cursor123"
  }
}
```

### 2. `list_upcoming_orders`

List upcoming billing attempts for a subscription.

**Input:**
```json
{
  "subscription_contract_id": 123456789
}
```

**Output:**
```json
{
  "upcoming": [
    {
      "billing_attempt_id": 456789,
      "billing_attempt_ref": "ba_123",
      "order_id": 789012,
      "order_name": "Order #1001",
      "billing_date": "2025-01-15T10:00:00Z",
      "status": "PENDING",
      "items": [
        {
          "title": "Premium Dog Food - 5kg",
          "quantity": 2
        }
      ]
    }
  ]
}
```

### 3. `list_past_orders`

List past billing attempts with pagination.

**Input:**
```json
{
  "subscription_contract_id": 123456789,
  "page": 0,
  "size": 10,
  "sort": ["id,desc"]
}
```

### 4. `skip_upcoming_order_for_contract`

Skip the next upcoming billing attempt for a contract.

**Input:**
```json
{
  "subscription_contract_id": 123456789
}
```

**Output:**
```json
{
  "skipped": true,
  "billing_attempt_id": 456789,
  "billing_date": "2025-01-15T10:00:00Z",
  "status": "SKIPPED",
  "message": "Order skipped"
}
```

### 5. `skip_billing_attempt`

Skip a specific billing attempt by ID.

**Input:**
```json
{
  "billing_attempt_id": 456789,
  "subscription_contract_id": 123456789,
  "is_prepaid": false
}
```

### 6. `unskip_billing_attempt`

Unskip a previously skipped billing attempt.

**Input:**
```json
{
  "billing_attempt_id": 456789,
  "subscription_contract_id": 123456789
}
```

## Intercom Fin Integration

### Step 1: Configure Custom MCP

1. In Intercom: Settings → Integrations → Data connectors → Custom MCP
2. Add your MCP URL: `https://your-deployment.vercel.app/api/mcp`
3. Configure authentication if needed

### Step 2: Add Data Connectors

For each tool, create a Data connector with these configurations:

**list_subscriptions_for_customer:**
- Input mapping: `shopify_customer_id` → map from Intercom customer attribute or "Let Fin decide"
- Data access label: `{{plan_name}} • next {{next_billing_date}} • {{status}}`
- Hidden fields: `subscription_contract_id`, `subscription_contract_gid`

**list_upcoming_orders:**
- Input mapping: `subscription_contract_id` → "Let Fin decide" 
- Data access label: `{{billing_date}} • {{order_name}} • {{status}}`
- Hidden fields: `billing_attempt_id`, `order_id`

**Skip Actions:**
- Wrap in Fin Tasks for confirmation prompts
- Success messages: `Skipped: {{order_name}} on {{billing_date}} ({{status}})`

### Step 3: Customer ID Resolution

You'll need to resolve Intercom customers to Shopify customer IDs. Options:

1. **Custom Attribute:** Store Shopify customer ID as an Intercom custom attribute
2. **Lookup Tool:** Create an additional MCP tool that resolves email → Shopify customer ID
3. **Manual Input:** Let Fin ask the customer for their customer ID

## API Examples

### Test the MCP Server

```bash
# Test tool list
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Test tool call
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_subscriptions_for_customer",
      "arguments": {
        "shopify_customer_id": 987654321
      }
    }
  }'
```

## Key Implementation Details

### ID Conventions

- **Shopify Customer ID:** Always numeric (e.g., `987654321`), never GID format
- **Contract ID:** Parse from Shopify GID `gid://shopify/SubscriptionContract/123456789` → `123456789`
- **Billing Attempt ID:** Use the numeric `id` field from Appstle responses, not `orderId`

### Authentication

- Appstle API requires `X-API-Key` header
- Never use the deprecated `api_key` query parameter

### Error Handling

- Exponential backoff retry for 429/5xx errors (max 3 attempts)
- Structured error responses with request IDs
- PII masking in all logs

### Edge Cases

- **Multiple Subscriptions:** Return all with clear labels for Fin to present choices
- **No Upcoming Orders:** Return empty array, Fin handles gracefully
- **Paused/Canceled Contracts:** Include status so Fin can explain limitations
- **Prepaid Contracts:** Support `is_prepaid` flag on skip operations

## Security

- API keys never logged or exposed
- Email addresses and sensitive data masked in logs
- Input validation on all tool parameters
- CORS headers configured for Intercom integration

## Monitoring

All requests include:
- Structured JSON logs
- Request IDs for tracing
- Duration metrics
- PII-safe error messages
- Tool call success/failure tracking

## Development

### Running Tests

```bash
npm test                # Run all tests
npm run test:coverage   # Run with coverage report
npm run test:watch      # Run in watch mode
```

### Code Quality

```bash
npm run lint            # ESLint
npm run lint:fix        # Auto-fix issues
npm run typecheck       # TypeScript validation
```

### Build

```bash
npm run build           # Compile TypeScript
npm start               # Run production build locally
```

## Troubleshooting

### Common Issues

1. **"Customer ID must be numeric"**: Ensure you're passing numeric IDs, not Shopify GIDs
2. **"Invalid API key"**: Check `APPSTLE_API_KEY` environment variable
3. **Rate limited**: Implement longer delays between requests or contact Appstle
4. **Tool not found**: Verify tool names match exactly (underscore format)

### Debug Logs

Set `NODE_ENV=development` to see detailed debug logs including:
- Request/response payloads
- Retry attempts
- Tool execution timings

### Vercel Function Logs

```bash
npx vercel logs https://your-deployment.vercel.app/api/mcp
```

## License

MIT

## Support

For questions about this MCP server implementation, check the logs first, then review the Appstle API documentation and MCP specification.

Key resources:
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Appstle API Documentation](https://developers.appstle.com/)
- [Intercom Fin Custom Actions](https://developers.intercom.com/docs/fin-custom-actions)