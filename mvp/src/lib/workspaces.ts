import type { NavigateFunction } from "react-router";

export const WORKSPACE_QUERY_PARAM = "workspace";

export function buildWorkspaceHomeHref(slug: string) {
  const params = new URLSearchParams({
    [WORKSPACE_QUERY_PARAM]: slug,
  });

  return `/?${params.toString()}`;
}

export function openWorkspaceFromHome(
  navigate: NavigateFunction,
  slug: string,
  replace = false,
) {
  navigate(buildWorkspaceHomeHref(slug), { replace });
}
