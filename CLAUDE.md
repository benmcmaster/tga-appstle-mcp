# Claude Code Integration

This file contains commands and configuration for Claude Code development environment.

## Commands

Run these commands for development workflow:

```bash
# Install dependencies
npm install

# Development
npm run dev

# Testing
npm test
npm run test:coverage

# Code quality
npm run typecheck
npm run lint
npm run lint:fix

# Build and deployment
npm run build
npx vercel deploy
```

## Environment Setup

1. Copy environment template:
```bash
cp .env.example .env.local
```

2. Set required environment variables in `.env.local`:
- `APPSTLE_API_KEY`: Your Appstle API key
- `MCP_API_KEY`: API key for MCP server authentication

## Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `npx vercel`
3. Set environment variables in Vercel dashboard:
   - `APPSTLE_API_KEY`: Your Appstle API key
   - `MCP_API_KEY`: API key for MCP server authentication
4. Your MCP endpoint will be at: `https://your-deployment.vercel.app/api/mcp`

## Testing the MCP Server

The MCP server requires API key authentication. Use curl to test the deployed server:

```bash
# List available tools (with authentication)
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool (with authentication)
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_MCP_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_subscriptions_for_customer","arguments":{"shopify_customer_id":123456}}}'

# Test without API key (should return 401 Unauthorized)
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Authentication**: The server expects an `Authorization: Bearer <API_KEY>` header. Replace `YOUR_MCP_API_KEY` with the actual API key configured in your environment variables.

## Intercom Configuration

When configuring your MCP server in Intercom:
1. **Server URL**: `https://your-deployment.vercel.app/api/mcp`
2. **API Key**: Use the value of your `MCP_API_KEY` environment variable
3. Intercom will automatically add the `Authorization: Bearer <API_KEY>` header