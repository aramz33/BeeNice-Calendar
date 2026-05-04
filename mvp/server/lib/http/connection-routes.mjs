import { json, match, parseBody, segment } from "./helpers.mjs";

export async function handleConnectionRoutes({
  pathname,
  request,
  response,
  store,
}) {
  if (request.method === "GET" && match(pathname, /^\/api\/connect\/([^/]+)$/)) {
    json(response, 200, store.getPublicRepConnectionPayload(segment(pathname, 3)));
    return true;
  }

  if (
    request.method === "POST" &&
    match(pathname, /^\/api\/connect\/([^/]+)\/start$/)
  ) {
    json(
      response,
      200,
      await store.startPublicRepConnection(
        segment(pathname, 3),
        await parseBody(request),
      ),
    );
    return true;
  }

  return false;
}
