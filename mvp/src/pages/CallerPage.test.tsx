import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallerPage } from "@mvp/pages/CallerPage";
import { renderWithRouter } from "@mvp/test/router";
import type { Session } from "@mvp/lib/auth";

vi.mock("@mvp/lib/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  TASKS_MODAL_SHOWN_KEY: "benice-tasks-modal-shown",
}));
vi.mock("@mvp/lib/session", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useSession } from "@mvp/lib/session";

const mockUseSession = vi.mocked(useSession);

const callerSession: Session = {
  user: {
    id: "u2",
    email: "colleur@beeniceagency.com",
    name: "Clotilde",
    role: "caller",
    active: true,
    callerId: "caller-clotilde",
  },
};

const routes = [{ path: "/caller", Component: CallerPage }];

function mockFetch(url: string, data: unknown) {
  return vi.fn().mockImplementation((input: string) => {
    if (input === url) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(data),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });
}

class MockEventSource {
  addEventListener = vi.fn();
  close = vi.fn();
  onerror: null | (() => void) = null;
}

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  mockUseSession.mockReturnValue({
    session: callerSession,
    loading: false,
    refresh: vi.fn(),
  });
  vi.stubGlobal("EventSource", MockEventSource);
});

describe("CallerPage — chargement workspaces", () => {
  it("affiche le filtre client après chargement des workspaces", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch("/api/caller/workspaces", {
        workspaces: [
          {
            id: "w1",
            name: "TeamStarter",
            slug: "teamstarter-discovery",
            timezone: "Europe/Paris",
          },
          {
            id: "w2",
            name: "DJ Format",
            slug: "djformat-discovery",
            timezone: "Europe/Paris",
          },
        ],
      }),
    );

    renderWithRouter(routes, { initialEntries: ["/caller"] });

    // Radix Select ne rend pas ses options dans JSDOM sans portail réel.
    // Vérifier que le combobox est actif prouve que le loading est terminé.
    const combobox = await screen.findByRole("combobox");
    await waitFor(() => expect(combobox).not.toBeDisabled());
  });

  it("affiche un message vide si aucun workspace sélectionné", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch("/api/caller/workspaces", { workspaces: [] }),
    );

    renderWithRouter(routes, { initialEntries: ["/caller"] });

    // Zone calendrier vide avec message
    expect(
      await screen.findByText(
        /sélectionnez un client pour voir les disponibilités/i,
      ),
    ).toBeInTheDocument();
  });
});

describe("CallerPage — sélection workspace", () => {
  it("affiche le formulaire prospect après sélection d'un workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input === "/api/caller/workspaces") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                workspaces: [
                  {
                    id: "w1",
                    name: "TeamStarter",
                    slug: "teamstarter-discovery",
                    timezone: "Europe/Paris",
                  },
                ],
              }),
          });
        }
        if (input.includes("/api/caller/tasks")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ tasks: [] }),
          });
        }
        if (input.includes("/availability")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                slots: [],
                timezone: "Europe/Paris",
                windowStart: "2026-06-09T00:00:00.000Z",
                windowEnd: "2026-06-15T23:59:59.999Z",
                maxWindowEnd: "2026-09-07T23:59:59.999Z",
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }),
    );

    renderWithRouter(routes, {
      initialEntries: ["/caller?workspace=teamstarter-discovery"],
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/prénom/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^nom \*$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/entreprise/i)).toBeInTheDocument();
  });
});

describe("CallerPage — modal tâches", () => {
  it("affiche le modal si des tâches ouvertes existent et sessionStorage vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input === "/api/caller/workspaces") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ workspaces: [] }),
          });
        }
        if (input.includes("/api/caller/tasks")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                tasks: [
                  {
                    id: "t1",
                    prospectName: "Alice Dupont",
                    companyName: "Acme",
                    sourceStartAt: "2026-06-10T09:00:00Z",
                    triggerReason: "cancelled",
                    clientId: "c1",
                    clientName: "TeamStarter",
                    callerId: "caller-clotilde",
                    callerName: "Clotilde",
                    status: "open",
                    type: "reposition_booking",
                    sourceBookingId: "b1",
                    dueAt: "2026-06-11T09:00:00Z",
                    createdAt: "2026-06-09T09:00:00Z",
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }),
    );

    renderWithRouter(routes, { initialEntries: ["/caller"] });

    expect(await screen.findByText("Alice Dupont")).toBeInTheDocument();
    expect(screen.getByText(/repositionner/i)).toBeInTheDocument();
  });

  it("n'affiche pas le modal si sessionStorage flag présent", async () => {
    sessionStorage.setItem("benice-tasks-modal-shown", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input === "/api/caller/workspaces") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ workspaces: [] }),
          });
        }
        if (input.includes("/api/caller/tasks")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                tasks: [
                  {
                    id: "t1",
                    prospectName: "Alice Dupont",
                    companyName: "Acme",
                    sourceStartAt: "2026-06-10T09:00:00Z",
                    triggerReason: "cancelled",
                    clientId: "c1",
                    clientName: "TeamStarter",
                    callerId: "caller-clotilde",
                    callerName: "Clotilde",
                    status: "open",
                    type: "reposition_booking",
                    sourceBookingId: "b1",
                    dueAt: "2026-06-11T09:00:00Z",
                    createdAt: "2026-06-09T09:00:00Z",
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }),
    );

    renderWithRouter(routes, { initialEntries: ["/caller"] });

    await waitFor(() => {
      expect(screen.queryByText("Alice Dupont")).not.toBeInTheDocument();
    });
  });
});
