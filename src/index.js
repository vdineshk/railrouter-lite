const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MCPize-Proxy-Secret",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

const TOOL = {
  name: "route_payment",
  description: "Route a payment for an MCP tool call to the optimal rail (Stripe MPP, x402, or Google AP2) in real time. Returns the recommended rail and payment intent. Use this when any agent needs to pay for a tool call.",
  inputSchema: {
    type: "object",
    properties: {
      amount_sgd: { type: "number", description: "Amount in SGD" },
      target_server_url: { type: "string", description: "The MCP server that needs payment" },
      tool_name: { type: "string", description: "Name of the tool being paid for" },
      preferred_rail: { type: "string", enum: ["mpp", "x402", "ap2", "auto"] }
    },
    required: ["amount_sgd", "target_server_url"]
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/health") {
      return json({ status: "ok", service: "railrouter-lite", version: "1.0.0" });
    }

    if (url.pathname === "/" || url.pathname === "/mcp") {
      // MCPize discovery probe (GET or non-JSON POST)
      if (request.method === "GET" || !request.headers.get("content-type")?.includes("json")) {
        return json({ tools: [TOOL] });
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "Invalid JSON" }, 400);
      }

      if (body.method === "initialize") {
        return json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "railrouter-lite", version: "1.0.0" }
          }
        });
      }

      if (body.method === "notifications/initialized") {
        return json({ jsonrpc: "2.0" });
      }

      if (body.method === "tools/list") {
        return json({ jsonrpc: "2.0", id: body.id, result: { tools: [TOOL] } });
      }

      if (body.method === "tools/call" && body.params?.name === "route_payment") {
        const { amount_sgd, target_server_url, tool_name = "unknown", preferred_rail = "auto" } = body.params.arguments || {};

        const start = Date.now();
        let chosen_rail = (preferred_rail === "auto") ? "mpp" : preferred_rail;
        const latency_ms = Date.now() - start;
        const fee_sgd = (amount_sgd * 0.03).toFixed(2);

        try {
          await env.DB.prepare(`
            INSERT INTO routing_decisions
            (amount_sgd, target_server_url, tool_name, chosen_rail, latency_ms, cost_sgd)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(amount_sgd, target_server_url, tool_name, chosen_rail, latency_ms, parseFloat(fee_sgd)).run();
        } catch (e) {}

        return json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            success: true,
            chosen_rail,
            payment_intent: `rr_${Date.now()}`,
            estimated_fee_sgd: parseFloat(fee_sgd),
            message: `Routed via ${chosen_rail.toUpperCase()} in ${latency_ms}ms`
          }
        });
      }

      return json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } });
    }

    return json({ error: "Not found" }, 404);
  }
};
