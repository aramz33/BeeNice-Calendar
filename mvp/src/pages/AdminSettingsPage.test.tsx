import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSettingsPage } from "@mvp/pages/AdminSettingsPage";
import { renderWithRouter } from "@mvp/test/router";
import type { SettingsPayload } from "@mvp/lib/types";

vi.mock("@mvp/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@mvp/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@mvp/lib/session", () => ({ useSession: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { apiFetch } from "@mvp/lib/api";
import { useSession } from "@mvp/lib/session";

const mockApiFetch = vi.mocked(apiFetch);
const mockUseSession = vi.mocked(useSession);

function settingsPayload(): SettingsPayload {
  return {
    clients: [
      {
        id: "client-1",
        name: "Doctolib",
        timezone: "Europe/Paris",
        connectionInviteToken: "invite-existing",
        routingMode: "pool_unique",
        repConnectionFormConfig: [],
        primaryContactFirstName: "Camille",
        primaryContactLastName: "Durand",
        primaryContactPhone: "+33611223344",
        primaryContactEmail: "camille@doctolib.com",
        active: true,
      },
    ],
    callers: [],
  };
}

function fillForm(values: {
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}) {
  return (async () => {
    await userEvent.type(screen.getByLabelText("Entreprise"), values.name);
    await userEvent.type(
      screen.getByLabelText("Prénom du responsable commercial"),
      values.firstName,
    );
    await userEvent.type(
      screen.getByLabelText("Nom du responsable commercial"),
      values.lastName,
    );
    await userEvent.type(screen.getByLabelText("Téléphone"), values.phone);
    await userEvent.type(screen.getByLabelText("Email"), values.email);
  })();
}

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  mockUseSession.mockReturnValue({
    session: null,
    loading: false,
    refresh: vi.fn(),
  });
  mockApiFetch.mockImplementation(async (input: string) => {
    if (input === "/api/admin/settings") return settingsPayload();
    return undefined;
  });
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AdminSettingsPage", () => {
  it("renders the five required client fields", async () => {
    renderWithRouter([{ path: "/", Component: AdminSettingsPage }]);

    expect(await screen.findByLabelText("Entreprise")).toBeRequired();
    expect(
      screen.getByLabelText("Prénom du responsable commercial"),
    ).toBeRequired();
    expect(
      screen.getByLabelText("Nom du responsable commercial"),
    ).toBeRequired();
    expect(screen.getByLabelText("Téléphone")).toBeRequired();
    expect(screen.getByLabelText("Email")).toBeRequired();
  });

  it("submits the five contact fields and no timezone/routing", async () => {
    renderWithRouter([{ path: "/", Component: AdminSettingsPage }]);
    await screen.findByLabelText("Entreprise");

    await fillForm({
      name: "Alan",
      firstName: "Marie",
      lastName: "Martin",
      phone: "+33712345678",
      email: "marie@alan.com",
    });
    await userEvent.click(screen.getAllByRole("button", { name: "Ajouter" })[0]);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/admin/settings/clients",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const postCall = mockApiFetch.mock.calls.find(
      ([url]) => url === "/api/admin/settings/clients",
    );
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(body).toEqual({
      name: "Alan",
      primaryContactFirstName: "Marie",
      primaryContactLastName: "Martin",
      primaryContactPhone: "+33712345678",
      primaryContactEmail: "marie@alan.com",
    });
    expect(body).not.toHaveProperty("timezone");
    expect(body).not.toHaveProperty("routingMode");
  });

  it("warns on duplicate email and skips POST when cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithRouter([{ path: "/", Component: AdminSettingsPage }]);
    await screen.findByLabelText("Entreprise");

    await fillForm({
      name: "Doctolib 2",
      firstName: "Marie",
      lastName: "Martin",
      phone: "+33712345678",
      email: "Camille@Doctolib.com",
    });
    await userEvent.click(screen.getAllByRole("button", { name: "Ajouter" })[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(
      mockApiFetch.mock.calls.some(
        ([url]) => url === "/api/admin/settings/clients",
      ),
    ).toBe(false);
    confirmSpy.mockRestore();
  });

  it("posts on duplicate email when confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithRouter([{ path: "/", Component: AdminSettingsPage }]);
    await screen.findByLabelText("Entreprise");

    await fillForm({
      name: "Doctolib 2",
      firstName: "Marie",
      lastName: "Martin",
      phone: "+33712345678",
      email: "camille@doctolib.com",
    });
    await userEvent.click(screen.getAllByRole("button", { name: "Ajouter" })[0]);

    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.some(
          ([url]) => url === "/api/admin/settings/clients",
        ),
      ).toBe(true),
    );
    confirmSpy.mockRestore();
  });

  it("shows the contact and copies the absolute rep link from a client row", async () => {
    renderWithRouter([{ path: "/", Component: AdminSettingsPage }]);

    expect(await screen.findByText("Doctolib")).toBeInTheDocument();
    expect(
      screen.getByText(/Responsable commercial : Camille Durand/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/camille@doctolib\.com · \+33611223344/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Copier le lien rep/ }),
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/connect/invite-existing"),
      ),
    );
    expect(writeText.mock.calls[0][0]).toMatch(
      /^https?:\/\/.+\/connect\/invite-existing$/,
    );
  });
});
