import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "@mvp/pages/LoginPage";
import { renderWithRouter } from "@mvp/test/router";
import type { Session } from "@mvp/lib/auth";

vi.mock("@mvp/lib/auth", () => ({ signIn: vi.fn(), signOut: vi.fn(), getSession: vi.fn() }));
vi.mock("@mvp/lib/session", () => ({ useSession: vi.fn(), SessionProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { signIn } from "@mvp/lib/auth";
import { useSession } from "@mvp/lib/session";
import { toast } from "sonner";

const mockSignIn = vi.mocked(signIn);
const mockUseSession = vi.mocked(useSession);

const routes = [
  { path: "/login", Component: LoginPage },
  { path: "/admin/bookings", Component: () => <div>admin home</div> },
  { path: "/caller", Component: () => <div>caller home</div> },
];

function session(role: "admin" | "caller"): Session {
  return { user: { id: "u1", email: "a@b.com", name: "A", role, active: true } };
}

describe("LoginPage", () => {
  it("redirects to /admin/bookings when already logged in as admin", async () => {
    mockUseSession.mockReturnValue({ session: session("admin"), loading: false, refresh: vi.fn() });
    renderWithRouter(routes, { initialEntries: ["/login"] });
    expect(await screen.findByText("admin home")).toBeInTheDocument();
  });

  it("redirects to /caller when already logged in as caller", async () => {
    mockUseSession.mockReturnValue({ session: session("caller"), loading: false, refresh: vi.fn() });
    renderWithRouter(routes, { initialEntries: ["/login"] });
    expect(await screen.findByText("caller home")).toBeInTheDocument();
  });

  it("calls signIn and redirects by role on submit", async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false, refresh: vi.fn() });
    mockSignIn.mockResolvedValue(session("admin"));
    renderWithRouter(routes, { initialEntries: ["/login"] });

    await userEvent.type(await screen.findByLabelText("Email"), "julien@beeniceagency.com");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "pass");
    await userEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(mockSignIn).toHaveBeenCalledWith("julien@beeniceagency.com", "pass");
    expect(await screen.findByText("admin home")).toBeInTheDocument();
  });

  it("shows error toast when signIn throws", async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false, refresh: vi.fn() });
    mockSignIn.mockRejectedValue(new Error("Identifiants incorrects."));
    renderWithRouter(routes, { initialEntries: ["/login"] });

    await userEvent.type(await screen.findByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(await vi.mocked(toast.error)).toHaveBeenCalledWith("Identifiants incorrects.");
  });
});
