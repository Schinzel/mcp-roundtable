import { createHandler } from "./mcp.js";

export default {
  /**
   * @param {Request} request
   * @param {object} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return createHandler(env).fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
