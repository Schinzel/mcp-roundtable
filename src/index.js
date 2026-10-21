// Worker entry. Only /mcp is served, with the user's OpenRouter key taken from the request headers.
import { openRouterKey } from "./core/auth.js";
import { createHandler } from "./mcp.js";

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
    return new Response("Not found", { status: 404 });
  },
};
