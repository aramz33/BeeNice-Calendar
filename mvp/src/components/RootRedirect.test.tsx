import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RootRedirect } from "@mvp/components/RootRedirect";
import { renderWithRouter } from "@mvp/test/router";
import type { Session } from "@mvp/lib/auth";

vi.mock("@mvp/lib/session", () => ({ useSession: vi.fn() }));
import { useSession } from "@mvp/lib/session";

const mockUseSession = vi.mocked(useSession);

const routes = [
  { path: "/", Component: RootRedirect },
  { path: "/login", Component: () => <div>login page</div> },
  { path: "/admin/bookings", Component: () => <div>admin home</div> },
  { path: "/caller", Component: () => <div>caller home</div> },
];

function session(role: "admin" | "caller"): Session {
  return { user: { id: "u1", email: "a@b.com", name: "A", role, active: true } };
}

describe("RootRedirect", () => {
  it("renders nothing while loading", () => {
    mockUseSession.mockReturnValue({ session: null, loading: true, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
    expect(screen.queryByText("admin home")).not.toBeInTheDocument();
    expect(screen.queryByText("caller home")).not.toBeInTheDocument();
  });

  it("redirects to /login when no session", async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("redirects to /admin/bookings when admin", async () => {
    mockUseSession.mockReturnValue({ session: session("admin"), loading: false, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(await screen.findByText("admin home")).toBeInTheDocument();
  });

  it("redirects to /caller when caller", async () => {
    mockUseSession.mockReturnValue({ session: session("caller"), loading: false, refresh: vi.fn() });
    renderWithRouter(routes);
    expect(await screen.findByText("caller home")).toBeInTheDocument();
  });
});
