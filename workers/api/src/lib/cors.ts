import type { Env } from "./env";

const ALLOWED_ORIGINS = [
  "https://sonabrief.com",
  "https://www.sonabrief.com",
  "https://app.sonabrief.com",
  "http://localhost:5173",
  "http://localhost:1420",
];

export function corsHeaders(request: Request, _env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

export function handleCorsPreflightRequest(request: Request, _env: Env): Response {
  return new Response(null, { headers: corsHeaders(request, _env) });
}

export function withCors(response: Response, request: Request, _env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, _env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
