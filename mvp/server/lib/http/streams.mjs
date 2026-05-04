import { segment } from "./helpers.mjs";

export function handleBookingStream(pathname, request, response, store) {
  const slug = segment(pathname, 3);
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  response.write(
    `event: availability.updated\ndata: ${JSON.stringify({ slug, at: new Date().toISOString() })}\n\n`,
  );

  const heartbeat = setInterval(() => {
    response.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  store.addSseClient(slug, response);

  request.on("close", () => {
    clearInterval(heartbeat);
    store.removeSseClient(slug, response);
  });
}

export function handleAdminStream(request, response, store) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  response.write(
    `event: booking.updated\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
  );

  const heartbeat = setInterval(() => {
    response.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  store.addAdminSseClient(response);

  request.on("close", () => {
    clearInterval(heartbeat);
    store.removeAdminSseClient(response);
  });
}
