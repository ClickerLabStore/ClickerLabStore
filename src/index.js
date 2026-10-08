import { shippingRates } from "./shipping.js";
import { inventory, checkout, webhook } from "./commerce.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "ClickerLabStore" });
    }

    if (url.pathname === "/api/keycaps") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        const result = await inventory(env.DB);

        return Response.json(
          result,
          { headers: { "Cache-Control": "no-store" } }
        );
      } catch (error) {
        console.error("Inventory query failed", error);
        return Response.json(
          { error: "Unable to load inventory" },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/order-status") {
      if (request.method !== "GET") return new Response("Method not allowed", {status:405});
      const session = url.searchParams.get("session_id") || "";
      if (!/^cs_test_[A-Za-z0-9]+$/.test(session)) return new Response("Invalid session",{status:400});
      const order = await env.DB.prepare("SELECT id,status FROM orders WHERE session_id=?").bind(session).first();
      return Response.json({status:order?.status || "pending",orderId:order?.id || null},{headers:{"Cache-Control":"no-store"}});
    }

    if (url.pathname === "/api/shipping-rates" || url.pathname === "/api/checkout" || url.pathname === "/api/stripe/webhook") {
      if (request.method !== "POST") return new Response("Method not allowed", {status:405});
      try {
        if (url.pathname === "/api/shipping-rates") return await shippingRates(request,env);
        return url.pathname === "/api/checkout" ? await checkout(request,env) : await webhook(request,env);
      } catch {
        return Response.json({error:"Unable to process this request. Please try again."},{status:500});
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
