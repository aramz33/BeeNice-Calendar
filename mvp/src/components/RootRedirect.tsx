import { Navigate } from "react-router";
import { useSession } from "@mvp/lib/session";

export function RootRedirect() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role === "admin") return <Navigate to="/admin/bookings" replace />;
  return <Navigate to="/caller" replace />;
}
