// Worker entry. Serves /mcp, with the user's OpenRouter key taken from the request headers, and /version.
import { openRouterKey } from "./core/auth.js";
import { createHandler } from "./mcp.js";
import { VERSION } from "./version.js";

export default {
  /**
   * @param {Request} request
   * @param {{ CACHE: KVNamespace, DB: D1Database }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return createHandler(env, openRouterKey(request.headers)).fetch(request);
    }
    if (url.pathname === "/version") return Response.json({ version: VERSION });
    return new Response("Not found", { status: 404 });
  },
};
