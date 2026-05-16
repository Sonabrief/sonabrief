import type { Env } from "./lib/env";
import { handleCorsPreflightRequest } from "./lib/cors";
import {
  handleAuthRequest,
  handleAuthVerify,
  handleAuthLogout,
  handleAuthMe,
} from "./routes/auth";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleCorsPreflightRequest(request, env);
    }

    // Auth
    if (url.pathname === "/auth/request" && request.method === "POST") {
      return handleAuthRequest(request, env);
    }
    if (url.pathname === "/auth/verify" && request.method === "GET") {
      return handleAuthVerify(request, env);
    }
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return handleAuthLogout(request, env);
    }
    if (url.pathname === "/auth/me" && request.method === "GET") {
      return handleAuthMe(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};