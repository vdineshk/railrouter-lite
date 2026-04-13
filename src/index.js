const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const server = new McpServer({
  name: "railrouter-lite",
  version: "1.0.0"
});

server.tool(
  "route_payment",
  "Route a payment for an MCP tool call to the optimal rail (Stripe MPP, x402, or Google AP2) in real time. Returns the recommended rail and payment intent.",
  {
    amount_sgd: { type: "number", description: "Amount in SGD" },
    target_server_url: { type: "string", description: "The MCP server that needs payment" },
    tool_name: { type: "string", description: "Name of the tool being paid for" },
    preferred_rail: { type: "string", enum: ["mpp", "x402", "ap2", "auto"], description: "Optional preference" }
  },
  async ({ amount_sgd, target_server_url, tool_name, preferred_rail = "auto" }) => {
    const start = Date.now();

    // Simple routing logic (will improve with D1 data over time)
    let chosen_rail = "mpp"; // default to Stripe MPP for now
    if (preferred_rail !== "auto") chosen_rail = preferred_rail;

    const latency_ms = Date.now() - start;
    const cost_sgd = amount_sgd * 0.03; // 3% example fee

    // Log to D1
    await env.DB.prepare(`
      INSERT INTO routing_decisions
      (amount_sgd, target_server_url, tool_name, chosen_rail, latency_ms, cost_sgd)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(amount_sgd, target_server_url, tool_name, chosen_rail, latency_ms, cost_sgd).run();

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          chosen_rail,
          payment_intent: `pay_${Date.now()}`,
          estimated_fee_sgd: cost_sgd,
          message: `Routed via ${chosen_rail.toUpperCase()} — payment ready`
        })
      }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
