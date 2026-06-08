import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSession, signIn, signOut } from "@mvp/lib/auth";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getSession", () => {
  it("returns Session when 200 and body.user present", async () => {
    const user = { id: "u1", email: "a@b.com", name: "A", role: "admin" as const, active: true, callerId: null };
    vi.stubGlobal("fetch", mockFetch(200, { user }));
    expect(await getSession()).toEqual({ user });
  });

  it("returns null on 401", async () => {
    vi.stubGlobal("fetch", mockFetch(401, {}));
    expect(await getSession()).toBeNull();
  });

  it("returns null when body.user absent", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { session: {} }));
    expect(await getSession()).toBeNull();
  });
});

describe("signIn", () => {
  it("returns Session on 200", async () => {
    const user = { id: "u1", email: "a@b.com", name: "A", role: "admin" as const, active: true, callerId: null };
    vi.stubGlobal("fetch", mockFetch(200, { user }));
    expect(await signIn("a@b.com", "pass")).toEqual({ user });
  });

  it("throws with server error message on non-200", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { error: "Invalid credentials" }));
    await expect(signIn("a@b.com", "wrong")).rejects.toThrow("Invalid credentials");
  });
});

describe("signOut", () => {
  it("calls POST /api/auth/sign-out", async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await signOut();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
