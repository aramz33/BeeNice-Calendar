import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppChrome } from "@mvp/components/AppChrome";
import { renderWithRouter } from "@mvp/test/router";
import type { Session } from "@mvp/lib/auth";

vi.mock("@mvp/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@mvp/lib/session", () => ({ useSession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { signOut } from "@mvp/lib/auth";
import { useSession } from "@mvp/lib/session";
import { toast } from "sonner";

const mockSignOut = vi.mocked(signOut);
const mockUseSession = vi.mocked(useSession);

function adminSession(): Session {
  return {
    user: {
      id: "u1",
      email: "julien@beeniceagency.com",
      name: "Julien Bouic",
      role: "admin",
      active: true,
      callerId: null,
    },
  };
}

describe("AppChrome", () => {
  it("shows an error and keeps the page mounted when sign-out fails", async () => {
    mockUseSession.mockReturnValue({
      session: adminSession(),
      loading: false,
      refresh: vi.fn(),
    });
    mockSignOut.mockRejectedValue(new Error("sign-out failed: 403"));

    renderWithRouter(
      [
        {
          path: "/admin/bookings",
          Component: () => (
            <AppChrome title="Admin">
              <div>admin content</div>
            </AppChrome>
          ),
        },
      ],
      { initialEntries: ["/admin/bookings"] },
    );

    await userEvent.click(screen.getByRole("button", { name: /déconnexion/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("sign-out failed: 403");
    });
    expect(screen.getByText("admin content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /déconnexion/i })).toBeEnabled();
  });
});
