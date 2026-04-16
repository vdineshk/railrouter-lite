# RailRouter Lite

**Intelligent real-time payment rail router for AI agents.**

**Live MCP Endpoint**  
`https://railrouter-lite.sgdata.workers.dev/mcp`

### Tool: `route_payment`

Routes a payment request to the optimal rail (Stripe MPP, x402, or Google AP2) in real time based on cost, latency, and success rate.

**Input Schema**
```json
{
  "amount_sgd": { "type": "number", "description": "Amount in SGD" },
  "target_server_url": { "type": "string", "description": "The MCP server that needs payment" },
  "tool_name": { "type": "string", "description": "Name of the tool being paid for" },
  "preferred_rail": { "type": "string", "enum": ["mpp", "x402", "ap2", "auto"] }
}
Response Example
JSON{
  "success": true,
  "chosen_rail": "mpp",
  "payment_intent": "rr_1744641123456",
  "estimated_fee_sgd": 0.13,
  "message": "Routed via MPP in 12ms"
}
Every routing decision is automatically logged to D1, creating compounding intelligence (cost, latency, success rate per category). No other MCP server offers intelligent cross-rail routing.
Compatible with LangChain, LangGraph, CrewAI, AutoGen and any MCP client.
GitHub: https://github.com/vdineshk/railrouter-lite
Pricing

Free: 10 routes/day
Starter: S$29/month (unlimited + analytics)
Pro: S$99/month (priority routing + Observatory trust integration)
