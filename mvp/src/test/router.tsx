import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { RouteObject } from "react-router";

export function renderWithRouter(
  routes: RouteObject[],
  { initialEntries = ["/"] }: { initialEntries?: string[] } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries });
  render(<RouterProvider router={router} />);
  return router;
}
