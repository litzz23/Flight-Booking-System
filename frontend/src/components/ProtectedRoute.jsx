import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  redirectTo = "/auth",
}) {
  const { user, adminUser, loading } = useAuth();
  const location = useLocation();
  const from = {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  };

  if (loading) return null;
  if (requireAdmin) {
    if (!adminUser || adminUser.role !== "admin") {
      return <Navigate to={redirectTo} replace state={{ from }} />;
    }
    return children;
  }
  if (!user || user.role !== "user") {
    return <Navigate to={redirectTo} replace state={{ from }} />;
  }
  return children;
}
