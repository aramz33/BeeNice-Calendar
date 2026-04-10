import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ThemeProvider } from "@shared-hooks/useTheme";
import { Toaster } from "@shared-ui/sonner";
import { router } from "@mvp/routes";
import "@mvp/styles.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey="benice-mvp-theme">
    <RouterProvider router={router} />
    <Toaster position="top-right" />
  </ThemeProvider>,
);
