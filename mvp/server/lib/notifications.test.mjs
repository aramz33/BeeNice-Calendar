import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationsModule } from "./notifications.mjs";

function fakeRes() {
  const written = [];
  return { write(p) { written.push(p); }, written };
}

test("addSseClient + broadcastAvailability sends payload to client", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const res = fakeRes();
  mod.addSseClient("slug1", res);
  mod.broadcastAvailability("slug1");
  assert.equal(res.written.length, 1);
  assert.ok(res.written[0].includes("event: availability.updated"));
  assert.ok(res.written[0].includes('"slug":"slug1"'));
});

test("broadcastAvailability with no registered clients is a no-op", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  assert.doesNotThrow(() => mod.broadcastAvailability("unknown-slug"));
});

test("removeSseClient stops receiving broadcasts", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const res = fakeRes();
  mod.addSseClient("slug1", res);
  mod.removeSseClient("slug1", res);
  mod.broadcastAvailability("slug1");
  assert.equal(res.written.length, 0);
});

test("broadcastAvailability with empty client set after remove is a no-op", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const res = fakeRes();
  mod.addSseClient("s", res);
  mod.removeSseClient("s", res);
  assert.doesNotThrow(() => mod.broadcastAvailability("s"));
});

test("multiple clients on same slug all receive broadcast", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const a = fakeRes();
  const b = fakeRes();
  mod.addSseClient("slug", a);
  mod.addSseClient("slug", b);
  mod.broadcastAvailability("slug");
  assert.equal(a.written.length, 1);
  assert.equal(b.written.length, 1);
});

test("addAdminSseClient + broadcastAdmin sends payload", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const res = fakeRes();
  mod.addAdminSseClient(res);
  mod.broadcastAdmin("booking.updated");
  assert.equal(res.written.length, 1);
  assert.ok(res.written[0].includes("event: booking.updated"));
});

test("broadcastAdmin uses default event name when omitted", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const res = fakeRes();
  mod.addAdminSseClient(res);
  mod.broadcastAdmin();
  assert.ok(res.written[0].includes("event: booking.updated"));
});

test("broadcastAdmin with no admin clients is a no-op", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  assert.doesNotThrow(() => mod.broadcastAdmin());
});

test("removeAdminSseClient stops receiving admin broadcasts", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const res = fakeRes();
  mod.addAdminSseClient(res);
  mod.removeAdminSseClient(res);
  mod.broadcastAdmin();
  assert.equal(res.written.length, 0);
});

test("broadcastClientAvailability broadcasts to all links and sends connections.updated", () => {
  const links = [{ slug: "link-a" }, { slug: "link-b" }];
  const mod = createNotificationsModule({ listBookingLinksForClient: () => links });
  const a = fakeRes();
  const b = fakeRes();
  const admin = fakeRes();
  mod.addSseClient("link-a", a);
  mod.addSseClient("link-b", b);
  mod.addAdminSseClient(admin);
  mod.broadcastClientAvailability("client-1");
  assert.equal(a.written.length, 1);
  assert.equal(b.written.length, 1);
  assert.equal(admin.written.length, 1);
  assert.ok(admin.written[0].includes("connections.updated"));
});

test("broadcastClientAvailability with no links sends only connections.updated", () => {
  const mod = createNotificationsModule({ listBookingLinksForClient: () => [] });
  const admin = fakeRes();
  mod.addAdminSseClient(admin);
  mod.broadcastClientAvailability("client-x");
  assert.equal(admin.written.length, 1);
  assert.ok(admin.written[0].includes("connections.updated"));
});
