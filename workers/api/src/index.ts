import type { Env } from "./lib/env";
import { handleCorsPreflightRequest, withCors } from "./lib/cors";
import {
  handleAuthRequest,
  handleAuthVerify,
  handleAuthLogout,
  handleAuthMe,
} from "./routes/auth";
import { handleSynthesize } from "./routes/synthesize";
import { handleTemplates } from "./routes/templates";
import { handleSyncUpload, handleSyncDownload } from "./routes/sync";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleCorsPreflightRequest(request, env);
    }

    let response: Response;

    if (url.pathname === "/auth/request" && request.method === "POST") {
      response = await handleAuthRequest(request, env);
    } else if (url.pathname === "/auth/verify" && request.method === "GET") {
      response = await handleAuthVerify(request, env);
    } else if (url.pathname === "/auth/logout" && request.method === "POST") {
      response = await handleAuthLogout(request, env);
    } else if (url.pathname === "/auth/me" && request.method === "GET") {
      response = await handleAuthMe(request, env);
    } else if (url.pathname === "/v1/synthesize" && request.method === "POST") {
      response = await handleSynthesize(request, env);
    } else if (url.pathname.startsWith("/v1/templates")) {
      response = await handleTemplates(request, env);
    } else if (url.pathname === "/v1/sync/upload" && request.method === "POST") {
      response = await handleSyncUpload(request, env);
    } else if (url.pathname === "/v1/sync/download" && request.method === "POST") {
      response = await handleSyncDownload(request, env);
    } else {
      response = new Response("Not found", { status: 404 });
    }

    return withCors(response, request, env);
  },
};