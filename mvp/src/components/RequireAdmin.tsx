import { Navigate, Outlet } from "react-router";
import { useSession } from "@mvp/lib/session";

export function RequireAdmin() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "admin") return <Navigate to="/caller" replace />;
  return <Outlet />;
}
