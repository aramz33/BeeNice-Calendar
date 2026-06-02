import { createBrowserRouter, Navigate } from "react-router";
import { ShellPage } from "@mvp/pages/ShellPage";
import { BookingWorkspacePage } from "@mvp/pages/BookingWorkspacePage";
import { AdminBookingsPage } from "@mvp/pages/AdminBookingsPage";
import { AdminConnectionsPage } from "@mvp/pages/AdminConnectionsPage";
import { AdminSettingsPage } from "@mvp/pages/AdminSettingsPage";
import { RepConnectPage } from "@mvp/pages/RepConnectPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: ShellPage,
  },
  {
    path: "/book/:slug",
    Component: BookingWorkspacePage,
  },
  {
    path: "/connect/:inviteToken",
    Component: RepConnectPage,
  },
  {
    path: "/admin/bookings",
    Component: AdminBookingsPage,
  },
  {
    path: "/admin/settings",
    Component: AdminSettingsPage,
  },
  {
    path: "/admin/settings/connections",
    Component: AdminConnectionsPage,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
