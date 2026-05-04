import { json, parseBody } from "./helpers.mjs";

export async function handleWebhookRoutes({
  pathname,
  request,
  response,
  store,
  url,
}) {
  if (request.method === "GET" && pathname === "/api/webhooks/nylas") {
    const challenge = url.searchParams.get("challenge");
    if (challenge) {
      response.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(challenge);
      return true;
    }
    json(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/webhooks/nylas") {
    json(response, 202, await store.handleWebhook(await parseBody(request)));
    return true;
  }

  return false;
}
