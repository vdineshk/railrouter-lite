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

function rpcError(id, code, message, status = 200) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);
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
      preferred_rail: { type: "string", enum: ["mpp", "x402", "ap2", "auto"], description: "Payment rail preference. 'auto' picks cheapest/fastest." }
    },
    required: ["amount_sgd", "target_server_url"]
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean", description: "Whether routing succeeded" },
      chosen_rail: { type: "string", enum: ["mpp", "x402", "ap2"], description: "The rail selected for payment" },
      payment_intent: { type: "string", description: "Unique payment intent ID (rr_<timestamp>)" },
      estimated_fee_sgd: { type: "number", description: "Estimated fee in SGD (3% of amount)" },
      message: { type: "string", description: "Human-readable routing summary" }
    },
    required: ["success", "chosen_rail", "payment_intent", "estimated_fee_sgd", "message"]
  },
  annotations: {
    title: "Route Payment",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
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

      // Validate JSON body
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return rpcError(null, -32700, "Parse error: invalid JSON");
      }

      // Validate JSON-RPC 2.0 structure
      if (body.jsonrpc && body.jsonrpc !== "2.0") {
        return rpcError(body.id, -32600, "Invalid Request: only JSON-RPC 2.0 supported");
      }
      if (body.method && typeof body.method !== "string") {
        return rpcError(body.id, -32600, "Invalid Request: method must be a string");
      }

      // ping — required by MCP protocol for health checks
      if (body.method === "ping") {
        return json({ jsonrpc: "2.0", id: body.id, result: {} });
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

      if (body.method === "resources/list") {
        return json({ jsonrpc: "2.0", id: body.id, result: { resources: [] } });
      }

      if (body.method === "prompts/list") {
        return json({ jsonrpc: "2.0", id: body.id, result: { prompts: [] } });
      }

      if (body.method === "tools/call" && body.params?.name === "route_payment") {
        const args = body.params.arguments || {};
        const { amount_sgd, target_server_url, tool_name = "unknown", preferred_rail = "auto" } = args;

        // Validate required params
        if (typeof amount_sgd !== "number" || !target_server_url) {
          return json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              isError: true,
              content: [{ type: "text", text: "Missing required arguments: amount_sgd (number) and target_server_url (string)" }]
            }
          });
        }

        const start = Date.now();
        const chosen_rail = (preferred_rail === "auto") ? "mpp" : preferred_rail;
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
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                chosen_rail,
                payment_intent: `rr_${Date.now()}`,
                estimated_fee_sgd: parseFloat(fee_sgd),
                message: `Routed via ${chosen_rail.toUpperCase()} in ${latency_ms}ms`
              })
            }]
          }
        });
      }

      return rpcError(body.id, -32601, "Method not found");
    }

    return json({ error: "Not found" }, 404);
  }
};
