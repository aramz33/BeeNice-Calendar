import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequireAuth } from "@mvp/components/RequireAuth";
import { renderWithRouter } from "@mvp/test/router";
import type { Session } from "@mvp/lib/auth";

vi.mock("@mvp/lib/session", () => ({ useSession: vi.fn() }));
import { useSession } from "@mvp/lib/session";

const mockUseSession = vi.mocked(useSession);

const routes = [
  {
    Component: RequireAuth,
    children: [{ index: true, Component: () => <div>protected</div> }],
  },
  { path: "/login", Component: () => <div>login page</div> },
];

function session(role: "admin" | "caller"): Session {
  return { user: { id: "u1", email: "a@b.com", name: "A", role, active: true } };
}

describe("RequireAuth", () => {
  it("renders nothing while loading", () => {
    mockUseSession.mockReturnValue({ session: null, loading: true, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("redirects to /login when no session", async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("renders outlet when session present", async () => {
    mockUseSession.mockReturnValue({ session: session("admin"), loading: false, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(await screen.findByText("protected")).toBeInTheDocument();
  });
});
