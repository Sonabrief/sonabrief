// CORS con allowlist di origini consentite.

import type { Env } from "./env";

const ALLOWED_ORIGINS_PROD = ["https://sonabrief.com", "https://www.sonabrief.com"];
const ALLOWED_ORIGINS_DEV = ["http://localhost:5173", "http://localhost:1420"];

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const isDev = env.APP_URL.includes("localhost");
  const allowed = isDev
    ? [...ALLOWED_ORIGINS_PROD, ...ALLOWED_ORIGINS_DEV]
    : ALLOWED_ORIGINS_PROD;

  const allowOrigin = allowed.includes(origin) ? origin : allowed[0]!;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export function handleCorsPreflightRequest(request: Request, env: Env): Response {
  return new Response(null, { headers: corsHeaders(request, env) });
}