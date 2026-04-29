import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@shared-ui/button";
import { AppChrome } from "@mvp/components/AppChrome";
import { apiFetch } from "@mvp/lib/api";
import type { PublicWorkspace, PublicWorkspacesResponse } from "@mvp/lib/types";
import { WORKSPACE_QUERY_PARAM } from "@mvp/lib/workspaces";

export function ShellPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    apiFetch<PublicWorkspacesResponse>("/api/book")
      .then((data) => {
        if (ignore) {
          return;
        }
        setWorkspaces(data.workspaces ?? []);
      })
      .catch((error) => {
        if (!ignore) {
          toast.error(error.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const requestedWorkspace = searchParams.get(WORKSPACE_QUERY_PARAM)?.trim();
    if (!requestedWorkspace || loading) {
      return;
    }

    const workspace = workspaces.find((entry) => entry.slug === requestedWorkspace);
    if (workspace) {
      navigate(`/book/${workspace.slug}`, { replace: true });
    }
  }, [loading, navigate, searchParams, workspaces]);

  return (
    <AppChrome title="Be nice agenda hub">
      <div className="mx-auto flex min-h-[calc(100vh-13rem)] max-w-2xl items-center justify-center">
        <div className="surface-card w-full rounded-[2rem] px-6 py-8 md:px-8 md:py-10">
          <div className="space-y-4">
            {loading ? (
              Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-full bg-[#001E5B]/5"
                />
              ))
            ) : workspaces.length ? (
              workspaces.map((workspace) => (
                <Button
                  key={workspace.id}
                  asChild
                  size="lg"
                  className="w-full rounded-full px-6"
                >
                  <Link to={`/book/${workspace.slug}`}>
                    Workspace caller · {workspace.clientName}
                  </Link>
                </Button>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[#001E5B]/12 px-4 py-8 text-center text-sm text-[#001E5B]/44">
                Aucun workspace public n'est disponible.
              </div>
            )}

            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full rounded-full px-6"
            >
              <Link to="/admin/bookings">Console admin</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppChrome>
  );
}
