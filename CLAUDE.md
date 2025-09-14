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

## Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `npx vercel`
3. Set environment variables in Vercel dashboard
4. Your MCP endpoint will be at: `https://your-deployment.vercel.app/api/mcp`

## Testing the MCP Server

Use curl to test the deployed server:

```bash
# List available tools
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_subscriptions_for_customer","arguments":{"shopify_customer_id":123456}}}'
```