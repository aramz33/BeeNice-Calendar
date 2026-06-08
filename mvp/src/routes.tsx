import { createBrowserRouter, Navigate } from "react-router";
import { LoginPage } from "@mvp/pages/LoginPage";
import { BookingWorkspacePage } from "@mvp/pages/BookingWorkspacePage";
import { AdminBookingsPage } from "@mvp/pages/AdminBookingsPage";
import { AdminConnectionsPage } from "@mvp/pages/AdminConnectionsPage";
import { AdminSettingsPage } from "@mvp/pages/AdminSettingsPage";
import { RepConnectPage } from "@mvp/pages/RepConnectPage";
import { RequireAuth } from "@mvp/components/RequireAuth";
import { RequireAdmin } from "@mvp/components/RequireAdmin";
import { RootRedirect } from "@mvp/components/RootRedirect";

export const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
  { path: "/connect/:inviteToken", Component: RepConnectPage },
  { path: "/", Component: RootRedirect },

  {
    Component: RequireAdmin,
    children: [
      { path: "/admin/bookings", Component: AdminBookingsPage },
      { path: "/admin/settings", Component: AdminSettingsPage },
      { path: "/admin/settings/connections", Component: AdminConnectionsPage },
    ],
  },

  {
    Component: RequireAuth,
    children: [{ path: "/book/:slug", Component: BookingWorkspacePage }],
  },

  { path: "*", element: <Navigate to="/" replace /> },
]);
