import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isSharedDriver } from "../utils/helpers";

/** Restrict driver routes to FTL or SHARED service type. */
export function DriverServiceGuard({ allow, children }) {
  const { user } = useAuth();
  const shared = isSharedDriver(user);

  if (allow === "FTL" && shared) {
    return <Navigate to="/driver/shared-trips" replace />;
  }
  if (allow === "SHARED" && !shared) {
    return <Navigate to="/driver/jobs" replace />;
  }

  return children;
}
