import { createBrowserRouter, Navigate } from "react-router";
import { ShellPage } from "@mvp/pages/ShellPage";
import { BookingWorkspacePage } from "@mvp/pages/BookingWorkspacePage";
import { AdminBookingsPage } from "@mvp/pages/AdminBookingsPage";

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
    path: "/admin/bookings",
    Component: AdminBookingsPage,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
