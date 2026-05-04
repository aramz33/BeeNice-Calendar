import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ThemeProvider } from "@mvp/hooks/useTheme";
import { Toaster } from "@mvp/components/ui/sonner";
import { router } from "@mvp/routes";
import "@mvp/styles.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="benice-mvp-theme">
    <RouterProvider router={router} />
    <Toaster position="top-right" />
  </ThemeProvider>,
);
