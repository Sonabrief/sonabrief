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
import { handleCheckout } from "./routes/checkout";
import { handleLemonsqueezyWebhook } from "./routes/webhooks";
import { handlePolarCheckout } from "./routes/checkout-polar";
import { handlePolarWebhook } from "./routes/webhooks-polar";
import { handleBillingStatus, handleBillingPortal } from "./routes/billing";
import { handleAdminStats } from "./routes/admin";
import { handleGetPreferences, handleSavePreferences } from "./routes/preferences";
import { handleDeleteAccount } from "./routes/account";
import { handleRetentionCleanup } from "./routes/cron-retention";
import { handleGoogleStart, handleGoogleCallback, handleCalendarEvents, handleCalendarDisconnect, handleMicrosoftStart, handleMicrosoftCallback, handleMicrosoftCalendarEvents, handleMicrosoftDisconnect } from "./routes/calendar";
import {
  handleWebAuthnRegisterOptions,
  handleWebAuthnRegisterVerify,
  handleWebAuthnAuthenticateOptions,
  handleWebAuthnAuthenticateVerify,
  handleWebAuthnList,
  handleWebAuthnDelete,
} from "./routes/webauthn";

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
    } else if (url.pathname === "/auth/webauthn/register/options" && request.method === "POST") {
      response = await handleWebAuthnRegisterOptions(request, env);
    } else if (url.pathname === "/auth/webauthn/register/verify" && request.method === "POST") {
      response = await handleWebAuthnRegisterVerify(request, env);
    } else if (url.pathname === "/auth/webauthn/authenticate/options" && request.method === "POST") {
      response = await handleWebAuthnAuthenticateOptions(request, env);
    } else if (url.pathname === "/auth/webauthn/authenticate/verify" && request.method === "POST") {
      response = await handleWebAuthnAuthenticateVerify(request, env);
    } else if (url.pathname === "/auth/webauthn/credentials" && request.method === "GET") {
      response = await handleWebAuthnList(request, env);
    } else if (url.pathname === "/auth/webauthn/credentials" && request.method === "DELETE") {
      response = await handleWebAuthnDelete(request, env);
    } else if (url.pathname === "/v1/synthesize" && request.method === "POST") {
      response = await handleSynthesize(request, env);
    } else if (url.pathname.startsWith("/v1/templates")) {
      response = await handleTemplates(request, env);
    } else if (url.pathname === "/v1/sync/upload" && request.method === "POST") {
      response = await handleSyncUpload(request, env);
    } else if (url.pathname === "/v1/sync/download" && request.method === "POST") {
      response = await handleSyncDownload(request, env);
    } else if (url.pathname === "/v1/checkout" && request.method === "POST") {
      response = await handleCheckout(request, env);
    } else if (url.pathname === "/v1/billing/status" && request.method === "GET") {
      response = await handleBillingStatus(request, env);
    } else if (url.pathname === "/v1/billing/portal" && request.method === "GET") {
      response = await handleBillingPortal(request, env);
    } else if (url.pathname === "/v1/webhooks/lemonsqueezy" && request.method === "POST") {
      response = await handleLemonsqueezyWebhook(request, env);
    } else if (url.pathname === "/v1/checkout/polar" && request.method === "POST") {
      response = await handlePolarCheckout(request, env);
    } else if (url.pathname === "/v1/webhooks/polar" && request.method === "POST") {
      response = await handlePolarWebhook(request, env);
    } else if (url.pathname === "/admin/stats" && request.method === "GET") {
      response = await handleAdminStats(request, env);
    } else if (url.pathname === '/v1/preferences' && request.method === 'GET') {
      response = await handleGetPreferences(request, env)
    } else if (url.pathname === '/v1/preferences' && request.method === 'POST') {
      response = await handleSavePreferences(request, env)
    } else if (url.pathname === '/auth/google/start' && request.method === 'GET') {
      response = await handleGoogleStart(request, env)
    } else if (url.pathname === '/auth/google/callback' && request.method === 'GET') {
      response = await handleGoogleCallback(request, env)
    } else if (url.pathname === '/v1/calendar/events' && request.method === 'GET') {
      response = await handleCalendarEvents(request, env)
    } else if (url.pathname === '/v1/calendar/disconnect' && request.method === 'POST') {
      response = await handleCalendarDisconnect(request, env)
    } else if (url.pathname === '/auth/microsoft/start' && request.method === 'GET') {
      response = await handleMicrosoftStart(request, env)
    } else if (url.pathname === '/auth/microsoft/callback' && request.method === 'GET') {
      response = await handleMicrosoftCallback(request, env)
    } else if (url.pathname === '/v1/calendar/microsoft/events' && request.method === 'GET') {
      response = await handleMicrosoftCalendarEvents(request, env)
    } else if (url.pathname === '/v1/calendar/microsoft/disconnect' && request.method === 'POST') {
      response = await handleMicrosoftDisconnect(request, env)
    } else if (url.pathname === '/v1/account' && request.method === 'DELETE') {
      response = await handleDeleteAccount(request, env)
    } else {
      response = new Response("Not found", { status: 404 });
    }

    return withCors(response, request, env);
  },
};

export const scheduled: ExportedHandlerScheduledHandler<Env> = async (
  _event,
  env,
  _ctx
) => {
  await handleRetentionCleanup(env);
};