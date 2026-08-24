import { Navigate, Outlet } from "react-router-dom";
import { usePublisherAuth } from "../context/PublisherAuthContext.jsx";

export default function ProtectedPublisherRoute() {
  const { isAuthenticated } = usePublisherAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
