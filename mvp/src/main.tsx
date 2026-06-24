import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "@mvp/components/ui/sonner";
import { SessionProvider } from "@mvp/lib/session";
import { router } from "@mvp/routes";
import "@mvp/styles.css";

createRoot(document.getElementById("root")!).render(
  <SessionProvider>
    <RouterProvider router={router} />
    <Toaster position="top-right" />
  </SessionProvider>,
);
