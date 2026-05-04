import { json, match, parseBody, segment } from "./helpers.mjs";

export async function handleBookRoutes({
  pathname,
  request,
  response,
  store,
  url,
}) {
  if (request.method === "GET" && pathname === "/api/book") {
    json(response, 200, { workspaces: store.listPublicBookingLinks() });
    return true;
  }

  if (request.method === "GET" && match(pathname, /^\/api\/book\/([^/]+)$/)) {
    json(response, 200, store.getPublicBookingPayload(segment(pathname, 3)));
    return true;
  }

  if (
    request.method === "GET" &&
    match(pathname, /^\/api\/book\/([^/]+)\/availability$/)
  ) {
    json(
      response,
      200,
      await store.listAvailability(segment(pathname, 3), url.searchParams.get("companySize"), {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      }),
    );
    return true;
  }

  if (
    request.method === "GET" &&
    match(pathname, /^\/api\/book\/([^/]+)\/callers\/([^/]+)\/bookings$/)
  ) {
    json(
      response,
      200,
      store.listCallerBookings(segment(pathname, 3), segment(pathname, 5)),
    );
    return true;
  }

  if (
    request.method === "GET" &&
    match(pathname, /^\/api\/book\/([^/]+)\/callers\/([^/]+)\/tasks$/)
  ) {
    const slug = segment(pathname, 3);
    const callerId = segment(pathname, 5);
    const bookingLink = store.getBookingLinkBySlug(slug);
    json(
      response,
      200,
      store.listCallerTasks(callerId, bookingLink?.clientId ?? null),
    );
    return true;
  }

  if (
    request.method === "POST" &&
    match(pathname, /^\/api\/book\/([^/]+)\/bookings$/)
  ) {
    json(
      response,
      201,
      await store.createBooking(segment(pathname, 3), await parseBody(request)),
    );
    return true;
  }

  if (
    request.method === "POST" &&
    match(
      pathname,
      /^\/api\/book\/([^/]+)\/callers\/([^/]+)\/bookings\/([^/]+)\/cancel$/,
    )
  ) {
    json(
      response,
      200,
      await store.cancelCallerBooking(
        segment(pathname, 3),
        segment(pathname, 5),
        segment(pathname, 7),
      ),
    );
    return true;
  }

  return false;
}
