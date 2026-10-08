
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
        const result = await env.DB.prepare(
          "SELECT id, name, stock FROM keycaps ORDER BY id"
        ).all();

        return Response.json(
          { keycaps: result.results },
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

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
