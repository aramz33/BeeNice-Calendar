import { Navigate, Outlet } from "react-router";
import { useSession } from "@mvp/lib/session";

export function RequireAuth() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
